import { Controller, Get, UseGuards, Request, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { VdiService } from './modules/vdi/vdi.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly vdiService: VdiService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  // [FIX] Cập nhật hàm này để dùng logic mới
  @UseGuards(JwtAuthGuard)
  @Post('allocate-resource') 
  async allocateResource(@Request() req) {
    const userId = req.user.id;
    const examId = 1; // Default hoặc lấy từ body

    // 1. Gọi hàm tạo container
    const { ip } = await this.vdiService.allocateContainer(userId, examId);
    
    // 2. Gọi hàm tạo token
    const token = await this.vdiService.generateConnectionToken(userId, ip);

    return { token, ip, type: 'rdp' };
  }
}
