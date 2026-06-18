import { Resident } from '@prisma/client';

/**
 * Consentimento RGPD gateia os DADOS, não só a UI (linha vermelha 5):
 * sem rgpd_consent → nome só iniciais + quarto ("M. S. · Quarto 101"),
 * photo_url omitido, e os identificadores diretos (SNS, NIF, data de
 * nascimento) + contacto de emergência (PII de terceiro) devolvidos como
 * null. Campos clínicos (alergias, condições, dnr, tipo sanguíneo) NÃO são
 * gateados — são necessários ao dataset de emergência (regra clínica 6).
 * Aplicado em TODAS as respostas de residente.
 */
export function toResidentResponse(r: Resident) {
  const consent = r.rgpdConsent;
  const displayName = consent ? r.name : `${initials(r.name)} · Quarto ${r.room}`;
  return {
    id: r.id,
    lar_id: r.larId,
    name: displayName,
    date_of_birth: consent ? r.dateOfBirth : null,
    gender: r.gender,
    sns_number: consent ? r.snsNumber : null,
    nif: consent ? r.nif : null,
    room: r.room,
    floor: r.floor,
    blood_type: r.bloodType,
    allergies: r.allergies,
    chronic_conditions: r.chronicConditions,
    status: r.status,
    admitted_at: r.admittedAt,
    archived_at: r.archivedAt,
    archive_reason: r.archiveReason,
    ...(consent && r.photoUrl ? { photo_url: r.photoUrl } : {}),
    rgpd_consent: r.rgpdConsent,
    rgpd_consent_at: r.rgpdConsentAt,
    emergency_contact: consent ? r.emergencyContact : null,
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
