import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Dùng require để tránh lỗi constructor
const GuacamoleLite = require('guacamole-lite');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const server = app.getHttpServer();

  // --- DANH SÁCH 3 WORKER ---
  const guacdNodes = [
    { host: '101.47.159.90', port: 4822 }, // Index 0
    { host: '101.47.159.85', port: 4822 }, // Index 1
    { host: '101.47.159.88', port: 4822 }, // Index 2
  ];

  // Key mã hóa (Đảm bảo khớp với .env hoặc hardcode để test)
  const guacCrypt = {
    cypher: 'AES-256-CBC',
    key: process.env.GUAC_CRYPT_KEY || 'MySuperSecretKeyForEncryption123',
  };

  const clientOptions = {
    crypt: guacCrypt,
    log: { level: 'INFO' }, // Log INFO để dễ debug
    maxInactivityTime: 0
    // [QUAN TRỌNG] Đã xóa 'allowedUnencryptedConnectionSettings' để tránh lỗi Crash
  };

  const guacCallbacks = {
    processConnectionSettings: function (settings, callback) {
      if (!settings || !settings.connection) {
        return callback(new Error('Missing connection settings'));
      }

      try {
        const connection = settings.connection;
        const targetSettings = connection.settings ? connection.settings : connection;

        // Chuẩn hóa kích thước màn hình
        const normalizeDimension = (value: unknown, multiple = 4, min = 100) => {
          const n = Number(value);
          if (!Number.isFinite(n)) return undefined;
          const intVal = Math.max(min, Math.floor(n));
          return intVal - (intVal % multiple);
        };

        if (settings.width) targetSettings.width = normalizeDimension(settings.width);
        if (settings.height) targetSettings.height = normalizeDimension(settings.height);
        if (settings.dpi) targetSettings.dpi = Math.round(Number(settings.dpi));

        console.log(`[Guac] 🟢 Connection accepted for VM: ${targetSettings.hostname}`);
        callback(null, settings);
      } catch (err) {
        console.error('[Guac] 🔴 Token Validation Error:', err.message);
        callback(new Error('Token validation failed'));
      }
    }
  };

  // --- KÍCH HOẠT VÒNG LẶP CHIA TẢI ---
  // @ts-ignore
  guacdNodes.forEach((node, index) => {
    // @ts-ignore
    new GuacamoleLite(
      { server, path: `/guaclite${index}` }, // Mount các đường dẫn /guaclite0, 1, 2
      node, 
      clientOptions,
      guacCallbacks
    );
    console.log(`[VDI] 🚀 Worker ${index} Ready: /guaclite${index} -> ${node.host}`);
  });

  await app.listen(3000);
  console.log('VDI Backend running on port 3000');
}
bootstrap();