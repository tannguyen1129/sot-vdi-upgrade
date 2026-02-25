import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { Exam } from '../../entities/exam.entity';
import { Vm } from '../../entities/vm.entity';
import { User } from '../../entities/user.entity';
import { VdiModule } from '../vdi/vdi.module'; 
import { RolesGuard } from '../auth/guards/roles.guard';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Exam, Vm, User]),
    VdiModule,
    MonitoringModule,
  ],
  controllers: [ExamsController],
  providers: [ExamsService, RolesGuard],
})
export class ExamsModule {}
