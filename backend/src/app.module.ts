import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';

import { UsersModule } from './modules/users/users.module'; // Mới
import { AuthModule } from './modules/auth/auth.module';
import { VdiModule } from './modules/vdi/vdi.module';
import { AdminModule } from './modules/admin/admin.module';
import { ExamsModule } from './modules/exams/exams.module';

import { User } from './entities/user.entity';
import { Vm } from './entities/vm.entity';
import { Exam } from './entities/exam.entity';

import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { ScheduleModule } from '@nestjs/schedule/dist/schedule.module';

function asBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // 2. Cấu hình ConfigModule để đọc file .env
    ConfigModule.forRoot({
      isGlobal: true, // Để dùng được ở mọi nơi
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      // 3. Thay thế giá trị cứng bằng biến môi trường
      host: process.env.DB_HOST || 'umt_db',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'umt_user',
      password: process.env.DB_PASSWORD || 'umt_pass',
      database: process.env.DB_NAME || 'vdi_portal_db',

      entities: [__dirname + '/**/*.entity{.ts,.js}'], // Tự động load hết entity
      // Giữ synchronize mặc định true theo yêu cầu hiện tại.
      synchronize: asBool(process.env.TYPEORM_SYNCHRONIZE, true),
      // Migration-safe knobs: cho phép bật migration có kiểm soát bằng env.
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: asBool(process.env.TYPEORM_MIGRATIONS_RUN, false),
      migrationsTableName:
        process.env.TYPEORM_MIGRATIONS_TABLE || 'typeorm_migrations',
    }),
    // Đăng ký đủ 4 anh hào
    UsersModule,
    AuthModule,
    VdiModule,
    AdminModule,
    ExamsModule,
    MonitoringModule,
  ],
})
export class AppModule {}
