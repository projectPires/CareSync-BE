/**
 * Wounds domain events. A grade increase emits wound.deteriorated; the alerts
 * engine (Sprint 5, #21) consumes it as a "Pele em risco" alert source. Payload
 * carries IDs + grades only — never photos or notes (RGPD red line 1).
 */
export const WOUND_EVENTS = {
  deteriorated: 'wound.deteriorated',
} as const;

export interface WoundDeterioratedEvent {
  larId: string;
  residentId: string;
  woundId: string;
  fromGrade: number | null;
  toGrade: number;
  createdAt: Date;
}
