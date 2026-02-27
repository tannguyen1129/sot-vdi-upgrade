import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VdiService } from './vdi.service';
import { VdiController } from './vdi.controller';
import { Vm } from '../../entities/vm.entity';
import { ExamLog } from 'src/entities/exam-log.entity';
import { WorkerNode } from '../../entities/worker-node.entity';
import { WorkerRegistryService } from './worker-registry.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vm, ExamLog, WorkerNode])],
  controllers: [VdiController],
  providers: [VdiService, WorkerRegistryService],
  exports: [VdiService, WorkerRegistryService],
})
export class VdiModule {}
