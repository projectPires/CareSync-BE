import { VitalReading } from '@prisma/client';

/** Vital reading response (snake_case API convention). */
export function toVitalResponse(v: VitalReading) {
  return {
    id: v.id,
    lar_id: v.larId,
    resident_id: v.residentId,
    metric: v.metric,
    value: v.value,
    abnormal: v.abnormal,
    recorded_at: v.recordedAt,
    recorded_by: v.recordedBy,
    notes: v.notes,
    supersedes_id: v.supersedesId,
    reason: v.reason,
    created_at: v.createdAt,
  };
}
