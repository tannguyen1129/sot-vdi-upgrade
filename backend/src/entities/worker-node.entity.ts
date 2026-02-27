import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('worker_nodes')
export class WorkerNode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  apiBaseUrl: string | null;

  @Column({ default: true })
  isEnabled: boolean;

  @Column({ default: false })
  isDraining: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ type: 'float', default: 0 })
  totalCpuCores: number;

  @Column({ type: 'int', default: 0 })
  totalMemoryMb: number;

  @Column({ type: 'float', default: 0 })
  reservedCpuCores: number;

  @Column({ type: 'int', default: 0 })
  reservedMemoryMb: number;

  @Column({ type: 'float', default: 1.5 })
  vmCpuCores: number;

  @Column({ type: 'int', default: 2048 })
  vmMemoryMb: number;

  @Column({ type: 'int', default: 0 })
  activeSessions: number;

  @Column({ type: 'int', default: 0 })
  maxSessions: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
