/**
 * Row shape returned by the SECURITY DEFINER functions (raw SQL → snake_case).
 * Only auth code touches this; everything else uses the Prisma client types.
 */
export interface RawUser {
  id: string;
  lar_id: string;
  email: string;
  password_hash: string | null;
  pin_hash: string | null;
  name: string;
  role: 'admin' | 'nurse' | 'aide' | 'doctor';
  licence_number: string | null;
  floors: number[];
  extra_permissions: string[];
  biometric_enabled: boolean;
  status: 'invited' | 'active' | 'disabled';
  last_login_at: Date | null;
  created_at: Date;
}
