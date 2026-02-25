require('dotenv').config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const GuacamoleLite = require('guacamole-lite');

const GUAC_TOKEN_CIPHER = 'AES-256-CBC';
const DEFAULT_GUAC_TOKEN_KEY = '12345678901234567890123456789012';

function resolveGuacTokenKey(): Buffer {
  const rawKey = process.env.GUAC_TOKEN_KEY || DEFAULT_GUAC_TOKEN_KEY;
  const keyBuffer = Buffer.from(rawKey, 'utf8');

  if (keyBuffer.length === 32) {
    return keyBuffer;
  }

  // Fallback an toàn: chuẩn hóa về đúng 32 bytes cho AES-256.
  return require('crypto').createHash('sha256').update(rawKey).digest();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: '*', credentials: true });
  const server = app.getHttpServer();

  // --- CẤU HÌNH GUACAMOLE SERVER ---
  const clientOptions = {
    crypt: { cypher: GUAC_TOKEN_CIPHER, key: resolveGuacTokenKey() },
    log: { level: 'ERRORS' },
  };

  const guacCallbacks = {
    processConnectionSettings: function (settings, callback) {
      // guacamole-lite đã merge settings thành object phẳng ở settings.connection
      const connSettings = settings?.connection;

      if (!connSettings || !connSettings.hostname) {
          console.error('❌ Token không hợp lệ (Missing Hostname)');
          return callback(new Error('Invalid Token'), null);
      }

      // Khóa cứng tham số an toàn cho phiên thi + sanitize số từ query
      const sanitizeInt = (value: unknown, fallback: number, min: number, max: number): number => {
        const parsed = Number.parseInt(String(value ?? ''), 10);
        if (Number.isNaN(parsed)) {
          return fallback;
        }
        return Math.max(min, Math.min(max, parsed));
      };
      connSettings.width = sanitizeInt(connSettings.width, 1600, 640, 7680);
      connSettings.height = sanitizeInt(connSettings.height, 900, 480, 4320);
      connSettings.dpi = sanitizeInt(connSettings.dpi, 96, 72, 300);
      connSettings['ignore-cert'] = 'true';
      connSettings.security = connSettings.security || 'any';

      console.log(`🚀 [Guac Connect] Validated -> ${connSettings.hostname}:${connSettings.port || '3389'}`);
      callback(null, settings);
    },
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
