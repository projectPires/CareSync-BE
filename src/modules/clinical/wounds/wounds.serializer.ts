import { WoundEvolution, WoundRecord } from '@prisma/client';

/** Wound identity response (snake_case API convention). */
export function toWoundResponse(w: WoundRecord) {
  return {
    id: w.id,
    lar_id: w.larId,
    resident_id: w.residentId,
    location: w.location,
    kind: w.kind,
    grade: w.grade,
    status: w.status,
    created_by: w.createdBy,
    created_at: w.createdAt,
  };
}

/** Wound evolution response. client_id (device idempotency key) is not exposed. */
export function toWoundEvolutionResponse(e: WoundEvolution) {
  return {
    id: e.id,
    lar_id: e.larId,
    wound_id: e.woundId,
    grade: e.grade,
    size: e.size,
    dressing: e.dressing,
    trend: e.trend,
    photo_key: e.photoKey,
    notes: e.notes,
    recorded_by: e.recordedBy,
    supersedes_id: e.supersedesId,
    reason: e.reason,
    created_at: e.createdAt,
  };
}
