import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Exam } from './exam.entity';

@Entity()
export class ExamLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  action: string;

  @Column({ type: 'text', nullable: true })
  details: string;

  @Column({ nullable: true })
  clientIp: string;

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