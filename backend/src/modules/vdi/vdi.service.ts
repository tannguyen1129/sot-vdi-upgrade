import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import Redis from 'ioredis';
import Docker from 'dockerode';
import * as crypto from 'crypto';
import * as os from 'os';
import { WorkerRegistryService } from './worker-registry.service';

interface ResourceProfile {
  memoryMb: number;
  cpu: number;
  shmMb: number;
}

interface ContainerRuntimeInfo {
  ip: string;
  containerId: string;
  containerName: string;
}

interface AllocateOptions {
  forceLocal?: boolean;
}

interface DestroyOptions {
  forceLocal?: boolean;
}

interface PrewarmOptions {
  forceLocal?: boolean;
}

interface SchedulableWorker {
  code: string;
  name: string;
  apiBaseUrl: string | null;
  isEnabled: boolean;
  isDraining: boolean;
  healthy: boolean;
  activeSessions: number;
  maxSessions: number;
  availableSessions: number;
}

export interface DispatchReconcileResult {
  scanned: number;
  cleaned: number;
  malformed: number;
  staleWithoutSession: number;
  remoteSessionCountersFixed: number;
  affinityFixed: number;
  mode: 'manual' | 'auto';
}

@Injectable()
export class VdiService {
  private readonly logger = new Logger(VdiService.name);
  private redis: Redis;
  private docker: Docker;
  private dispatchCleanupRunning = false;
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;
  private readonly vmUsername: string;
  private readonly vmPassword: string;

  constructor(
    private configService: ConfigService,
    private workerRegistryService: WorkerRegistryService,
  ) {
    const rawKey =
      this.configService.get<string>('GUAC_TOKEN_KEY') ||
      '12345678901234567890123456789012';
    const keyBuffer = Buffer.from(rawKey, 'utf8');
    this.key =
      keyBuffer.length === 32
        ? keyBuffer
        : crypto.createHash('sha256').update(rawKey).digest();
    this.vmUsername =
      this.configService.get<string>('EXAM_VM_USERNAME') || 'student';
    this.vmPassword =
      this.configService.get<string>('EXAM_VM_PASSWORD') || '123456';

    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST') || 'umt_redis',
      port: 6379,
    });
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  private sessionKey(userId: number, examId: number): string {
    return `vdi:session:exam:${examId}:user:${userId}`;
  }

  private poolAvailableKey(examId: number): string {
    return `vdi:pool:exam:${examId}:available`;
  }

  private dispatchKey(userId: number, examId: number): string {
    return `vdi:dispatch:exam:${examId}:user:${userId}`;
  }

  private examStickyWorkerKey(examId: number): string {
    return `vdi:sticky:exam:${examId}:worker`;
  }

  private examWorkerAffinityKey(examId: number): string {
    return `vdi:sticky:exam:${examId}:affinity`;
  }

  private localWorkerCode(): string {
    return (
      this.configService.get<string>('WORKER_CODE') || `local-${os.hostname()}`
    );
  }

  private clusterToken(): string {
    return (
      this.configService.get<string>('WORKER_CLUSTER_TOKEN') ||
      this.configService.get<string>('WORKER_HEARTBEAT_TOKEN') ||
      ''
    );
  }

  private stickyTtlSec(): number {
    const raw = Number(
      this.configService.get<string>('WORKER_STICKY_EXAM_TTL_SEC') || '21600',
    );
    return Number.isFinite(raw) && raw > 60 ? raw : 21600;
  }

  private dispatchStaleSec(): number {
    const raw = Number(
      this.configService.get<string>('WORKER_DISPATCH_STALE_SEC') || '21600',
    );
    return Number.isFinite(raw) && raw > 300 ? raw : 21600;
  }

  private dispatchScanCount(): number {
    const raw = Number(
      this.configService.get<string>('WORKER_DISPATCH_SCAN_COUNT') || '200',
    );
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 2000) : 200;
  }

  private allocateRetryCount(): number {
    const raw = Number(
      this.configService.get<string>('WORKER_ALLOCATE_RETRY_COUNT') || '3',
    );
    return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 10) : 3;
  }

  private dispatchCleanupEnabled(): boolean {
    const raw = String(
      this.configService.get<string>('WORKER_DISPATCH_CLEANUP_ENABLED') ||
        'true',
    ).toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
  }

  private parseDispatchKey(
    key: string,
  ): { examId: number; userId: number } | null {
    const match = key.match(/^vdi:dispatch:exam:(\d+):user:(\d+)$/);
    if (!match) return null;
    const examId = Number(match[1]);
    const userId = Number(match[2]);
    if (!Number.isFinite(examId) || !Number.isFinite(userId)) return null;
    return { examId, userId };
  }

  private async applyExamWorkerAffinity(
    examId: number,
    workerCode: string,
    delta: number,
  ) {
    if (!workerCode || !Number.isFinite(delta) || delta === 0) return;

    const affinityKey = this.examWorkerAffinityKey(examId);
    const next = await this.redis.hincrby(
      affinityKey,
      workerCode,
      Math.floor(delta),
    );
    if (next <= 0) {
      await this.redis.hdel(affinityKey, workerCode);
    }
    await this.redis.expire(affinityKey, this.stickyTtlSec());
  }

  private async pickWorkerForExam(
    examId: number,
    workers: SchedulableWorker[],
  ): Promise<SchedulableWorker | null> {
    if (!workers.length) return null;

    const stickyKey = this.examStickyWorkerKey(examId);
    const stickyCode = await this.redis.get(stickyKey);
    if (stickyCode) {
      const stickyWorker = workers.find((w) => w.code === stickyCode);
      if (stickyWorker) {
        return stickyWorker;
      }
      await this.redis.del(stickyKey);
    }

    const affinityRaw = await this.redis.hgetall(
      this.examWorkerAffinityKey(examId),
    );
    let affinityCandidate: SchedulableWorker | null = null;
    let bestAffinity = -1;
    for (const worker of workers) {
      const affinity = Number(affinityRaw[worker.code] || 0);
      if (affinity > bestAffinity) {
        bestAffinity = affinity;
        affinityCandidate = worker;
      }
    }
    if (affinityCandidate && bestAffinity > 0) {
      await this.redis.set(
        stickyKey,
        affinityCandidate.code,
        'EX',
        this.stickyTtlSec(),
      );
      return affinityCandidate;
    }

    const selected = workers[0];
    await this.redis.set(stickyKey, selected.code, 'EX', this.stickyTtlSec());
    return selected;
  }

  private async workerCandidatesForExam(
    examId: number,
    workers: SchedulableWorker[],
  ): Promise<SchedulableWorker[]> {
    if (!workers.length) return [];
    const sticky = await this.pickWorkerForExam(examId, workers);
    if (!sticky) return workers;
    return [sticky, ...workers.filter((worker) => worker.code !== sticky.code)];
  }

  private async callWorkerApi<T>(
    apiBaseUrl: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const url = `${base}${path}`;
    const timeoutMsRaw = Number(
      this.configService.get<string>('CLUSTER_API_TIMEOUT_MS') || '15000',
    );
    const timeoutMs =
      Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 1000
        ? timeoutMsRaw
        : 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.clusterToken()
            ? { 'x-cluster-token': this.clusterToken() }
            : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Worker API ${url} failed ${res.status}: ${text}`);
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async countActiveSessions(): Promise<number> {
    const keys = await this.redis.keys('vdi:session:exam:*:user:*');
    return keys.length;
  }

  private async syncLocalWorkerHeartbeat(profile?: ResourceProfile) {
    const resourceProfile = profile || this.buildResourceProfile();
    const activeSessions = await this.countActiveSessions();
    await this.workerRegistryService.refreshLocalWorkerSnapshot(
      activeSessions,
      resourceProfile.cpu,
      resourceProfile.memoryMb,
    );
  }

  private buildResourceProfile(): ResourceProfile {
    const memoryMbRaw = Number(
      this.configService.get<string>('EXAM_VM_MEMORY_MB') || '2048',
    );
    const cpuRaw = Number(
      this.configService.get<string>('EXAM_VM_CPUS') || '1.5',
    );
    const shmMbRaw = Number(
      this.configService.get<string>('EXAM_VM_SHM_MB') || '512',
    );

    return {
      memoryMb:
        Number.isFinite(memoryMbRaw) && memoryMbRaw > 0 ? memoryMbRaw : 2048,
      cpu: Number.isFinite(cpuRaw) && cpuRaw > 0 ? cpuRaw : 1.5,
      shmMb: Number.isFinite(shmMbRaw) && shmMbRaw > 0 ? shmMbRaw : 512,
    };
  }

  private async resolveExamNetworkName(): Promise<string> {
    const networks = await this.docker.listNetworks();
    const examNetObj = networks.find((n) => n.Name.includes('exam_net'));
    if (!examNetObj) {
      throw new Error('Không tìm thấy mạng exam_net!');
    }
    return examNetObj.Name;
  }

  private async ensureTargetImage(imageName: string): Promise<string> {
    const targetImage = await this.docker.getImage(imageName).inspect();
    return targetImage.Id;
  }

  private async extractContainerIp(
    container: Docker.Container,
    networkName: string,
  ): Promise<string | null> {
    const data = await container.inspect();
    let ip = data.NetworkSettings.Networks[networkName]?.IPAddress;
    if (!ip) {
      const anyNet = Object.values(data.NetworkSettings.Networks)[0] as any;
      ip = anyNet?.IPAddress;
    }
    return ip || null;
  }

  private async waitForContainerReady(
    container: Docker.Container,
    containerName: string,
    networkName: string,
  ): Promise<{ ip: string; containerId: string }> {
    let ip: string | null = null;
    let serviceReady = false;
    let attempts = 0;

    const maxWaitSecondsRaw = Number(
      this.configService.get<string>('VDI_ALLOCATE_TIMEOUT_SEC') || '90',
    );
    const maxWaitSeconds =
      Number.isFinite(maxWaitSecondsRaw) && maxWaitSecondsRaw > 0
        ? maxWaitSecondsRaw
        : 90;
    const deadline = Date.now() + maxWaitSeconds * 1000;

    while (Date.now() < deadline) {
      attempts += 1;
      const data = await container.inspect();

      if (data.State.Status === 'exited') {
        this.logger.error(`❌ Container ${containerName} crashed immediately!`);
        const logs = await container.logs({ stdout: true, stderr: true });
        console.log('--- DOCKER CRASH LOGS ---');
        console.log(logs.toString('utf8'));
        console.log('-------------------------');
        throw new Error(
          'Máy thi gặp sự cố (Container crashed). Vui lòng báo Giám thị.',
        );
      }

      ip = data.NetworkSettings.Networks[networkName]?.IPAddress;
      if (!ip) {
        const anyNet = Object.values(data.NetworkSettings.Networks)[0] as any;
        ip = anyNet?.IPAddress;
      }

      if (!ip) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const healthStatus = data.State?.Health?.Status;
      if (healthStatus === 'healthy') {
        serviceReady = true;
        break;
      }

      if (!healthStatus && attempts >= 8) {
        serviceReady = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!ip) {
      throw new Error(
        `Container started but NO IP found after ${maxWaitSeconds} seconds.`,
      );
    }

    if (!serviceReady) {
      throw new Error(
        'Exam container network ready nhưng dịch vụ RDP chưa sẵn sàng.',
      );
    }

    return { ip, containerId: container.id };
  }

  private async ensureUsableContainer(
    containerName: string,
    networkName: string,
    targetImageId: string,
  ): Promise<ContainerRuntimeInfo | null> {
    try {
      const container = this.docker.getContainer(containerName);
      const data = await container.inspect();

      if (data.Image !== targetImageId) {
        this.logger.warn(`♻️ [VDI] ${containerName} chạy image cũ, recreate`);
        await container.remove({ force: true });
        return null;
      }

      if (data.State?.Status !== 'running') {
        return null;
      }

      const healthStatus = data.State?.Health?.Status;
      if (healthStatus && healthStatus !== 'healthy') {
        this.logger.warn(
          `♻️ [VDI] ${containerName} health=${healthStatus}, recreate`,
        );
        await container.remove({ force: true });
        return null;
      }

      const ip = await this.extractContainerIp(container, networkName);
      if (!ip) {
        return null;
      }

      return { ip, containerId: container.id, containerName };
    } catch {
      return null;
    }
  }

  private async createContainerAndWaitReady(
    containerName: string,
    imageName: string,
    networkName: string,
    profile: ResourceProfile,
  ): Promise<ContainerRuntimeInfo> {
    const restrictInternetRaw = String(
      this.configService.get<string>('EXAM_RESTRICT_INTERNET') || 'true',
    ).toLowerCase();
    const restrictInternet = !['0', 'false', 'no'].includes(
      restrictInternetRaw,
    );
    const allowedDomains =
      this.configService.get<string>('EXAM_ALLOWED_DOMAINS') ||
      'sot.umtoj.edu.vn';
    const allowedCidrs =
      this.configService.get<string>('EXAM_ALLOWED_CIDRS') || '';
    const allowedIps = this.configService.get<string>('EXAM_ALLOWED_IPS') || '';
    const originIp =
      this.configService.get<string>('EXAM_ORIGIN_IP') || '203.210.213.198';
    const firewallStrictRaw = String(
      this.configService.get<string>('EXAM_FIREWALL_ENFORCE_STRICT') || 'true',
    ).toLowerCase();
    const firewallStrict = !['0', 'false', 'no'].includes(firewallStrictRaw);
    const examBrowserUrl =
      this.configService.get<string>('EXAM_BROWSER_URL') ||
      'https://sot.umtoj.edu.vn';
    const examBrowserAutostartRaw = String(
      this.configService.get<string>('EXAM_BROWSER_AUTOSTART') || 'true',
    ).toLowerCase();
    const examBrowserAutostart = !['0', 'false', 'no'].includes(
      examBrowserAutostartRaw,
    );
    const examBrowserPrewarmRaw = String(
      this.configService.get<string>('EXAM_BROWSER_PREWARM') || 'true',
    ).toLowerCase();
    const examBrowserPrewarm = !['0', 'false', 'no'].includes(
      examBrowserPrewarmRaw,
    );

    const newContainer = await this.docker.createContainer({
      Image: imageName,
      name: containerName,
      HostConfig: {
        NetworkMode: networkName,
        AutoRemove: false,
        Memory: Math.floor(profile.memoryMb * 1024 * 1024),
        NanoCpus: Math.floor(profile.cpu * 1_000_000_000),
        ShmSize: Math.floor(profile.shmMb * 1024 * 1024),
        CapAdd: ['NET_ADMIN'],
      },
      Env: [
        `EXAM_VM_USERNAME=${this.vmUsername}`,
        `EXAM_VM_PASSWORD=${this.vmPassword}`,
        `EXAM_RESTRICT_INTERNET=${restrictInternet ? 'true' : 'false'}`,
        `EXAM_ALLOWED_DOMAINS=${allowedDomains}`,
        `EXAM_ALLOWED_CIDRS=${allowedCidrs}`,
        `EXAM_ALLOWED_IPS=${allowedIps}`,
        `EXAM_ORIGIN_IP=${originIp}`,
        `EXAM_FIREWALL_ENFORCE_STRICT=${firewallStrict ? 'true' : 'false'}`,
        `EXAM_BROWSER_URL=${examBrowserUrl}`,
        `EXAM_BROWSER_AUTOSTART=${examBrowserAutostart ? 'true' : 'false'}`,
        `EXAM_BROWSER_PREWARM=${examBrowserPrewarm ? 'true' : 'false'}`,
      ],
    });

    await newContainer.start();
    const runtime = await this.waitForContainerReady(
      newContainer,
      containerName,
      networkName,
    );
    return { ...runtime, containerName };
  }

  // --- HÀM 1: CẤP PHÁT MÁY THI ---
  async allocateContainer(
    userId: number,
    examId: number,
    options: AllocateOptions = {},
  ): Promise<{ ip: string; containerId: string }> {
    if (options.forceLocal) {
      return this.allocateContainerLocal(userId, examId);
    }

    await this.syncLocalWorkerHeartbeat();
    const dispatchKey = this.dispatchKey(userId, examId);
    const localWorkerCode = this.localWorkerCode();

    // Nếu đã dispatch remote từ trước, ưu tiên gọi lại đúng worker đó để reconnect/idempotent.
    const existingDispatchRaw = await this.redis.get(dispatchKey);
    if (existingDispatchRaw) {
      try {
        const dispatch = JSON.parse(existingDispatchRaw) as {
          mode?: 'local' | 'remote';
          workerCode?: string;
          apiBaseUrl?: string;
        };
        if (dispatch.mode === 'local') {
          return this.allocateContainerLocal(userId, examId);
        }
        if (dispatch.mode === 'remote' && dispatch.apiBaseUrl) {
          try {
            const remoteAllocated = await this.callWorkerApi<{
              ip: string;
              containerId: string;
            }>(dispatch.apiBaseUrl, '/api/vdi/cluster/allocate', {
              userId,
              examId,
            });
            return remoteAllocated;
          } catch (error) {
            this.logger.warn(
              `⚠️ [VDI] Existing remote dispatch failed, fallback reschedule: ${error.message}`,
            );
          }
        }
      } catch {
        // ignore malformed dispatch metadata
      }
    }

    const workers =
      (await this.workerRegistryService.getSchedulableWorkers()) as SchedulableWorker[];
    const candidates = await this.workerCandidatesForExam(examId, workers);
    const maxRemoteTries = this.allocateRetryCount();
    let remoteTried = 0;

    for (const worker of candidates) {
      if (remoteTried >= maxRemoteTries) break;
      if (worker.code === localWorkerCode || !worker.apiBaseUrl) continue;

      remoteTried += 1;
      try {
        const remoteAllocated = await this.callWorkerApi<{
          ip: string;
          containerId: string;
        }>(worker.apiBaseUrl, '/api/vdi/cluster/allocate', { userId, examId });

        await this.redis.set(
          dispatchKey,
          JSON.stringify({
            mode: 'remote',
            workerCode: worker.code,
            apiBaseUrl: worker.apiBaseUrl,
            allocatedAt: new Date().toISOString(),
          }),
        );
        await this.redis.set(
          this.examStickyWorkerKey(examId),
          worker.code,
          'EX',
          this.stickyTtlSec(),
        );
        await this.workerRegistryService.bumpActiveSessions(worker.code, +1);
        await this.applyExamWorkerAffinity(examId, worker.code, +1);
        return remoteAllocated;
      } catch (error) {
        this.logger.warn(
          `⚠️ [VDI] Remote allocate failed worker=${worker.code}, retry next: ${error.message}`,
        );
        const stickyCode = await this.redis.get(
          this.examStickyWorkerKey(examId),
        );
        if (stickyCode === worker.code) {
          await this.redis.del(this.examStickyWorkerKey(examId));
        }
      }
    }

    const localAllocated = await this.allocateContainerLocal(userId, examId);
    await this.redis.set(
      dispatchKey,
      JSON.stringify({
        mode: 'local',
        workerCode: localWorkerCode,
        allocatedAt: new Date().toISOString(),
      }),
    );
    await this.applyExamWorkerAffinity(examId, localWorkerCode, +1);
    return localAllocated;
  }

  @Interval(60_000)
  async cleanupStaleDispatchesJob() {
    if (!this.dispatchCleanupEnabled()) return;
    if (this.dispatchCleanupRunning) return;

    this.dispatchCleanupRunning = true;
    try {
      await this.cleanupStaleDispatches('auto');
    } catch (error) {
      this.logger.warn(
        `⚠️ [VDI] cleanupStaleDispatches failed: ${error.message}`,
      );
    } finally {
      this.dispatchCleanupRunning = false;
    }
  }

  async reconcileDispatchesNow() {
    if (this.dispatchCleanupRunning) {
      throw new Error('Cleanup đang chạy, vui lòng thử lại sau vài giây.');
    }

    this.dispatchCleanupRunning = true;
    try {
      return await this.cleanupStaleDispatches('manual');
    } finally {
      this.dispatchCleanupRunning = false;
    }
  }

  private async cleanupStaleDispatches(
    mode: 'manual' | 'auto',
  ): Promise<DispatchReconcileResult> {
    const staleBefore = Date.now() - this.dispatchStaleSec() * 1000;
    const scanCount = this.dispatchScanCount();
    let cursor = '0';
    let scanned = 0;
    let cleaned = 0;
    let malformed = 0;
    let staleWithoutSession = 0;
    let remoteSessionCountersFixed = 0;
    let affinityFixed = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'vdi:dispatch:exam:*:user:*',
        'COUNT',
        scanCount,
      );
      cursor = nextCursor;

      for (const key of keys) {
        scanned += 1;
        const parsedKey = this.parseDispatchKey(key);
        if (!parsedKey) continue;

        const raw = await this.redis.get(key);
        if (!raw) continue;

        let dispatch: {
          mode?: 'local' | 'remote';
          workerCode?: string;
          apiBaseUrl?: string;
          allocatedAt?: string;
        } | null = null;

        try {
          dispatch = JSON.parse(raw);
        } catch {
          await this.redis.del(key);
          cleaned += 1;
          malformed += 1;
          continue;
        }

        const sessionExists =
          (await this.redis.exists(
            this.sessionKey(parsedKey.userId, parsedKey.examId),
          )) > 0;
        if (sessionExists) continue;

        const allocatedAtMs = dispatch?.allocatedAt
          ? new Date(dispatch.allocatedAt).getTime()
          : 0;
        const isStale =
          Number.isFinite(allocatedAtMs) && allocatedAtMs > 0
            ? allocatedAtMs <= staleBefore
            : true;
        if (!isStale) continue;
        staleWithoutSession += 1;

        if (dispatch?.workerCode) {
          if (dispatch.mode === 'remote') {
            await this.workerRegistryService.bumpActiveSessions(
              dispatch.workerCode,
              -1,
            );
            remoteSessionCountersFixed += 1;
          }
          await this.applyExamWorkerAffinity(
            parsedKey.examId,
            dispatch.workerCode,
            -1,
          );
          affinityFixed += 1;
        }

        await this.redis.del(key);
        cleaned += 1;
      }
    } while (cursor !== '0');

    const result: DispatchReconcileResult = {
      scanned,
      cleaned,
      malformed,
      staleWithoutSession,
      remoteSessionCountersFixed,
      affinityFixed,
      mode,
    };

    if (cleaned > 0) {
      this.logger.log(
        `🧹 [VDI] Reconcile(${mode}) cleaned=${cleaned} scanned=${scanned} malformed=${malformed} stale=${staleWithoutSession}`,
      );
    }
    return result;
  }

  private async allocateContainerLocal(
    userId: number,
    examId: number,
  ): Promise<{ ip: string; containerId: string }> {
    const dedicatedContainerName = `exam_${examId}_u${userId}`;
    const imageName =
      this.configService.get<string>('EXAM_IMAGE_NAME') ||
      'sot-exam-linux:latest';
    const profile = this.buildResourceProfile();
    const sessionKey = this.sessionKey(userId, examId);
    const poolKey = this.poolAvailableKey(examId);

    this.logger.log(`🚀 [VDI] Allocating exam=${examId} user=${userId}...`);

    try {
      await this.syncLocalWorkerHeartbeat(profile);
      const networkName = await this.resolveExamNetworkName();
      const targetImageId = await this.ensureTargetImage(imageName);

      this.logger.log(
        `🧩 [VDI] Resource profile -> RAM=${profile.memoryMb}MB CPU=${profile.cpu} SHM=${profile.shmMb}MB`,
      );

      // 1) Ưu tiên tái sử dụng session hiện tại (idempotent khi refresh/reconnect).
      const existingSession = await this.redis.get(sessionKey);
      if (existingSession) {
        try {
          const parsed = JSON.parse(existingSession) as {
            containerName?: string;
          };
          if (parsed?.containerName) {
            const runtime = await this.ensureUsableContainer(
              parsed.containerName,
              networkName,
              targetImageId,
            );
            if (runtime) {
              this.logger.log(
                `♻️ [VDI] Reusing session ${parsed.containerName} -> ${runtime.ip}`,
              );
              return { ip: runtime.ip, containerId: runtime.containerId };
            }
          }
        } catch {
          // Bỏ qua session payload lỗi và cấp phát lại.
        }
      }

      // 2) Backward compatibility: tái sử dụng container dedicated theo convention cũ.
      const legacyDedicated = await this.ensureUsableContainer(
        dedicatedContainerName,
        networkName,
        targetImageId,
      );
      if (legacyDedicated) {
        await this.redis.set(
          sessionKey,
          JSON.stringify({
            containerName: legacyDedicated.containerName,
            allocatedAt: new Date().toISOString(),
            source: 'legacy-dedicated',
          }),
        );
        this.logger.log(
          `♻️ [VDI] Reusing dedicated ${legacyDedicated.containerName} -> ${legacyDedicated.ip}`,
        );
        return {
          ip: legacyDedicated.ip,
          containerId: legacyDedicated.containerId,
        };
      }

      // 3) Nhanh nhất: lấy máy đã prewarm từ pool.
      for (let attempts = 0; attempts < 32; attempts += 1) {
        const pooledContainerName = await this.redis.spop(poolKey);
        if (!pooledContainerName) break;

        const runtime = await this.ensureUsableContainer(
          pooledContainerName,
          networkName,
          targetImageId,
        );
        if (!runtime) continue;

        await this.redis.set(
          sessionKey,
          JSON.stringify({
            containerName: runtime.containerName,
            allocatedAt: new Date().toISOString(),
            source: 'prewarm-pool',
          }),
        );
        this.logger.log(
          `⚡ [VDI] Assigned prewarmed ${runtime.containerName} -> ${runtime.ip}`,
        );
        await this.syncLocalWorkerHeartbeat(profile);
        return { ip: runtime.ip, containerId: runtime.containerId };
      }

      // 4) Fallback: tạo máy dedicated on-demand.
      const runtime = await this.createContainerAndWaitReady(
        dedicatedContainerName,
        imageName,
        networkName,
        profile,
      );
      await this.redis.set(
        sessionKey,
        JSON.stringify({
          containerName: runtime.containerName,
          allocatedAt: new Date().toISOString(),
          source: 'on-demand',
        }),
      );
      this.logger.log(
        `✅ [VDI] Ready (on-demand): ${runtime.containerName} -> ${runtime.ip}`,
      );
      await this.syncLocalWorkerHeartbeat(profile);
      return { ip: runtime.ip, containerId: runtime.containerId };
    } catch (error) {
      this.logger.error(`❌ [VDI Error] ${error.message}`);
      throw new InternalServerErrorException(error.message);
    }
  }

  async prewarmExamPool(
    examId: number,
    requestedCount: number,
    options: PrewarmOptions = {},
  ) {
    if (options.forceLocal) {
      return this.prewarmExamPoolLocal(examId, requestedCount);
    }

    await this.syncLocalWorkerHeartbeat();
    const requested = Math.max(0, Math.floor(requestedCount || 0));
    if (!requested) {
      return this.prewarmExamPoolLocal(examId, 0);
    }

    const workers =
      (await this.workerRegistryService.getSchedulableWorkers()) as SchedulableWorker[];
    if (!workers.length) {
      return this.prewarmExamPoolLocal(examId, requested);
    }

    let remaining = requested;
    let totalCreated = 0;
    let totalFailed = 0;
    let localPoolAvailable = 0;

    const sticky = await this.pickWorkerForExam(examId, workers);
    const orderedWorkers = sticky
      ? [sticky, ...workers.filter((worker) => worker.code !== sticky.code)]
      : workers;

    for (const worker of orderedWorkers) {
      if (remaining <= 0) break;
      const assign = Math.max(0, Math.min(remaining, worker.availableSessions));
      if (!assign) continue;

      if (worker.code === this.localWorkerCode()) {
        const local = await this.prewarmExamPoolLocal(examId, assign);
        totalCreated += Number(local.created || 0);
        totalFailed += Number(local.failed || 0);
        localPoolAvailable = Number(local.poolAvailable || 0);
      } else if (worker.apiBaseUrl) {
        try {
          const remote = await this.callWorkerApi<{
            requested: number;
            created: number;
            failed: number;
            poolAvailable: number;
          }>(worker.apiBaseUrl, '/api/vdi/cluster/prewarm', {
            examId,
            count: assign,
          });
          totalCreated += Number(remote.created || 0);
          totalFailed += Number(remote.failed || 0);
        } catch (error) {
          totalFailed += assign;
          this.logger.warn(
            `⚠️ [VDI] Remote prewarm failed worker=${worker.code}: ${error.message}`,
          );
        }
      }
      remaining -= assign;
    }

    if (remaining > 0) {
      const local = await this.prewarmExamPoolLocal(examId, remaining);
      totalCreated += Number(local.created || 0);
      totalFailed += Number(local.failed || 0);
      localPoolAvailable = Number(local.poolAvailable || 0);
    } else if (!localPoolAvailable) {
      localPoolAvailable = await this.redis.scard(
        this.poolAvailableKey(examId),
      );
    }

    return {
      requested,
      created: totalCreated,
      failed: totalFailed,
      poolAvailable: localPoolAvailable,
      distributed: true,
    };
  }

  private async prewarmExamPoolLocal(examId: number, requestedCount: number) {
    const imageName =
      this.configService.get<string>('EXAM_IMAGE_NAME') ||
      'sot-exam-linux:latest';
    const profile = this.buildResourceProfile();
    const poolKey = this.poolAvailableKey(examId);
    const maxPrewarmRaw = Number(
      this.configService.get<string>('VDI_PREWARM_MAX') || '200',
    );
    const maxPrewarm =
      Number.isFinite(maxPrewarmRaw) && maxPrewarmRaw > 0 ? maxPrewarmRaw : 200;
    const count = Math.max(
      0,
      Math.min(Math.floor(requestedCount || 0), maxPrewarm),
    );

    if (!count) {
      return {
        requested: requestedCount,
        created: 0,
        failed: 0,
        poolAvailable: await this.redis.scard(poolKey),
        message: 'Không có máy nào được prewarm (count=0).',
      };
    }

    try {
      const networkName = await this.resolveExamNetworkName();
      await this.ensureTargetImage(imageName);

      const concurrencyRaw = Number(
        this.configService.get<string>('VDI_PREWARM_CONCURRENCY') || '5',
      );
      const concurrency =
        Number.isFinite(concurrencyRaw) && concurrencyRaw > 0
          ? Math.min(concurrencyRaw, 20)
          : 5;

      this.logger.log(
        `🔥 [VDI] Prewarm exam=${examId} count=${count} concurrency=${concurrency}`,
      );

      let created = 0;
      let failed = 0;

      for (let offset = 0; offset < count; offset += concurrency) {
        const batchSize = Math.min(concurrency, count - offset);
        const batch = Array.from(
          { length: batchSize },
          (_, idx) => offset + idx,
        );

        const results = await Promise.allSettled(
          batch.map(async (seq) => {
            const suffix = crypto.randomBytes(3).toString('hex');
            const containerName = `exam_${examId}_pool_${Date.now()}_${seq}_${suffix}`;
            const runtime = await this.createContainerAndWaitReady(
              containerName,
              imageName,
              networkName,
              profile,
            );
            await this.redis.sadd(poolKey, runtime.containerName);
            return runtime.containerName;
          }),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            created += 1;
          } else {
            failed += 1;
            this.logger.warn(
              `⚠️ [VDI] Prewarm failed: ${result.reason?.message || result.reason}`,
            );
          }
        }
      }

      const poolAvailable = await this.redis.scard(poolKey);
      await this.syncLocalWorkerHeartbeat(profile);
      return {
        requested: count,
        created,
        failed,
        poolAvailable,
      };
    } catch (error) {
      this.logger.error(`❌ [VDI] Prewarm error: ${error.message}`);
      throw new InternalServerErrorException(error.message);
    }
  }

  async getExamPoolCapacity(examId: number) {
    await this.syncLocalWorkerHeartbeat();
    const poolAvailable = await this.redis.scard(this.poolAvailableKey(examId));
    const sessionKeys = await this.redis.keys(
      `vdi:session:exam:${examId}:user:*`,
    );
    return {
      examId,
      poolAvailable,
      activeSessions: sessionKeys.length,
    };
  }

  // --- HÀM 2: TẠO TOKEN KẾT NỐI ---
  async generateConnectionToken(
    userId: number,
    targetIp: string,
  ): Promise<string> {
    const connectionParams = {
      connection: {
        type: 'rdp',
        settings: {
          hostname: targetIp,
          port: '3389',
          username: this.vmUsername,
          password: this.vmPassword,
          security: 'any',
          'ignore-cert': 'true',
          'disable-audio': 'true',
          'resize-method': 'display-update',
        },
      },
    };

    // Mã hóa
    const guacToken = this.encrypt(connectionParams);

    this.logger?.log(`🔒 Encrypted Token: ${guacToken.substring(0, 15)}...`);

    const sessionId = crypto.randomUUID();
    if (this.redis) {
      await this.redis.set(
        `vdi:auth:${sessionId}`,
        JSON.stringify({ token: guacToken }),
        'EX',
        30,
      );
    }

    return guacToken;
  }

  private encrypt(payload: Record<string, unknown>): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tokenData = {
      iv: iv.toString('base64'),
      value: encrypted,
    };

    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
  }

  // ... (giữ nguyên các hàm khác)
  async retrieveTokenFromRedis(sessionId: string): Promise<string | null> {
    const data = await this.redis.get(`vdi:auth:${sessionId}`);
    return data ? JSON.parse(data).token : null;
  }

  async destroyContainer(
    userId: number,
    examId: number,
    options: DestroyOptions = {},
  ) {
    if (options.forceLocal) {
      return this.destroyContainerLocal(userId, examId);
    }

    const dispatchKey = this.dispatchKey(userId, examId);
    const dispatchRaw = await this.redis.get(dispatchKey);
    if (dispatchRaw) {
      try {
        const dispatch = JSON.parse(dispatchRaw) as {
          mode?: 'local' | 'remote';
          workerCode?: string;
          apiBaseUrl?: string;
        };

        if (dispatch.mode === 'remote' && dispatch.apiBaseUrl) {
          await this.callWorkerApi<{ message: string }>(
            dispatch.apiBaseUrl,
            '/api/vdi/cluster/release',
            {
              userId,
              examId,
            },
          );
          if (dispatch.workerCode) {
            await this.workerRegistryService.bumpActiveSessions(
              dispatch.workerCode,
              -1,
            );
            await this.applyExamWorkerAffinity(examId, dispatch.workerCode, -1);
          }
          await this.redis.del(dispatchKey);
          return;
        }
        if (dispatch.mode === 'local') {
          if (dispatch.workerCode) {
            await this.applyExamWorkerAffinity(examId, dispatch.workerCode, -1);
          }
          await this.destroyContainerLocal(userId, examId);
          await this.redis.del(dispatchKey);
          return;
        }
      } catch (error) {
        this.logger.warn(
          `⚠️ [VDI] Remote release failed, fallback local cleanup: ${error.message}`,
        );
      }
    }

    await this.destroyContainerLocal(userId, examId);
    await this.applyExamWorkerAffinity(examId, this.localWorkerCode(), -1);
    await this.redis.del(dispatchKey);
  }

  private async destroyContainerLocal(userId: number, examId: number) {
    const sessionKey = this.sessionKey(userId, examId);
    const fallbackContainerName = `exam_${examId}_u${userId}`;
    const poolKey = this.poolAvailableKey(examId);
    let containerName = fallbackContainerName;

    const sessionRaw = await this.redis.get(sessionKey);
    if (sessionRaw) {
      try {
        const parsed = JSON.parse(sessionRaw) as { containerName?: string };
        if (parsed?.containerName) {
          containerName = parsed.containerName;
        }
      } catch {
        // fallback naming convention
      }
    }

    try {
      const container = this.docker.getContainer(containerName);
      await container.stop({ t: 5 });
      await container.remove({ force: true });
    } catch (e) {
      // ignore cleanup errors
    } finally {
      await this.redis.del(sessionKey);
      await this.redis.srem(poolKey, containerName);
      await this.syncLocalWorkerHeartbeat();
    }
  }
}
