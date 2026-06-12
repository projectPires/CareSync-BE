import { JwtPayload } from './jwt-payload';

export type Role = 'admin' | 'nurse' | 'aide' | 'doctor';

/**
 * Catálogo de permissões — derivado da Matriz de Permissões (Notion §8).
 * Fonte única de autorização: deny by default; cada chave lista os roles com
 * acesso BASE. Permissões delegadas (🔒 na matriz) podem ser concedidas
 * individualmente pelo Admin via user.extra_permissions (issue #18) — o guard
 * verifica role OU extra_permissions.
 *
 * Alterar este ficheiro = alterar a matriz ⇒ requer atualização do Notion §8
 * (aprovação produto + RGPD, diz a própria página).
 */
export const PERMISSIONS = {
  // Lar (dados administrativos da instituição)
  'lar.read': ['admin'],
  'lar.update': ['admin'],

  // Workers
  'user.read': ['admin', 'nurse', 'aide', 'doctor'], // não-admin: projeção mínima
  'user.invite': ['admin'],
  'user.update': ['admin'],
  'user.deactivate': ['admin'],
  'user.permissions': ['admin'],

  // Residentes
  'resident.create': ['admin'],
  'resident.read': ['admin', 'nurse', 'aide', 'doctor'], // não-admin: scoped aos pisos
  'resident.read_all_floors': ['admin', 'doctor'],
  'resident.update_admin': ['admin'], // SNS, NIF, contactos, quarto
  'resident.update_clinical': ['admin', 'nurse', 'doctor'], // alergias, condições
  'resident.update_dnr': ['admin', 'doctor'],
  'resident.archive': ['admin'],
  'resident.photo': ['admin'], // 🔒 delegável a nurse/aide

  // eMAR (usadas a partir do #6)
  'emar.plan': ['admin', 'doctor'],
  'emar.administer': ['admin', 'nurse', 'doctor'], // 🔒 delegável a aide qualificado
  'emar.refuse': ['admin', 'nurse', 'aide', 'doctor'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Permissões 🔒 que o Admin pode delegar individualmente (whitelist do #18). */
export const DELEGATABLE: readonly Permission[] = ['resident.photo', 'emar.administer'] as const;

export function can(user: Pick<JwtPayload, 'role' | 'perms'>, permission: Permission): boolean {
  const roles = PERMISSIONS[permission] as readonly Role[] | undefined;
  if (!roles) return false; // deny by default — permissão desconhecida nunca passa
  return roles.includes(user.role) || user.perms.includes(permission);
}
