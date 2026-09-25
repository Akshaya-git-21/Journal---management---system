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
