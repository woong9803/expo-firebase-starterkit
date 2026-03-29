export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  phone_number?: string;
  phone_verified: boolean;
  created_at: Date;
}