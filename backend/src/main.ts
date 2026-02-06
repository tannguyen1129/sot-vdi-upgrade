import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EventEmitter } from 'events'; // Dùng để tạo Server giả
const GuacamoleLite = require('guacamole-lite');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(3000);
  const server = app.getHttpServer();
  
  console.log('✅ VDI Backend running on port 3000');

  // Cấu hình Node Worker
  const guacdNodes = [
    { host: '101.47.159.90', port: 4822 }, // guaclite0
    { host: '101.47.159.85', port: 4822 }, // guaclite1
    { host: '101.47.159.88', port: 4822 }, // guaclite2
  ];

  const GUAC_KEY = process.env.GUAC_CRYPT_KEY || 'MySuperSecretKeyForEncryption123';
  console.log(`🔐 Using Encryption Key: ${GUAC_KEY === 'MySuperSecretKeyForEncryption123' ? 'Default' : 'Custom ENV'}`);

  const clientOptions = {
    crypt: { cypher: 'AES-256-CBC', key: GUAC_KEY },
    log: { level: 'DEBUG' },
  };

  const guacCallbacks = {
    processConnectionSettings: function (settings, callback) {
      if (!settings || !settings.connection) return callback(new Error('Missing settings'));
      try {
         const connection = settings.connection;
         const targetSettings = connection.settings ? connection.settings : connection;
         
         const normalizeDimension = (value: unknown) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return undefined;
            return Math.max(100, Math.floor(n));
         };

         if (settings.width) targetSettings.width = normalizeDimension(settings.width) || 1024;
         if (settings.height) targetSettings.height = normalizeDimension(settings.height) || 768;
         if (settings.dpi) targetSettings.dpi = Math.round(Number(settings.dpi));

         console.log(`🎯 Target VM: ${targetSettings.hostname} (${targetSettings.width}x${targetSettings.height})`); 
         callback(null, settings);
      } catch (e) {
         callback(e);
      }
    }
  };

  // --- [FIX LOGIC] DÙNG DUMMY SERVER ĐỂ TRÁNH CRASH ---
  const guacInstances = guacdNodes.map((node, index) => {
    // 1. Tạo một Server giả (EventEmitter) để lừa GuacamoleLite
    const dummyServer = new EventEmitter();
    
    // 2. Khởi tạo Guacamole gắn vào Server giả này
    const guac = new GuacamoleLite(
      { server: dummyServer, path: `/guaclite${index}` }, // Path chuẩn
      node,
      clientOptions,
      guacCallbacks
    );

    return { guac, dummyServer, path: `/guaclite${index}` };
  });

  // --- [MANUAL ROUTING] TỰ ĐIỀU HƯỚNG REQUEST ---
  server.on('upgrade', (request, socket, head) => {
    const url = request.url;
    // Cắt bỏ query string (?token=...) để lấy path sạch
    const pathname = url.split('?')[0]; 

    // Tìm worker phù hợp
    const target = guacInstances.find(g => g.path === pathname);

    if (target) {
      console.log(`✅ Routing ${pathname} -> Worker`);
      
      // [QUAN TRỌNG] Sửa lại URL của request thành path sạch
      // Để thư viện ws bên trong Guacamole khớp path
      request.url = pathname; 

      // Phát sự kiện 'upgrade' vào Server giả -> Guacamole sẽ bắt được
      target.dummyServer.emit('upgrade', request, socket, head);
    } else {
      // socket.destroy(); // Không khớp thì hủy (hoặc kệ cho Next.js xử lý)
    }
  });
}
bootstrap();