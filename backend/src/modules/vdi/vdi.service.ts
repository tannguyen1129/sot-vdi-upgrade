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
          AutoRemove: true,
          Memory: 1024 * 1024 * 1024,
          NanoCpus: 1000000000,
        },
        Env: [`VNC_PW=123456`]
      });

      await newContainer.start();
      
      // Chờ VNC Server khởi động
      await new Promise(resolve => setTimeout(resolve, 3000));

      const data = await newContainer.inspect();
      const ip = data.NetworkSettings.Networks[networkName]?.IPAddress;

      if (!ip) {
         const anyNet = Object.values(data.NetworkSettings.Networks)[0] as any;
         if (anyNet?.IPAddress) return { ip: anyNet.IPAddress, containerId: newContainer.id };
         throw new Error('Container started but NO IP found.');
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
        type: 'vnc',
        settings: {
            hostname: targetIp,
            port: '5901',
            password: '123456',
            'ignore-cert': 'true', // Lưu ý: để string 'true' cho chắc
            'disable-audio': 'true'
        }
    };

    // Mã hóa
    const guacToken = this.encrypt(JSON.stringify(connectionParams));
    
    // Log kiểm tra
    this.logger.log(`🔒 Encrypted Token: ${guacToken.substring(0, 15)}...`);

    const sessionId = crypto.randomUUID();
    await this.redis.set(`vdi:auth:${sessionId}`, JSON.stringify({ token: guacToken }), 'EX', 30);

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