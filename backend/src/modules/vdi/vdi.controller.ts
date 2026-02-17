import { Controller, Post, UseGuards, Request, Body } from '@nestjs/common';
import { VdiService } from './vdi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('vdi')
export class VdiController {
  constructor(private readonly vdiService: VdiService) {}

  @UseGuards(JwtAuthGuard)
  @Post('allocate')
  async allocate(@Request() req, @Body() body: { examId?: number }) {
    const userId = req.user.id;
    // Lấy examId từ body hoặc mặc định là 1
    const examId = body.examId || 1;

    // [FIX] 1. Cấp phát Container (Thay thế allocateVm)
    const { ip } = await this.vdiService.allocateContainer(userId, examId);

    // [FIX] 2. Tạo Token kết nối (Thay thế generateGuacamoleToken)
    const token = await this.vdiService.generateConnectionToken(userId, ip);

    return { 
      token,
      type: 'vnc',
      ip 
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('release')
  async release(@Request() req, @Body() body: { examId?: number }) {
    const userId = req.user.id;
    const examId = body.examId || 1;

    // [FIX] Thay thế releaseVm bằng destroyContainer
    await this.vdiService.destroyContainer(userId, examId);
    
    return { message: 'Released successfully' };
  }
}