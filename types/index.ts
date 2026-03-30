import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';
export type AcademyPlan = 'free' | 'pro' | 'trial';
export type AcademyStatus = 'pending' | 'active' | 'rejected';
export type AcademyType = '학원' | '교습소' | '개인과외';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  phone_number?: string;
  phone_verified: boolean;
  created_at: Timestamp;
}

export interface Academy {
  id: string;
  name: string;
  plan: AcademyPlan;
  trial_ends_at?: Timestamp;
  status: AcademyStatus;
  academy_type: AcademyType;
  submitted_at: Timestamp;
  approved_at?: Timestamp;
  reject_reason?: string;
  owner_name: string;
  owner_phone: string;
  address: string;
  created_at: Timestamp;
}

export interface Class {
  id: string;
  name: string;
  academy_id: string;
  head_teacher_id: string;
  invite_code: string;
}

export interface Homework {
  id: string;
  title: string;
  content: string;
  class_id: string;
  due_date: Timestamp;
  created_by: string;
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'holiday';

export interface AttendanceRecord {
  status: AttendanceStatus;
  reason?: string;
}