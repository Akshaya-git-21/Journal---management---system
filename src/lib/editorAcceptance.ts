/**
 * Editor acceptance window (Phase 1 -- display only, nothing is stored or
 * changed). Counted from the actual assignment timestamp: after 48h the
 * Coordinator may send a reminder, after 96h the editor is overdue. Applies
 * ONLY to assignments made on/after EDITOR_ACCEPTANCE_RULES_START -- older
 * assignments keep their existing behaviour and labels.
 */
export const EDITOR_ACCEPTANCE_RULES_START = '2026-09-25T07:50:00Z';
export const EDITOR_REMINDER_AFTER_MS = 48 * 60 * 60 * 1000;
export const EDITOR_OVERDUE_AFTER_MS = 96 * 60 * 60 * 1000;

export type EditorAcceptanceState = 'NOT_APPLICABLE' | 'AWAITING' | 'REMINDER_AVAILABLE' | 'OVERDUE';

export function getEditorAcceptanceState(
  a: { status: string; assigned_at?: string | null } | null | undefined,
  now: number = Date.now()
): EditorAcceptanceState {
  if (!a || a.status !== 'INVITED' || !a.assigned_at) return 'NOT_APPLICABLE';
  const assignedAt = new Date(a.assigned_at).getTime();
  if (isNaN(assignedAt) || assignedAt < new Date(EDITOR_ACCEPTANCE_RULES_START).getTime()) return 'NOT_APPLICABLE';
  const elapsed = now - assignedAt;
  if (elapsed >= EDITOR_OVERDUE_AFTER_MS) return 'OVERDUE';
  if (elapsed >= EDITOR_REMINDER_AFTER_MS) return 'REMINDER_AVAILABLE';
  return 'AWAITING';
}

export const EDITOR_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type ReminderAvailability =
  | { allowed: true }
  | { allowed: false; reason: 'TOO_EARLY' | 'WINDOW_CLOSED' | 'COOLDOWN'; nextAt?: Date };

/**
 * Whether the Coordinator may send the acceptance-window reminder right now:
 * only between 48h and 96h after assignment, and at most one per 24h. Applies
 * to new, still-INVITED assignments only (anything else is unrestricted here,
 * as before). The database enforces the same rule -- see
 * 0127_editor_reminder_cooldown.sql.
 */
export function getReminderAvailability(
  a: { status: string; assigned_at?: string | null; last_reminder_sent_at?: string | null } | null | undefined,
  now: number = Date.now()
): ReminderAvailability {
  const state = getEditorAcceptanceState(a, now);
  if (state === 'NOT_APPLICABLE' || !a) return { allowed: true };
  if (state === 'AWAITING') return { allowed: false, reason: 'TOO_EARLY' };
  if (state === 'OVERDUE') return { allowed: false, reason: 'WINDOW_CLOSED' };
  if (a.last_reminder_sent_at) {
    const next = new Date(a.last_reminder_sent_at).getTime() + EDITOR_REMINDER_COOLDOWN_MS;
    if (now < next) return { allowed: false, reason: 'COOLDOWN', nextAt: new Date(next) };
  }
  return { allowed: true };
}
