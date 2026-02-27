import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as os from 'os';
import { Repository } from 'typeorm';
import { WorkerNode } from '../../entities/worker-node.entity';

export interface WorkerHeartbeatInput {
  code: string;
  name: string;
  apiBaseUrl?: string | null;
  totalCpuCores: number;
  totalMemoryMb: number;
  reservedCpuCores: number;
  reservedMemoryMb: number;
  vmCpuCores: number;
  vmMemoryMb: number;
  activeSessions: number;
  metadata?: Record<string, unknown> | null;
}

type WorkerStatusPatch = {
  isEnabled?: boolean;
  isDraining?: boolean;
  force?: boolean;
};

@Injectable()
export class WorkerRegistryService {
  constructor(
    @InjectRepository(WorkerNode)
    private workerRepo: Repository<WorkerNode>,
    private configService: ConfigService,
  ) {}

  private computeMaxSessions(input: {
    totalCpuCores: number;
    totalMemoryMb: number;
    reservedCpuCores: number;
    reservedMemoryMb: number;
    vmCpuCores: number;
    vmMemoryMb: number;
  }): number {
    const usableCpu = Math.max(0, input.totalCpuCores - input.reservedCpuCores);
    const usableMemory = Math.max(
      0,
      input.totalMemoryMb - input.reservedMemoryMb,
    );
    const byCpu =
      input.vmCpuCores > 0 ? Math.floor(usableCpu / input.vmCpuCores) : 0;
    const byMem =
      input.vmMemoryMb > 0 ? Math.floor(usableMemory / input.vmMemoryMb) : 0;
    return Math.max(0, Math.min(byCpu, byMem));
  }

  private heartbeatTtlSec(): number {
    const raw = Number(
      this.configService.get<string>('WORKER_HEARTBEAT_TTL_SEC') || '120',
    );
    return Number.isFinite(raw) && raw > 10 ? raw : 120;
  }

  private isHealthy(worker: WorkerNode): boolean {
    if (!worker.isEnabled || !worker.lastHeartbeatAt) return false;
    const ttlMs = this.heartbeatTtlSec() * 1000;
    return Date.now() - worker.lastHeartbeatAt.getTime() <= ttlMs;
  }

  async upsertHeartbeat(input: WorkerHeartbeatInput) {
    const existing = await this.workerRepo.findOne({
      where: { code: input.code },
    });
    const maxSessions = this.computeMaxSessions(input);

    const entity = existing || this.workerRepo.create({ code: input.code });
    entity.name = input.name;
    entity.apiBaseUrl = input.apiBaseUrl || null;
    entity.totalCpuCores = input.totalCpuCores;
    entity.totalMemoryMb = input.totalMemoryMb;
    entity.reservedCpuCores = input.reservedCpuCores;
    entity.reservedMemoryMb = input.reservedMemoryMb;
    entity.vmCpuCores = input.vmCpuCores;
    entity.vmMemoryMb = input.vmMemoryMb;
    entity.activeSessions = Math.max(0, Math.floor(input.activeSessions));
    entity.maxSessions = maxSessions;
    entity.metadata = input.metadata || null;
    entity.lastHeartbeatAt = new Date();
    entity.isEnabled = true;

    const saved = await this.workerRepo.save(entity);
    return {
      ...saved,
      availableSessions: Math.max(0, saved.maxSessions - saved.activeSessions),
      healthy: this.isHealthy(saved),
    };
  }

  async refreshLocalWorkerSnapshot(
    activeSessions: number,
    vmCpuCores: number,
    vmMemoryMb: number,
  ) {
    const code =
      this.configService.get<string>('WORKER_CODE') || `local-${os.hostname()}`;
    const name =
      this.configService.get<string>('WORKER_NAME') ||
      `Local Worker (${os.hostname()})`;
    const apiBaseUrl =
      this.configService.get<string>('WORKER_API_BASE_URL') || null;

    const totalCpuRaw = Number(
      this.configService.get<string>('WORKER_TOTAL_CPUS') || os.cpus().length,
    );
    const totalMemoryRaw = Number(
      this.configService.get<string>('WORKER_TOTAL_MEMORY_MB') ||
        Math.floor(os.totalmem() / 1024 / 1024),
    );
    const reservedCpuRaw = Number(
      this.configService.get<string>('WORKER_RESERVED_CPUS') || '1',
    );
    const reservedMemoryRaw = Number(
      this.configService.get<string>('WORKER_RESERVED_MEMORY_MB') || '1024',
    );

    return this.upsertHeartbeat({
      code,
      name,
      apiBaseUrl,
      totalCpuCores: Number.isFinite(totalCpuRaw)
        ? totalCpuRaw
        : os.cpus().length,
      totalMemoryMb: Number.isFinite(totalMemoryRaw)
        ? totalMemoryRaw
        : Math.floor(os.totalmem() / 1024 / 1024),
      reservedCpuCores: Number.isFinite(reservedCpuRaw) ? reservedCpuRaw : 1,
      reservedMemoryMb: Number.isFinite(reservedMemoryRaw)
        ? reservedMemoryRaw
        : 1024,
      vmCpuCores,
      vmMemoryMb,
      activeSessions: Math.max(0, Math.floor(activeSessions)),
      metadata: {
        source: 'auto-local',
        hostname: os.hostname(),
        platform: os.platform(),
      },
    });
  }

  async getWorkers() {
    const workers = await this.workerRepo.find({
      order: { name: 'ASC' },
    });

    return workers.map((worker) => ({
      ...worker,
      healthy: this.isHealthy(worker),
      availableSessions: Math.max(
        0,
        worker.maxSessions - worker.activeSessions,
      ),
      drainStatus: worker.isDraining
        ? worker.activeSessions > 0
          ? 'draining'
          : 'drained'
        : 'serving',
    }));
  }

  async getWorkerByCode(code: string) {
    const worker = await this.workerRepo.findOne({ where: { code } });
    if (!worker) return null;
    return {
      ...worker,
      healthy: this.isHealthy(worker),
      availableSessions: Math.max(
        0,
        worker.maxSessions - worker.activeSessions,
      ),
      drainStatus: worker.isDraining
        ? worker.activeSessions > 0
          ? 'draining'
          : 'drained'
        : 'serving',
    };
  }

  async getSchedulableWorkers() {
    const workers = await this.getWorkers();
    return workers
      .filter(
        (worker) =>
          worker.healthy &&
          worker.isEnabled &&
          !worker.isDraining &&
          worker.availableSessions > 0,
      )
      .sort((a, b) => {
        if (b.availableSessions !== a.availableSessions) {
          return b.availableSessions - a.availableSessions;
        }
        if (a.activeSessions !== b.activeSessions) {
          return a.activeSessions - b.activeSessions;
        }
        return a.code.localeCompare(b.code);
      });
  }

  async bumpActiveSessions(code: string, delta: number) {
    const worker = await this.workerRepo.findOne({ where: { code } });
    if (!worker) return null;

    worker.activeSessions = Math.max(
      0,
      worker.activeSessions + Math.floor(delta),
    );
    await this.workerRepo.save(worker);
    return {
      ...worker,
      healthy: this.isHealthy(worker),
      availableSessions: Math.max(
        0,
        worker.maxSessions - worker.activeSessions,
      ),
      drainStatus: worker.isDraining
        ? worker.activeSessions > 0
          ? 'draining'
          : 'drained'
        : 'serving',
    };
  }

  async setWorkerStatus(code: string, status: WorkerStatusPatch) {
    const worker = await this.workerRepo.findOne({ where: { code } });
    if (!worker) return null;

    if (
      status.isEnabled === false &&
      worker.activeSessions > 0 &&
      !status.force
    ) {
      throw new Error(
        `Worker '${code}' đang có ${worker.activeSessions} session hoạt động. Bật drain trước và chờ submit xong.`,
      );
    }

    if (typeof status.isEnabled === 'boolean') {
      worker.isEnabled = status.isEnabled;
    }
    if (typeof status.isDraining === 'boolean') {
      worker.isDraining = status.isDraining;
    }
    await this.workerRepo.save(worker);
    return {
      ...worker,
      healthy: this.isHealthy(worker),
      availableSessions: Math.max(
        0,
        worker.maxSessions - worker.activeSessions,
      ),
      drainStatus: worker.isDraining
        ? worker.activeSessions > 0
          ? 'draining'
          : 'drained'
        : 'serving',
    };
  }

  async getClusterSummary() {
    const workers = await this.getWorkers();
    const healthyWorkers = workers.filter((w) => w.healthy);

    const totalMaxSessions = healthyWorkers.reduce(
      (sum, w) => sum + w.maxSessions,
      0,
    );
    const totalActiveSessions = healthyWorkers.reduce(
      (sum, w) => sum + w.activeSessions,
      0,
    );
    const totalAvailableSessions = healthyWorkers.reduce(
      (sum, w) => sum + w.availableSessions,
      0,
    );
    const drainingWorkers = workers.filter((w) => w.isDraining).length;
    const drainedWorkers = workers.filter(
      (w) => w.isDraining && w.activeSessions === 0,
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      totalWorkers: workers.length,
      healthyWorkers: healthyWorkers.length,
      drainingWorkers,
      drainedWorkers,
      totalMaxSessions,
      totalActiveSessions,
      totalAvailableSessions,
      workers,
    };
  }
}
