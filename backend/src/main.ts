require('dotenv').config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const GuacamoleLite = require('guacamole-lite');
const ClientConnection = require('guacamole-lite/lib/ClientConnection');

async function bootstrap() {
  
  // --- 1. OVERRIDE HÀM GIẢI MÃ ---
  ClientConnection.prototype.decryptToken = function () {
    const tokenFromQuery = this.query.token;
    
    if (!tokenFromQuery) {
        // Trả về null để thư viện tự xử lý lỗi, tránh throw crash server
        console.error("❌ Token missing");
        return null;
    }

    try {
      // Decode Base64
      const jsonStr = Buffer.from(tokenFromQuery, 'base64').toString('utf8');
      const parsed = JSON.parse(jsonStr); 

      // [QUAN TRỌNG] Đảm bảo luôn trả về đúng cấu trúc lồng nhau
      const connectionObject = {
          connection: {
              type: parsed.type || 'vnc',
              settings: parsed.settings || {} // Nếu thiếu settings, gán rỗng
          }
      };
      
      return connectionObject;

    } catch (e) {
      console.error(`❌ Token Decode Error: ${e.message}`);
      // Trả về cấu trúc mặc định rỗng để processConnectionSettings xử lý tiếp
      // thay vì để thư viện crash
      return { connection: { type: 'vnc', settings: {} } };
    }
  };

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: '*', credentials: true });
  const server = app.getHttpServer();

  // --- 2. CẤU HÌNH SERVER ---
  const clientOptions = {
    // Crypt dummy để thư viện vui lòng
    crypt: {
      cypher: 'AES-256-CBC',
      key: '12345678901234567890123456789012' 
    },
    log: { level: 'ERRORS' } 
  };

  const guacCallbacks = {
    processConnectionSettings: function (settings, callback) {
      // 1. Kiểm tra settings tồn tại
      if (!settings) {
          return callback(new Error("Invalid settings"), null);
      }

      // 2. Lấy connection object
      let conn = settings.connection;
      if (!conn) {
          // Fallback: nếu settings chính là conn (cấu trúc phẳng)
          conn = settings;
      }

      // 3. [FIX CRASH] Khởi tạo type nếu thiếu
      if (!conn.type) conn.type = 'vnc';

      // 4. [FIX CRASH - QUAN TRỌNG NHẤT]
      // Đảm bảo conn.settings luôn là object, không bao giờ là undefined
      if (!conn.settings) {
          conn.settings = {}; 
      }

      // 5. Bây giờ truy cập .width, .height, .dpi thoải mái
      if (!conn.settings.width) conn.settings.width = 1024;
      if (!conn.settings.height) conn.settings.height = 768;
      conn.settings.dpi = 96;

      // 6. Kiểm tra hostname
      if (!conn.settings.hostname) {
          // Cố gắng tìm hostname ở cấp cha nếu cấp con không có
          if (conn.hostname) conn.settings.hostname = conn.hostname;
          else {
               console.error("❌ Missing hostname!");
               return callback(new Error("Missing hostname"), null);
          }
      }

      console.log(`🚀 [Guac Connect] Validated -> ${conn.settings.hostname} (${conn.type})`);
      
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