import { Controller, Get, Query, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { VdiService } from './vdi.service';

@Controller('vdi')
export class VdiController {
  constructor(private readonly vdiService: VdiService) {}

  // API lấy Token để kết nối
  @Get('connect')
async connect(@Query('userId') userId: string) {
    if (!userId) throw new HttpException('Thiếu UserId', HttpStatus.BAD_REQUEST);
    const uid = Number(userId);

    const vm = await this.vdiService.allocateVm(uid);
    const token = this.vdiService.generateGuacamoleToken(vm);

    // CHIA TẢI: User ID chia lấy dư cho 3
    const nodeIndex = uid % 3; 
    
    return { 
        status: 'success',
        vm_info: { label: vm.username }, 
        token: token,
        ws_path: `/guaclite${nodeIndex}` // TRẢ VỀ ĐƯỜNG DẪN CỤ THỂ
    };
}
  
  // API nhả máy (khi logout)
  @Post('release')
  async release(@Body() body: { userId: number }) {
      await this.vdiService.releaseVm(body.userId);
      return { status: 'released' };
  }
}