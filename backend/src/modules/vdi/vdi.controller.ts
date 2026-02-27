import {
  BadRequestException,
  Body,
  Controller,
  Patch,
  Get,
  Headers,
  Param,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VdiService } from './vdi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkerRegistryService } from './worker-registry.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('vdi')
export class VdiController {
  constructor(
    private readonly vdiService: VdiService,
    private readonly workerRegistryService: WorkerRegistryService,
    private readonly configService: ConfigService,
  ) {}

  private assertClusterToken(token: string) {
    const expected =
      this.configService.get<string>('WORKER_CLUSTER_TOKEN') ||
      this.configService.get<string>('WORKER_HEARTBEAT_TOKEN');
    if (!expected) return;
    if (token !== expected) {
      throw new UnauthorizedException('Invalid cluster token');
    }
  }

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
      type: 'rdp',
      ip,
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

  @Post('workers/heartbeat')
  async workerHeartbeat(
    @Headers('x-worker-token') workerToken: string,
    @Body() body: any,
  ) {
    this.assertClusterToken(workerToken);

    const code = String(body?.code || '').trim();
    const name = String(body?.name || '').trim();
    if (!code || !name) {
      throw new BadRequestException('code and name are required');
    }

    const toNumber = (value: unknown, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

    return this.workerRegistryService.upsertHeartbeat({
      code,
      name,
      apiBaseUrl: body?.apiBaseUrl ? String(body.apiBaseUrl) : null,
      totalCpuCores: toNumber(body?.totalCpuCores, 0),
      totalMemoryMb: toNumber(body?.totalMemoryMb, 0),
      reservedCpuCores: toNumber(body?.reservedCpuCores, 0),
      reservedMemoryMb: toNumber(body?.reservedMemoryMb, 0),
      vmCpuCores: toNumber(body?.vmCpuCores, 1.5),
      vmMemoryMb: toNumber(body?.vmMemoryMb, 2048),
      activeSessions: toNumber(body?.activeSessions, 0),
      metadata:
        body?.metadata && typeof body.metadata === 'object'
          ? body.metadata
          : null,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROCTOR)
  @Get('workers')
  async getWorkers() {
    return this.workerRegistryService.getWorkers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROCTOR)
  @Get('workers/summary')
  async getWorkersSummary() {
    return this.workerRegistryService.getClusterSummary();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROCTOR)
  @Post('workers/reconcile')
  async manualReconcileDispatches() {
    try {
      return await this.vdiService.reconcileDispatchesNow();
    } catch (error) {
      throw new BadRequestException(
        error?.message || 'Cannot run manual reconcile now',
      );
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROCTOR)
  @Patch('workers/:code')
  async patchWorkerStatus(@Param('code') code: string, @Body() body: any) {
    try {
      const updated = await this.workerRegistryService.setWorkerStatus(code, {
        isEnabled:
          typeof body?.isEnabled === 'boolean' ? body.isEnabled : undefined,
        isDraining:
          typeof body?.isDraining === 'boolean' ? body.isDraining : undefined,
        force: typeof body?.force === 'boolean' ? body.force : false,
      });
      if (!updated) {
        throw new BadRequestException(`Worker '${code}' not found`);
      }
      return updated;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Cannot update worker status',
      );
    }
  }

  @Post('cluster/allocate')
  async clusterAllocate(
    @Headers('x-cluster-token') clusterToken: string,
    @Body() body: any,
  ) {
    this.assertClusterToken(clusterToken);
    const userId = Number(body?.userId);
    const examId = Number(body?.examId);

    if (
      !Number.isFinite(userId) ||
      !Number.isFinite(examId) ||
      userId <= 0 ||
      examId <= 0
    ) {
      throw new BadRequestException('userId and examId are required');
    }

    return this.vdiService.allocateContainer(userId, examId, {
      forceLocal: true,
    });
  }

  @Post('cluster/release')
  async clusterRelease(
    @Headers('x-cluster-token') clusterToken: string,
    @Body() body: any,
  ) {
    this.assertClusterToken(clusterToken);
    const userId = Number(body?.userId);
    const examId = Number(body?.examId);

    if (
      !Number.isFinite(userId) ||
      !Number.isFinite(examId) ||
      userId <= 0 ||
      examId <= 0
    ) {
      throw new BadRequestException('userId and examId are required');
    }

    await this.vdiService.destroyContainer(userId, examId, {
      forceLocal: true,
    });
    return { message: 'Cluster release success' };
  }

  @Post('cluster/prewarm')
  async clusterPrewarm(
    @Headers('x-cluster-token') clusterToken: string,
    @Body() body: any,
  ) {
    this.assertClusterToken(clusterToken);
    const examId = Number(body?.examId);
    const count = Number(body?.count || 0);

    if (!Number.isFinite(examId) || examId <= 0) {
      throw new BadRequestException('examId is required');
    }
    if (!Number.isFinite(count) || count < 0) {
      throw new BadRequestException('count must be >= 0');
    }

    return this.vdiService.prewarmExamPool(examId, count, { forceLocal: true });
  }
}
