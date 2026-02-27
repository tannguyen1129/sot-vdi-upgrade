import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ExamLogSource } from '../../entities/exam-log.entity';
import { UserRole } from '../../entities/user.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MonitoringService } from './monitoring.service';

@Controller('monitoring')
export class MonitoringController {
  constructor(private monitoringService: MonitoringService) {}

  @UseGuards(JwtAuthGuard)
  @Post('log')
  async logActivity(@Req() req: Request & { user?: any }, @Body() body: any) {
    const examId = this.toInt(body?.examId, 'examId');
    const action = String(body?.action || '').trim();
    if (!action) {
      throw new BadRequestException('action is required');
    }

    const authUserId = Number(req.user?.id);
    if (!Number.isFinite(authUserId) || authUserId <= 0) {
      throw new UnauthorizedException('Invalid auth context');
    }

    const bodyUserId = Number(body?.userId);
    const userId =
      req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.PROCTOR
        ? Number.isFinite(bodyUserId) && bodyUserId > 0
          ? bodyUserId
          : authUserId
        : authUserId;

    return this.monitoringService.createEvent({
      examId,
      userId,
      action,
      details: typeof body?.details === 'string' ? body.details : undefined,
      clientIp: this.resolveClientIp(req),
      source: ExamLogSource.WEB_CLIENT,
      sessionId:
        typeof body?.sessionId === 'string' ? body.sessionId : undefined,
      meta: this.asRecord(body?.meta),
    });
  }

  @Post('beacon')
  async logBeacon(@Req() req: Request, @Body() body: any) {
    const action = String(body?.action || '').trim();
    const monitorToken = String(body?.monitorToken || '').trim();

    if (!action || !monitorToken) {
      throw new BadRequestException('action and monitorToken are required');
    }

    const payload = this.monitoringService.verifyMonitoringToken(monitorToken);

    if (body?.examId && Number(body.examId) !== payload.examId) {
      throw new UnauthorizedException('Exam mismatch');
    }

    if (body?.userId && Number(body.userId) !== payload.userId) {
      throw new UnauthorizedException('User mismatch');
    }

    return this.monitoringService.createEvent({
      examId: payload.examId,
      userId: payload.userId,
      action,
      details: typeof body?.details === 'string' ? body.details : undefined,
      clientIp: this.resolveClientIp(req),
      source: ExamLogSource.BEACON,
      sessionId:
        typeof body?.sessionId === 'string'
          ? body.sessionId
          : payload.sessionId,
      meta: {
        ...(this.asRecord(body?.meta) || {}),
        via: 'sendBeacon',
      },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROCTOR)
  @Get(':examId/logs')
  async getExamLogs(
    @Param('examId') examId: string,
    @Query('take') take?: string,
  ) {
    const safeExamId = this.toInt(examId, 'examId');
    const safeTake = take ? Number(take) : 100;
    return this.monitoringService.getRecentLogsByExam(safeExamId, safeTake);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROCTOR)
  @Get(':examId/live')
  async getLiveStatus(@Param('examId') examId: string) {
    return this.monitoringService.getLiveStatus(this.toInt(examId, 'examId'));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROCTOR)
  @Get(':examId/all')
  async getAllLogs(@Param('examId') examId: string) {
    return this.monitoringService.getLogsByExam(this.toInt(examId, 'examId'));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROCTOR)
  @Delete(':examId/clear')
  async clearLogs(@Param('examId') examId: string) {
    await this.monitoringService.clearLogsByExam(this.toInt(examId, 'examId'));
    return { message: 'Đã xóa toàn bộ nhật ký giám sát.' };
  }

  private resolveClientIp(req: Request): string {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (typeof xForwardedFor === 'string' && xForwardedFor.length > 0) {
      return xForwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
      return xForwardedFor[0];
    }

    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) {
      return realIp;
    }

    return req.socket?.remoteAddress || 'N/A';
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private toInt(value: unknown, field: string): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }
    return Math.floor(num);
  }
}
