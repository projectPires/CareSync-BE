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

  // eMAR (#6)
  'emar.plan': ['admin', 'doctor'],
  'emar.administer': ['admin', 'nurse', 'doctor'], // 🔒 delegável a aide qualificado
  'emar.refuse': ['admin', 'nurse', 'aide', 'doctor'],
  'emar.read': ['admin', 'nurse', 'aide', 'doctor'], // aide: só hoje (cap em emar.read_history)
  'emar.read_history': ['admin', 'nurse', 'doctor'], // histórico além de hoje

  // Sinais vitais (#8)
  'vitals.record_basic': ['admin', 'nurse', 'aide', 'doctor'], // TA / FC / Temp
  'vitals.record_advanced': ['admin', 'nurse', 'doctor'], // 🔒 SpO₂/Glicemia/Dor — delegável a aide
  'vitals.read': ['admin', 'nurse', 'aide', 'doctor'], // aide: 24h (cap em vitals.read_history)
  'vitals.read_history': ['admin', 'nurse', 'doctor'], // histórico além de 24h

  // LogEntry — registos genéricos (#10). Matriz §8 "Higiene/Nutrição" + "Animação":
  // médico é READ-ONLY em cuidados (nutrition/hygiene/social); escreve em medical.
  'log.read': ['admin', 'nurse', 'aide', 'doctor'], // scoped aos pisos
  // Gate base do POST (qualquer role clínico escreve ALGUMA categoria); a
  // autoridade fina por categoria é refinada no serviço (padrão dos vitals).
  'log.write': ['admin', 'nurse', 'aide', 'doctor'],
  'log.write_medical': ['admin', 'nurse', 'doctor'], // diário clínico — aide ⛔ (dados clínicos)
  'log.write_care': ['admin', 'nurse', 'aide'], // nutrition/hygiene/social — médico 🔍

  // Pele & Feridas (#11). Matriz §8 "Pele & Feridas":
  'wound.read': ['admin', 'nurse', 'aide', 'doctor'], // scoped aos pisos
  'wound.record': ['admin', 'nurse', 'doctor'], // 🔒 delegável a aide qualificado (grau 1–2)
  'wound.stage_severe': ['admin', 'nurse', 'doctor'], // grau ≥3 / estadiamento — NÃO delegável (aide ⛔)
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Permissões 🔒 que o Admin pode delegar individualmente (whitelist do #18). */
export const DELEGATABLE: readonly Permission[] = [
  'resident.photo',
  'emar.administer',
  'wound.record', // aide qualificado pode registar feridas (grau 1–2; grau ≥3 exige wound.stage_severe)
  'vitals.record_advanced',
] as const;

export function can(user: Pick<JwtPayload, 'role' | 'perms'>, permission: Permission): boolean {
  const roles = PERMISSIONS[permission] as readonly Role[] | undefined;
  if (!roles) return false; // deny by default — permissão desconhecida nunca passa
  return roles.includes(user.role) || user.perms.includes(permission);
}
