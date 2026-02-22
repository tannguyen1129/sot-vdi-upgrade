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
  
  // [FIX] Cấu hình mã hóa chuẩn
  private readonly algorithm = 'aes-256-cbc';
  // Key 32 bytes cố định
  private readonly key = Buffer.from('12345678901234567890123456789012', 'utf8');

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST') || 'umt_redis',
      port: 6379,
    });
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  // --- HÀM 1: CẤP PHÁT MÁY THI ---
  async allocateContainer(userId: number, examId: number): Promise<{ ip: string; containerId: string }> {
    const containerName = `exam_${examId}_u${userId}`;
    const imageName = 'sot-exam-linux:latest';

    this.logger.log(`🚀 [VDI] Allocating ${containerName}...`);

    try {
      const networks = await this.docker.listNetworks();
      const examNetObj = networks.find(n => n.Name.includes('exam_net'));
      if (!examNetObj) throw new Error('Không tìm thấy mạng exam_net!');
      const networkName = examNetObj.Name;

      try {
        const oldContainer = this.docker.getContainer(containerName);
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
          Memory: 1024 * 1024 * 1024,
          NanoCpus: 1000000000,
        },
        Env: [`VNC_PW=123456`]
      });

      await newContainer.start();
      
      // [FIX] CƠ CHẾ CHỜ VÀ LẤY IP THÔNG MINH
      let ip: string | null = null;
      
      // Thử tối đa 5 lần (tổng 5 giây), nếu có IP thì lấy luôn không cần đợi hết 5s
      for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
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
          
          if (ip) break; // Thoát vòng lặp ngay khi có IP
      }

      if (!ip) {
         throw new Error('Container started but NO IP found after 5 seconds.');
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
                username: 'student',
                password: '123456',
                security: 'any', // <--- Để Guacamole tự đàm phán TLS với xrdp
                'ignore-cert': 'true',
                'disable-audio': 'true',
                'resize-method': 'display-update'
            }
        }
    };

    // Mã hóa
    const guacToken = this.encrypt(JSON.stringify(connectionParams));
    
    this.logger?.log(`🔒 Encrypted Token: ${guacToken.substring(0, 15)}...`);

    const sessionId = crypto.randomUUID();
    if (this.redis) {
        await this.redis.set(`vdi:auth:${sessionId}`, JSON.stringify({ token: guacToken }), 'EX', 30);
    }

    return guacToken; 
  }

  // --- HÀM 3: MÃ HÓA ĐƠN GIẢN HÓA ---
  private encrypt(text: string): string {
    // [DEBUG MODE] Không mã hóa, chỉ encode Base64 để truyền đi
    return Buffer.from(text).toString('base64');
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
      await container.stop();
    } catch (e) {}
  }
}