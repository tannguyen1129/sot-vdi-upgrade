import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UserRole } from '../../entities/user.entity';
import { JwtService } from '@nestjs/jwt'; // <--- Import JwtService

@Injectable()
export class AuthService implements OnModuleInit {
  // Tạo Logger để in ra console cho đẹp
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService, // <--- Inject JwtService
  ) {}

  // 1. HÀM TỰ ĐỘNG CHẠY KHI BACKEND KHỞI ĐỘNG
  async onModuleInit() {
    this.logger.log('🔄 Đang kiểm tra tài khoản Admin mặc định...');
    await this.createDefaultAdmin();
  }

  // 2. Logic tạo Admin (Tự động)
  private async createDefaultAdmin() {
    try {
      // Kiểm tra xem đã có admin chưa
      const existingAdmin = await this.usersService.findOne('admin');

      if (existingAdmin) {
        // Tự phục hồi quyền admin nếu tài khoản admin bị sai role trong DB.
        if (existingAdmin.role !== UserRole.ADMIN) {
          existingAdmin.role = UserRole.ADMIN;
          await this.usersService.save(existingAdmin);
          this.logger.warn(
            '⚠️ Đã tự động nâng quyền tài khoản admin lên ADMIN.',
          );
        } else {
          this.logger.log('✅ Admin đã tồn tại. Bỏ qua bước tạo mới.');
        }
        return;
      }

      // Nếu chưa có thì tạo mới
      await this.usersService.create({
        username: 'admin',
        password: '7816404122Tan', // Mật khẩu của bạn
        fullName: 'Super Administrator',
        role: UserRole.ADMIN,
        className: 'System',
      });

      this.logger.log(
        '🎉 ĐÃ TẠO ADMIN THÀNH CÔNG! (User: admin | Pass: 7816404122Tan)',
      );
    } catch (error) {
      this.logger.error('❌ Lỗi khi tạo Admin: ' + error.message);
    }
  }

  // 3. Logic Đăng nhập (Giữ nguyên để Frontend dùng)
  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user && user.password === pass) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  // 4. HÀM LOGIN MỚI (TẠO JWT)
  async login(user: any) {
    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload), // Tạo chuỗi mã hóa
      user: user, // Trả kèm thông tin user để hiển thị
    };
  }
}
