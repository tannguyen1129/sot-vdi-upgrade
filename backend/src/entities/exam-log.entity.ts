import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Exam } from './exam.entity';

export enum ExamLogSeverity {
  INFO = 'INFO',
  WARN = 'WARN',
  CRITICAL = 'CRITICAL',
}

export enum ExamLogSource {
  WEB_CLIENT = 'WEB_CLIENT',
  BEACON = 'BEACON',
  SYSTEM = 'SYSTEM',
  ADMIN = 'ADMIN',
}

@Entity()
export class ExamLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  action: string;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({ nullable: true })
  clientIp: string | null;

  @Column({
    type: 'enum',
    enum: ExamLogSeverity,
    default: ExamLogSeverity.INFO,
  })
  severity: ExamLogSeverity;

  @Column({
    type: 'enum',
    enum: ExamLogSource,
    default: ExamLogSource.WEB_CLIENT,
  })
  source: ExamLogSource;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ type: 'int', default: 0 })
  violationScore: number;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  // --- QUAN HỆ USER ---
  @Column()
  userId: number;

  @ManyToOne(() => User, (user) => user.logs, { onDelete: 'CASCADE' }) // Thêm cascade để xóa user thì mất log luôn cho sạch
  @JoinColumn({ name: 'userId' })
  user: User;

  // --- QUAN HỆ EXAM ---
  @Column({ nullable: true }) // Cho phép null để tránh lỗi hệ thống
  examId: number;

  @ManyToOne(() => Exam, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'examId' })
  exam: Exam;
}
