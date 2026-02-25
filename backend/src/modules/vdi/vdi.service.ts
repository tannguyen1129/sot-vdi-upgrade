import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import Docker from 'dockerode';
import * as crypto from 'crypto';

@Injectable()
export class VdiService {
  private readonly logger = new Logger(VdiService.name);
  private redis: Redis;
  private docker: Docker;
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;
  private readonly vmUsername: string;
  private readonly vmPassword: string;

  constructor(private configService: ConfigService) {
    const rawKey = this.configService.get<string>('GUAC_TOKEN_KEY') || '12345678901234567890123456789012';
    const keyBuffer = Buffer.from(rawKey, 'utf8');
    this.key = keyBuffer.length === 32 ? keyBuffer : crypto.createHash('sha256').update(rawKey).digest();
    this.vmUsername = this.configService.get<string>('EXAM_VM_USERNAME') || 'student';
    this.vmPassword = this.configService.get<string>('EXAM_VM_PASSWORD') || '123456';

    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST') || 'umt_redis',
      port: 6379,
    });
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  // --- HÀM 1: CẤP PHÁT MÁY THI ---
  async allocateContainer(userId: number, examId: number): Promise<{ ip: string; containerId: string }> {
    const containerName = `exam_${examId}_u${userId}`;
    const imageName = this.configService.get<string>('EXAM_IMAGE_NAME') || 'sot-exam-linux:latest';
    const memoryMbRaw = Number(this.configService.get<string>('EXAM_VM_MEMORY_MB') || '2048');
    const cpuRaw = Number(this.configService.get<string>('EXAM_VM_CPUS') || '1.5');
    const shmMbRaw = Number(this.configService.get<string>('EXAM_VM_SHM_MB') || '512');
    const memoryMb = Number.isFinite(memoryMbRaw) && memoryMbRaw > 0 ? memoryMbRaw : 2048;
    const cpu = Number.isFinite(cpuRaw) && cpuRaw > 0 ? cpuRaw : 1.5;
    const shmMb = Number.isFinite(shmMbRaw) && shmMbRaw > 0 ? shmMbRaw : 512;

    this.logger.log(`🚀 [VDI] Allocating ${containerName}...`);

    try {
      const networks = await this.docker.listNetworks();
      const examNetObj = networks.find(n => n.Name.includes('exam_net'));
      if (!examNetObj) throw new Error('Không tìm thấy mạng exam_net!');
      const networkName = examNetObj.Name;
      const targetImage = await this.docker.getImage(imageName).inspect();
      const targetImageId = targetImage.Id;

      try {
        const oldContainer = this.docker.getContainer(containerName);
        const oldData = await oldContainer.inspect();

        if (oldData.Image !== targetImageId) {
          this.logger.warn(`♻️ [VDI] ${containerName} chạy image cũ, recreate để dùng image mới`);
          await oldContainer.remove({ force: true });
          throw new Error('stale-container-removed');
        }

        if (oldData.State?.Status === 'running') {
          let oldIp = oldData.NetworkSettings.Networks[networkName]?.IPAddress;
          if (!oldIp) {
            const anyNet = Object.values(oldData.NetworkSettings.Networks)[0] as any;
            oldIp = anyNet?.IPAddress;
          }

          if (oldIp) {
            const healthStatus = oldData.State?.Health?.Status;
            // Backend không nằm trong exam_net nên không thể probe TCP trực tiếp đến IP máy thi.
            // Dùng trạng thái container + healthcheck nội bộ để quyết định tái sử dụng.
            if (healthStatus === 'healthy' || !healthStatus) {
              this.logger.log(`♻️ [VDI] Reusing ${containerName} -> ${oldIp}`);
              return { ip: oldIp, containerId: oldContainer.id };
            }

            this.logger.warn(`♻️ [VDI] ${containerName} running nhưng health=${healthStatus}, sẽ recreate`);
          }
        }

        // Container cũ không dùng được nữa -> xóa để tạo mới sạch
        await oldContainer.remove({ force: true });
      } catch (e) { }

      const newContainer = await this.docker.createContainer({
        Image: imageName,
        name: containerName,
        HostConfig: {
          NetworkMode: networkName,
          // [FIX QUAN TRỌNG] Đổi thành false để debug. 
          // Nếu container crash, nó vẫn nằm đó để ta xem log.
          AutoRemove: false, 
          Memory: Math.floor(memoryMb * 1024 * 1024),
          NanoCpus: Math.floor(cpu * 1_000_000_000),
          ShmSize: Math.floor(shmMb * 1024 * 1024),
        },
        Env: [
          `EXAM_VM_USERNAME=${this.vmUsername}`,
          `EXAM_VM_PASSWORD=${this.vmPassword}`,
        ],
      });

      this.logger.log(
        `🧩 [VDI] Resource profile -> RAM=${memoryMb}MB CPU=${cpu} SHM=${shmMb}MB`,
      );

      await newContainer.start();
      
      // Chờ container sẵn sàng và có IP hợp lệ
      let ip: string | null = null;
      let serviceReady = false;
      const maxWaitSecondsRaw = Number(this.configService.get<string>('VDI_ALLOCATE_TIMEOUT_SEC') || '90');
      const maxWaitSeconds = Number.isFinite(maxWaitSecondsRaw) && maxWaitSecondsRaw > 0 ? maxWaitSecondsRaw : 90;
      const deadline = Date.now() + maxWaitSeconds * 1000;
      let attempts = 0;
      
      // Dùng deadline thay vì vòng lặp cố định để tránh thời gian thực bị kéo dài ngoài dự kiến.
      while (Date.now() < deadline) {
          attempts += 1;
          const data = await newContainer.inspect();
          
          // NẾU CONTAINER BỊ CRASH VÀ EXIT NGAY LẬP TỨC
          if (data.State.Status === 'exited') {
              this.logger.error(`❌ Container ${containerName} crashed immediately!`);
              // Ghi thêm log của container ra console để dễ debug
              const logs = await newContainer.logs({ stdout: true, stderr: true });
              console.log("--- DOCKER CRASH LOGS ---");
              console.log(logs.toString('utf8'));
              console.log("-------------------------");
              throw new Error('Máy thi gặp sự cố (Container crashed). Vui lòng báo Giám thị.');
          }

          ip = data.NetworkSettings.Networks[networkName]?.IPAddress;
          
          // Thử lấy IP từ mạng bất kỳ nếu mạng chỉ định không có
          if (!ip) {
             const anyNet = Object.values(data.NetworkSettings.Networks)[0] as any;
             ip = anyNet?.IPAddress;
          }
          
          if (!ip) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          const healthStatus = data.State?.Health?.Status;
          if (healthStatus === 'healthy') {
            serviceReady = true;
            break;
          }

          // Fallback cho image chưa có HEALTHCHECK.
          if (!healthStatus && attempts >= 8) {
            serviceReady = true;
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!ip) {
         throw new Error(`Container started but NO IP found after ${maxWaitSeconds} seconds.`);
      }

      if (!serviceReady) {
         throw new Error('Exam container network ready nhưng dịch vụ RDP chưa sẵn sàng.');
      }

      this.logger.log(`✅ [VDI] Ready: ${containerName} -> ${ip}`);
      return { ip, containerId: newContainer.id };

    } catch (error) {
      this.logger.error(`❌ [VDI Error] ${error.message}`);
      throw new InternalServerErrorException(error.message);
    }
  }

  // --- HÀM 2: TẠO TOKEN KẾT NỐI ---
  async generateConnectionToken(userId: number, targetIp: string): Promise<string> {
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
                'resize-method': 'display-update'
            }
        }
    };

    // Mã hóa
    const guacToken = this.encrypt(connectionParams);
    
    this.logger?.log(`🔒 Encrypted Token: ${guacToken.substring(0, 15)}...`);

    const sessionId = crypto.randomUUID();
    if (this.redis) {
        await this.redis.set(`vdi:auth:${sessionId}`, JSON.stringify({ token: guacToken }), 'EX', 30);
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

  async destroyContainer(userId: number, examId: number) {
    const containerName = `exam_${examId}_u${userId}`;
    try {
      const container = this.docker.getContainer(containerName);
      await container.stop({ t: 5 });
      await container.remove({ force: true });
    } catch (e) {}
  }
}
