import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Exam } from './exam.entity';
import { ExamLog } from './exam-log.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  PROCTOR = 'PROCTOR',
  STUDENT = 'STUDENT',
}

@Entity('users')
export class User {
  [x: string]: any;
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string; // MSSV hoặc Username

  @Column({ nullable: true })
  examId: number;

  @ManyToOne(() => Exam, (exam) => exam.students, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column()
  password: string; // Thực tế nên hash, demo để plain text

  @Column()
  fullName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.STUDENT,
  })
  role: UserRole;

  @Column({ nullable: true })
  className: string; // Lớp (cho sinh viên)

  @Column({ nullable: true })
  department: string;

  @CreateDateColumn()
  createdAt: Date;

  // [FIX LỖI QUAN TRỌNG] Phải có cái này thì bên ExamLog mới gọi user.logs được
  @OneToMany(() => ExamLog, (log) => log.user)
  logs: ExamLog[];
}