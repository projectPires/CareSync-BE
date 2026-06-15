import { Medication, MedicationAdministration } from '@prisma/client';

/** Plan response (snake_case API convention). */
export function toMedicationResponse(m: Medication) {
  return {
    id: m.id,
    lar_id: m.larId,
    resident_id: m.residentId,
    drug: m.drug,
    dci: m.dci,
    dose: m.dose,
    form: m.form,
    route: m.route,
    schedule: m.schedule,
    condition: m.condition,
    prescribed_by: m.prescribedBy,
    start_date: m.startDate,
    end_date: m.endDate,
    created_at: m.createdAt,
  };
}

/** Administration event response. Hashes/tokens never appear here by construction. */
export function toAdministrationResponse(a: MedicationAdministration) {
  return {
    id: a.id,
    lar_id: a.larId,
    medication_id: a.medicationId,
    resident_id: a.residentId,
    scheduled_at: a.scheduledAt,
    administered_at: a.administeredAt,
    administered_by: a.administeredBy,
    status: a.status,
    reason: a.reason,
    notes: a.notes,
    supersedes_id: a.supersedesId,
    created_at: a.createdAt,
  };
}
