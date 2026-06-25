import { LogEntry } from '@prisma/client';

/** LogEntry response (snake_case API convention). client_id is device-internal — not exposed. */
export function toLogResponse(l: LogEntry) {
  return {
    id: l.id,
    lar_id: l.larId,
    resident_id: l.residentId,
    category: l.category,
    kind: l.kind,
    title: l.title,
    value: l.value,
    notes: l.notes,
    author_id: l.authorId,
    flagged: l.flagged,
    supersedes_id: l.supersedesId,
    reason: l.reason,
    created_at: l.createdAt,
  };
}
