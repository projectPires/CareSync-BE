import { redact } from './redact';

describe('redact — linha vermelha RGPD 1 (logs sem PII/dados clínicos)', () => {
  it('redige chaves sensíveis em qualquer nível', () => {
    const result = redact({
      id: 'abc-123',
      name: 'Maria Silva',
      nested: { email: 'maria@x.pt', sns_number: '123456789', safe: 'ok' },
      list: [{ drug: 'Lisinopril', dose: '10 mg', id: 'med-1' }],
    });
    expect(result.id).toBe('abc-123');
    expect(result.name).toBe('[REDACTED]');
    expect(result.nested.email).toBe('[REDACTED]');
    expect(result.nested.sns_number).toBe('[REDACTED]');
    expect(result.nested.safe).toBe('ok');
    expect(result.list[0].drug).toBe('[REDACTED]');
    expect(result.list[0].dose).toBe('[REDACTED]');
    expect(result.list[0].id).toBe('med-1');
  });

  it('redige credenciais e tokens (linha vermelha 8)', () => {
    const result = redact({
      password_hash: '$2a$10$xyz',
      pinHash: '$2a$10$abc',
      refresh_token: 'uuid.secret',
      authorization: 'Bearer eyJ...',
    });
    expect(Object.values(result).every((v) => v === '[REDACTED]')).toBe(true);
  });

  it('é case-insensitive nas chaves (camelCase do Prisma incluído)', () => {
    const result = redact({ snsNumber: '999', emergencyContact: { phone: '910' } });
    expect(result.snsNumber).toBe('[REDACTED]');
    expect(result.emergencyContact).toBe('[REDACTED]');
  });

  it('passa primitivos e nulls intactos', () => {
    expect(redact('id-only-string')).toBe('id-only-string');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
  });
});
