import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exam } from '../../entities/exam.entity';
import { VdiService } from '../vdi/vdi.service';

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    // [FIX] Bỏ Inject Repository VM cũ
    private vdiService: VdiService,
  ) {}

  findAll() {
    return this.examsRepository.find();
  }

  findOne(id: number) {
    return this.examsRepository.findOneBy({ id });
  }

  // [FIX] Viết lại hàm này để khớp với logic Dynamic Container
  async startExamSession(userId: number, examId: number) {
    this.logger.log(`User ${userId} starting exam ${examId}`);

    // 1. Gọi VdiService để tạo Container
    // (Thay vì tìm trong DB như code cũ)
    const { ip } = await this.vdiService.allocateContainer(userId, examId);

    // 2. Tạo token kết nối
    // (Thay vì gọi generateGuacamoleToken cũ)
    const token = await this.vdiService.generateConnectionToken(userId, ip);

    return { 
      token, 
      type: 'vnc',
      ip 
    };
  }
}