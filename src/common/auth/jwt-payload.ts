/** Access-token claims. lar_id feeds the RLS tenant context downstream. */
export interface JwtPayload {
  sub: string;
  lar_id: string;
  role: 'admin' | 'nurse' | 'aide' | 'doctor';
  perms: string[];
}
