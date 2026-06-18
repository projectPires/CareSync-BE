import { Resident } from '@prisma/client';
import { toResidentResponse } from './resident.serializer';

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: 'r1',
    larId: 'lar1',
    name: 'Maria Silva',
    dateOfBirth: new Date('1940-01-01'),
    gender: 'F',
    snsNumber: '123456789',
    nif: '987654321',
    room: '101',
    floor: 1,
    bloodType: 'A+',
    allergies: ['penicillin'],
    chronicConditions: ['diabetes'],
    status: 'active',
    admittedAt: new Date('2024-01-01'),
    archivedAt: null,
    archiveReason: null,
    photoUrl: 'lar/lar1/r1.jpg',
    rgpdConsent: true,
    rgpdConsentAt: new Date('2024-01-01'),
    emergencyContact: { name: 'João Silva', phone: '912345678' },
    assistantDoctor: 'Dr. Costa',
    dnr: false,
    dnrDocumentUrl: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  } as unknown as Resident;
}

describe('toResidentResponse — RGPD consent gating (red line 5)', () => {
  it('nulls special-category PII when rgpd_consent is false', () => {
    const out = toResidentResponse(makeResident({ rgpdConsent: false }));
    expect(out.sns_number).toBeNull();
    expect(out.nif).toBeNull();
    expect(out.date_of_birth).toBeNull();
    expect(out.emergency_contact).toBeNull();
    // existing guarantees still hold
    expect(out.name).toBe('M. S. · Quarto 101');
    expect(out).not.toHaveProperty('photo_url');
  });

  it('returns full PII when rgpd_consent is true', () => {
    const out = toResidentResponse(makeResident({ rgpdConsent: true }));
    expect(out.sns_number).toBe('123456789');
    expect(out.nif).toBe('987654321');
    expect(out.date_of_birth).toEqual(new Date('1940-01-01'));
    expect(out.emergency_contact).toEqual({ name: 'João Silva', phone: '912345678' });
    expect(out.name).toBe('Maria Silva');
    expect(out.photo_url).toBe('lar/lar1/r1.jpg');
  });

  it('always returns explicit dnr (clinical rule 6) regardless of consent', () => {
    expect(toResidentResponse(makeResident({ rgpdConsent: false })).dnr).toBe(false);
    expect(toResidentResponse(makeResident({ rgpdConsent: true })).dnr).toBe(false);
  });
});
