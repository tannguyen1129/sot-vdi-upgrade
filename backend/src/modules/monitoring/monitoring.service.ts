import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { DeepPartial, Repository } from 'typeorm';
import { ExamLog, ExamLogSource } from '../../entities/exam-log.entity';
import { User } from '../../entities/user.entity';
import { Vm } from '../../entities/vm.entity';
import {
  inferSeverity,
  isViolationAction,
  normalizeMonitoringAction,
  violationScoreFor,
} from './monitoring.constants';

export interface CreateMonitoringEventInput {
  examId: number;
  userId: number;
  action: string;
  details?: string;
  clientIp?: string;
  source?: ExamLogSource;
  sessionId?: string;
  meta?: Record<string, unknown>;
}

export interface MonitoringTokenPayload {
  userId: number;
  examId: number;
  sessionId: string;
  exp: number;
}

export interface LiveStudentStatus {
  student: {
    id: number;
    fullName: string;
    username: string;
    className: string;
  };
  vm: {
    ip: string;
    username: string;
    port: number;
  } | null;
  client: {
    ip: string;
    lastAction: string;
    lastSeen: Date | null;
  };
  isViolation: boolean;
  riskScore: number;
}

@Injectable()
export class MonitoringService {
  private readonly monitorTokenSecret: string;

  constructor(
    @InjectRepository(ExamLog)
    private examLogRepo: Repository<ExamLog>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Vm)
    private vmRepo: Repository<Vm>,
    private configService: ConfigService,
  ) {
    this.monitorTokenSecret =
      this.configService.get<string>('MONITORING_TOKEN_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'monitoring-secret';
  }

  createMonitoringToken(userId: number, examId: number): { token: string; sessionId: string } {
    const sessionId = crypto.randomUUID();
    const ttlSecondsRaw = Number(this.configService.get<string>('MONITORING_TOKEN_TTL_SEC') || '43200');
    const ttlSeconds = Number.isFinite(ttlSecondsRaw) && ttlSecondsRaw > 60 ? ttlSecondsRaw : 43200;

    const payload: MonitoringTokenPayload = {
      userId,
      examId,
      sessionId,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };

    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.signMonitoringPayload(encoded);
    return { token: `${encoded}.${signature}`, sessionId };
  }

  verifyMonitoringToken(token: string): MonitoringTokenPayload {
    const [encoded, signature] = String(token || '').split('.');
    if (!encoded || !signature) {
      throw new Error('Invalid monitoring token format');
    }

    const expected = this.signMonitoringPayload(encoded);
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
      throw new Error('Invalid monitoring token signature');
    }

    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as MonitoringTokenPayload;
    if (!parsed?.userId || !parsed?.examId || !parsed?.sessionId || !parsed?.exp) {
      throw new Error('Malformed monitoring token payload');
    }

    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Monitoring token expired');
    }

    return parsed;
  }

  async createEvent(input: CreateMonitoringEventInput): Promise<ExamLog> {
    const action = normalizeMonitoringAction(input.action);

    const logInput: DeepPartial<ExamLog> = {
      examId: input.examId,
      userId: input.userId,
      action,
      details: input.details?.trim() || null,
      clientIp: input.clientIp || null,
      source: input.source || ExamLogSource.WEB_CLIENT,
      severity: inferSeverity(action),
      sessionId: input.sessionId || null,
      violationScore: violationScoreFor(action),
      meta: input.meta || null,
    };
    const log = this.examLogRepo.create(logInput);

    return this.examLogRepo.save(log);
  }

  async getRecentLogsByExam(examId: number, take = 100) {
    const normalizedTake = Number.isFinite(take) && take > 0 ? Math.min(take, 500) : 100;
    return this.examLogRepo.find({
      where: { examId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: normalizedTake,
    });
  }

  async getLogsByExam(examId: number) {
    return this.examLogRepo.find({
      where: { examId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async getLiveStatus(examId: number): Promise<LiveStudentStatus[]> {
    const students = await this.userRepo.find({
      where: { examId },
      order: { username: 'ASC' },
    });
    if (!students.length) return [];

    const userIds = students.map((s) => s.id);
    const [allocatedVms, latestLogs] = await Promise.all([
      this.vmRepo.find({ where: { isAllocated: true } }),
      this.examLogRepo
        .createQueryBuilder('log')
        .where('log.examId = :examId', { examId })
        .andWhere('log.userId IN (:...userIds)', { userIds })
        .distinctOn(['log.userId'])
        .orderBy('log.userId', 'ASC')
        .addOrderBy('log.createdAt', 'DESC')
        .getMany(),
    ]);

    const logByUserId = new Map<number, ExamLog>();
    latestLogs.forEach((log) => logByUserId.set(log.userId, log));

    return students.map((student) => {
      const myVm = allocatedVms.find((vm) => vm.allocatedToUserId === student.id);
      const lastLog = logByUserId.get(student.id);

      return {
        student: {
          id: student.id,
          fullName: student.fullName,
          username: student.username,
          className: student.className,
        },
        vm: myVm
          ? {
              ip: myVm.ip,
              username: myVm.username,
              port: myVm.port,
            }
          : null,
        client: {
          ip: lastLog?.clientIp || 'N/A',
          lastAction: lastLog?.action || 'NONE',
          lastSeen: lastLog?.createdAt || null,
        },
        isViolation: Boolean(lastLog && isViolationAction(lastLog.action)),
        riskScore: lastLog?.violationScore || 0,
      };
    });
  }

  async clearLogsByExam(examId: number) {
    return this.examLogRepo.delete({ examId });
  }

  private signMonitoringPayload(encodedPayload: string): string {
    return crypto.createHmac('sha256', this.monitorTokenSecret).update(encodedPayload).digest('base64url');
  }
}
