require('dotenv').config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const GuacamoleLite = require('guacamole-lite');
const ClientConnection = require('guacamole-lite/lib/ClientConnection');

async function bootstrap() {
  
  // --- 1. OVERRIDE HÀM GIẢI MÃ ---
  ClientConnection.prototype.decryptToken = function () {
    // Xóa sạch rác DPI và cấu hình ngầm từ Frontend để bảo vệ Token
    delete this.query.dpi;
    delete this.query.audio;
    delete this.query.video;
    delete this.query.image;

    const tokenFromQuery = this.query.token;
    if (!tokenFromQuery) return {};

    try {
      const jsonStr = Buffer.from(tokenFromQuery, 'base64').toString('utf8');
      return JSON.parse(jsonStr); 
    } catch (e) {
      console.error(`❌ Token Decode Error: ${e.message}`);
      return {};
    }
  };

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: '*', credentials: true });
  const server = app.getHttpServer();

  // --- 2. CẤU HÌNH SERVER ---
  const clientOptions = {
    crypt: { cypher: 'AES-256-CBC', key: '12345678901234567890123456789012' },
    log: { level: 'ERRORS' } 
  };

  const guacCallbacks = {
    processConnectionSettings: function (settings, callback) {
      // Guacamole-lite tự bóc vỏ object, nên ta gán conn linh hoạt
      let conn = settings.connection || settings;

      if (!conn || !conn.settings || !conn.settings.hostname) {
          console.error("❌ Token không hợp lệ (Missing Hostname)");
          return callback(new Error("Invalid Token"), null);
      }

      // Khóa chặt các tham số bảo mật 
      conn.settings.security = 'any'; // Phối hợp với TLS bên xrdp
      conn.settings['ignore-cert'] = 'true'; // Chấp nhận chứng chỉ tự tạo ở entrypoint
      conn.settings.dpi = '96'; // Khắc phục vĩnh viễn "96?undefined"

      console.log(`🚀 [Guac Connect] Validated -> ${conn.settings.hostname} | Protocol: RDP | Security: ANY`);
      
      callback(null, settings);
    }
  };

  const guacServer = new GuacamoleLite(
    { server, path: '/guaclite' }, 
    { host: process.env.GUACD_HOST || '127.0.0.1', port: 4822 }, 
    clientOptions, 
    guacCallbacks
  );

  guacServer.on('error', (clientConnection, error) => {
      console.error('⚠️ Guacamole Client Error:', error.message);
  });

  await app.listen(3000);
}
bootstrap();