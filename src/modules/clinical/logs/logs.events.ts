/**
 * LogEntry domain events. A flagged entry emits log.flagged; the Handover
 * summary (Sprint 3, #14) consumes it to surface entries per shift window.
 * Payload carries IDs + category only — never the entry content (RGPD red line 1).
 */
export const LOG_EVENTS = {
  flagged: 'log.flagged',
} as const;

export interface LogFlaggedEvent {
  larId: string;
  residentId: string;
  logEntryId: string;
  category: string;
  createdAt: Date;
}
