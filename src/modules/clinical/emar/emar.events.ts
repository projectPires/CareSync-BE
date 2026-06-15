/**
 * eMAR domain events (folder convention rule 7 — module integration via events,
 * not deep imports). Emitted on automatic lifecycle transitions; the alerts
 * engine consumes them in Sprint 5 (#21). Payloads carry IDs only — never drug
 * names or clinical values (RGPD red line 1).
 */
export const EMAR_EVENTS = {
  delayed: 'administration.delayed',
  missed: 'administration.missed',
} as const;

export interface AdministrationTransitionEvent {
  larId: string;
  administrationId: string;
  residentId: string;
  medicationId: string;
  scheduledAt: Date;
}
