/**
 * Vitals domain events. An abnormal reading emits vital.abnormal; the alerts
 * engine consumes it in Sprint 5 (#21). Payload carries IDs + metric only —
 * never the clinical value (RGPD red line 1).
 */
export const VITALS_EVENTS = {
  abnormal: 'vital.abnormal',
} as const;

export interface VitalAbnormalEvent {
  larId: string;
  residentId: string;
  vitalReadingId: string;
  metric: string;
  recordedAt: Date;
}
