import { Resident } from '@prisma/client';

/**
 * Consentimento RGPD gateia os DADOS, não só a UI (linha vermelha 5):
 * sem rgpd_consent → nome só iniciais + quarto ("M. S. · Quarto 101"),
 * photo_url omitido. Aplicado em TODAS as respostas de residente.
 */
export function toResidentResponse(r: Resident) {
  const displayName = r.rgpdConsent ? r.name : `${initials(r.name)} · Quarto ${r.room}`;
  return {
    id: r.id,
    lar_id: r.larId,
    name: displayName,
    date_of_birth: r.dateOfBirth,
    gender: r.gender,
    sns_number: r.snsNumber,
    nif: r.nif,
    room: r.room,
    floor: r.floor,
    blood_type: r.bloodType,
    allergies: r.allergies,
    chronic_conditions: r.chronicConditions,
    status: r.status,
    admitted_at: r.admittedAt,
    archived_at: r.archivedAt,
    archive_reason: r.archiveReason,
    ...(r.rgpdConsent && r.photoUrl ? { photo_url: r.photoUrl } : {}),
    rgpd_consent: r.rgpdConsent,
    rgpd_consent_at: r.rgpdConsentAt,
    emergency_contact: r.emergencyContact,
    assistant_doctor: r.assistantDoctor,
    // DNR explícito SEMPRE (regra clínica 6) — nunca null/ausente
    dnr: r.dnr,
    dnr_document_url: r.dnrDocumentUrl,
    created_at: r.createdAt,
    updated_at: r.updatedAt, // cursor para o delta fetch (updated_since, #9)
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
}
