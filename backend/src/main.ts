require('dotenv').config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as crypto from 'crypto';
const GuacamoleLite = require('guacamole-lite');
const ClientConnection = require('guacamole-lite/lib/ClientConnection');

async function bootstrap() {

  const envKey = process.env.GUAC_CRYPT_KEY;
  console.log(`--------------------------------------------------`);
  console.log(`🔍 [DEBUG ENV] Node ID: ${process.env.HOSTNAME}`); // Hostname là ID container
  console.log(`🔍 [DEBUG ENV] Loaded Key: ${envKey ? 'YES' : 'NO'}`);
  if (envKey) {
      // Chỉ in 3 ký tự đầu và cuối để so sánh, không in hết lộ mật
      const len = envKey.length;
      console.log(`🔍 [DEBUG ENV] Key Preview: ${envKey.substring(0, 3)}...${envKey.substring(len-3)}`);
      console.log(`🔍 [DEBUG ENV] Key Length: ${len}`);
  } else {
      console.log(`⚠️ [WARNING] Đang dùng Fallback Key mặc định!`);
  }
  console.log(`--------------------------------------------------`);

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const server = app.getHttpServer();

  // --- 1. CẤU HÌNH ĐỒNG BỘ VỚI VDI.SERVICE ---
  const GUACD_HOST = process.env.GUACD_HOST || '127.0.0.1';
  const GUACD_PORT = 4822;

  // [QUAN TRỌNG] Logic Key này phải giống hệt trong vdi.service.ts
  const GUAC_KEY = process.env.GUAC_CRYPT_KEY || 'MySuperSecretKeyForEncryption123';
  const CYPHER_ALGO = 'aes-256-cbc'; // Khớp với 'AES-256-CBC'

  console.log(`✅ VDI Node Started. Target Guacd: ${GUACD_HOST}`);
  console.log(`🔑 Encryption Key (Preview): ${GUAC_KEY.substring(0, 4)}***`);

  // --- 2. SELF-TEST (TỰ KIỂM TRA MÃ HÓA) ---
  // Mục đích: Đảm bảo main.ts và vdi.service.ts dùng chung thuật toán
  try {
    const testPayload = JSON.stringify({ check: 'ok' });
    const iv = crypto.randomBytes(16);
    
    // Thử mã hóa
    const cipher = crypto.createCipheriv(CYPHER_ALGO, GUAC_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(testPayload), cipher.final()]);
    
    // Thử giải mã
    const decipher = crypto.createDecipheriv(CYPHER_ALGO, GUAC_KEY, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    
    if (decrypted.toString() === testPayload) {
        console.log("🟢 [CRYPTO CHECK] Self-test Passed! Hệ thống mã hóa hoạt động tốt.");
    } else {
        console.error("🔴 [CRYPTO CHECK] Self-test FAILED! Giải mã ra kết quả sai.");
    }
  } catch (e) {
    console.error(`🔴 [CRYPTO CHECK] CRITICAL ERROR: ${e.message}`);
    console.error("   -> Vui lòng kiểm tra lại độ dài GUAC_CRYPT_KEY (phải là 32 ký tự nếu dùng AES-256).");
  }

  // --- 3. CẤU HÌNH GUACAMOLE LITE ---
  const clientOptions = {
    // Enable guacamole-lite token decryption so dynamic routing doesn't reject tokens
    crypt: { key: GUAC_KEY, cypher: CYPHER_ALGO },
    log: { level: 'DEBUG' }
  };

  // Normalize token before guacamole-lite decrypts it (URL encoding/base64url safety)
  const originalDecrypt = ClientConnection.prototype.decryptToken;
  ClientConnection.prototype.decryptToken = function () {
    if (this.query && typeof this.query.token === 'string') {
      let t = this.query.token;
      if (t.includes('%')) {
        try { t = decodeURIComponent(t); } catch {}
      }
      if (t.includes(' ')) t = t.replace(/ /g, '+');
      if (t.includes('-') || t.includes('_')) {
        t = t.replace(/-/g, '+').replace(/_/g, '/');
        const pad = t.length % 4;
        if (pad) t = t + '='.repeat(4 - pad);
      }
      this.query.token = t;
    }
    return originalDecrypt.call(this);
  };

  const decryptToken = (tokenInput: any) => {
    try {
      let tokenStr = tokenInput;
      if (Array.isArray(tokenInput)) tokenStr = tokenInput[0];
      if (!tokenStr) throw new Error('Token is empty');

      // Normalize token (handle URL-encoded or space-replaced base64)
      if (typeof tokenStr === 'string') {
        if (tokenStr.includes('%')) {
          try { tokenStr = decodeURIComponent(tokenStr); } catch {}
        }
        if (tokenStr.includes(' ')) tokenStr = tokenStr.replace(/ /g, '+');
      }

      // Giải mã
      const jsonStr = Buffer.from(tokenStr, 'base64').toString('utf8');
      const payload = JSON.parse(jsonStr);
      
      const iv = Buffer.from(payload.iv, 'base64');
      const encryptedText = Buffer.from(payload.value, 'base64');
      
      const decipher = crypto.createDecipheriv(CYPHER_ALGO, GUAC_KEY, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return JSON.parse(decrypted.toString());
    } catch (e) {
      console.error(`❌ [Decryption Failed]: ${e.message}`);
      return null;
    }
  };

  const guacCallbacks = {
    processConnectionSettings: function (settings, callback) {
      const decrypted = decryptToken(settings.token);
      
      // [FIX] Nếu giải mã lỗi, trả về null settings thay vì gọi callback lỗi
      // Điều này giúp tránh việc GuacamoleLite throw exception làm sập app
      if (!decrypted) {
        console.error("⛔ Invalid Token. Rejecting connection silently.");
        return callback(null, null); 
      }

      const connection = decrypted.connection;
      const targetSettings = connection.settings || connection;
      
      // Fix các tham số
      const normalizeDimension = (value) => {
          const n = Number(value);
          return Number.isFinite(n) ? Math.max(100, Math.floor(n)) : undefined;
      };

      if (settings.width) targetSettings.width = normalizeDimension(settings.width);
      if (settings.height) targetSettings.height = normalizeDimension(settings.height);
      if (settings.dpi) targetSettings.dpi = Number(settings.dpi);

      // Gán type mặc định nếu thiếu
      if (!connection.type) connection.type = 'rdp';

      console.log(`🎯 [Connected] VM IP: ${targetSettings.hostname}`);
      
      callback(null, connection);
    }
  };

  const guacServer = new GuacamoleLite(
    { server, path: '/guaclite' }, 
    { host: GUACD_HOST, port: GUACD_PORT }, 
    clientOptions, 
    guacCallbacks
  );

  // --- 4. [FIX QUAN TRỌNG] BẮT LỖI SERVER ĐỂ KHÔNG BỊ CRASH ---
  guacServer.on('error', (clientConnection, error) => {
      console.error('⚠️ Guacamole Client Error:', error.message);
      // Chỉ log lỗi, không throw exception để giữ server luôn chạy
  });

  await app.listen(3000);
}
bootstrap();
