import { AdministrationStatus } from '@prisma/client';

export const EMAR_MATERIALIZE_QUEUE = 'emar-materialize';
export const EMAR_TRANSITION_QUEUE = 'emar-transition';

/** Stable id for the singleton repeatable materialisation job. */
export const MATERIALIZE_REPEAT_JOB = 'materialize-all-lares';
export const MATERIALIZE_EVERY_MS = 15 * 60_000;

/** pending → delayed at +30 min; delayed → missed at +24 h (Notion §7). */
export const DELAYED_AFTER_MS = 30 * 60_000;
export const MISSED_AFTER_MS = 24 * 60 * 60_000;

export interface TransitionJobData {
  larId: string;
  administrationId: string;
  to: Extract<AdministrationStatus, 'delayed' | 'missed'>;
}
