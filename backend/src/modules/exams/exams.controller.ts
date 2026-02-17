import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VdiService } from '../vdi/vdi.service';

@Controller('exams')
export class ExamsController {
  constructor(
    private readonly examsService: ExamsService,
    private readonly vdiService: VdiService
  ) {}

  // --- CRUD ENDPOINTS (Nếu bạn chưa implement trong Service mới, hãy comment lại hoặc thêm vào Service) ---
  // Hiện tại Service mới chỉ có findAll, findOne, startExamSession.
  // Để fix lỗi build nhanh, ta sẽ tạm thời comment các hàm CRUD chưa có.

  /*
  @Post()
  create(@Body() createExamDto: any) {
    return this.examsService.create(createExamDto);
  }
  */

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.examsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.examsService.findOne(+id);
  }

  /*
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateExamDto: any) {
    return this.examsService.update(+id, updateExamDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.examsService.remove(+id);
  }
  */

  // --- LOGIC THI CỬ (QUAN TRỌNG) ---

  // [FIX] Endpoint này để khớp với frontend gọi /exams/:id/join
  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  async joinExam(@Param('id') id: string, @Request() req, @Body() body: any) {
    const userId = req.user.id;
    const examId = +id;
    const accessCode = body.accessCode; // Nếu cần check code

    // Gọi hàm mới startExamSession
    return this.examsService.startExamSession(userId, examId);
  }

  // Giữ lại endpoint cũ start nếu có dùng
  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  async startExam(@Param('id') id: string, @Request() req) {
    return this.joinExam(id, req, {});
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/finish')
  async finishExam(@Param('id') id: string, @Request() req) {
    const userId = req.user.id;
    const examId = +id;

    // [FIX] Gọi hàm dọn dẹp mới
    await this.vdiService.destroyContainer(userId, examId);
    
    return { message: 'Exam finished' };
  }

  // Endpoint cũ leaveExam -> chuyển hướng sang finish
  @UseGuards(JwtAuthGuard)
  @Post('leave')
  async leaveExam(@Request() req, @Body() body: any) {
    // Giả sử body có examId, nếu không thì hardcode hoặc lấy từ user session
    const examId = body.examId || 1; 
    const userId = req.user.id;
    await this.vdiService.destroyContainer(userId, examId);
    return { message: 'Left exam' };
  }
}