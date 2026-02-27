import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exam } from '../../entities/exam.entity';
import { VdiService } from '../vdi/vdi.service';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    // [FIX] Bỏ Inject Repository VM cũ
    private vdiService: VdiService,
    private monitoringService: MonitoringService,
    private configService: ConfigService,
  ) {}

  findAll() {
    return this.examsRepository.find();
  }

  async findOne(id: number) {
    const exam = await this.examsRepository.findOneBy({ id });
    if (!exam) {
      throw new NotFoundException(`Không tìm thấy kỳ thi #${id}`);
    }
    return exam;
  }

  async create(createExamDto: Partial<Exam>) {
    this.validateExamTimeRange(createExamDto);
    const exam = this.examsRepository.create({
      ...createExamDto,
      startTime: createExamDto.startTime
        ? new Date(createExamDto.startTime)
        : null,
      endTime: createExamDto.endTime ? new Date(createExamDto.endTime) : null,
    } as Partial<Exam>);
    return this.examsRepository.save(exam);
  }

  async update(id: number, updateExamDto: Partial<Exam>) {
    const exam = await this.findOne(id);

    if (
      updateExamDto.startTime !== undefined ||
      updateExamDto.endTime !== undefined
    ) {
      this.validateExamTimeRange({
        startTime: updateExamDto.startTime ?? exam.startTime,
        endTime: updateExamDto.endTime ?? exam.endTime,
      } as Partial<Exam>);
    }

    Object.assign(exam, {
      ...updateExamDto,
      startTime:
        updateExamDto.startTime !== undefined
          ? new Date(updateExamDto.startTime)
          : exam.startTime,
      endTime:
        updateExamDto.endTime !== undefined
          ? new Date(updateExamDto.endTime)
          : exam.endTime,
    });

    return this.examsRepository.save(exam);
  }

  async remove(id: number) {
    const exam = await this.findOne(id);
    await this.examsRepository.remove(exam);
    return { message: `Đã xóa kỳ thi #${id}` };
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
    const { token: monitoringToken, sessionId } =
      this.monitoringService.createMonitoringToken(userId, examId);
    const vmUsername =
      this.configService.get<string>('EXAM_VM_USERNAME') || 'student';

    return {
      token,
      type: 'rdp',
      ip,
      vmUsername,
      monitoringToken,
      monitoringSessionId: sessionId,
    };
  }

  private validateExamTimeRange(data: Partial<Exam>) {
    if (!data.startTime || !data.endTime) {
      return;
    }

    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Thời gian kỳ thi không hợp lệ');
    }
    if (end <= start) {
      throw new BadRequestException(
        'Thời gian kết thúc phải lớn hơn thời gian bắt đầu',
      );
    }
  }
}
