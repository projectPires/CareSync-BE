/**
 * Redação de PII/dados clínicos para LOGS de aplicação (linha vermelha RGPD 1:
 * logs só com IDs). NÃO se aplica ao audit_log — esse é a vista autorizada e
 * guarda before/after completos, encriptados at rest.
 *
 * Uso: logger.log(redact(obj)) sempre que um objeto possa conter dados de
 * residentes/utilizadores. Strings interpoladas devem conter apenas IDs.
 */
const SENSITIVE_KEYS = [
  'name',
  'legal_name',
  'legalname',
  'email',
  'phone',
  'address',
  'nif',
  'sns',
  'sns_number',
  'snsnumber',
  'date_of_birth',
  'dateofbirth',
  'password',
  'password_hash',
  'passwordhash',
  'pin',
  'pin_hash',
  'pinhash',
  'token',
  'token_hash',
  'access_token',
  'refresh_token',
  'authorization',
  'allergies',
  'chronic_conditions',
  'chronicconditions',
  'drug',
  'dci',
  'dose',
  'notes',
  'reason',
  'emergency_contact',
  'emergencycontact',
  'assistant_doctor',
  'assistantdoctor',
  'photo_url',
  'photourl',
  'dnr_document_url',
] as const;

const REDACTED = '[REDACTED]';

export function redact<T>(value: T, depth = 6): T {
  if (depth <= 0 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth - 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.includes(key.toLowerCase() as (typeof SENSITIVE_KEYS)[number])
      ? REDACTED
      : redact(val, depth - 1);
  }
  return out as T;
}
