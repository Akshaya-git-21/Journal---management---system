import { ReviewerAssignmentRow } from './workflow';

/** Overdue is never stored -- it's purely a computed condition (still
 * INVITED/ACCEPTED, and the due date has passed), consistent everywhere it's
 * shown instead of duplicating the due_date comparison in each component.
 *
 * Compared as plain 'YYYY-MM-DD' strings (both due_date and "today" in the
 * viewer's local timezone) rather than parsing into Date objects and
 * comparing exact timestamps -- due_date is a date-only column, and a
 * midnight-UTC Date comparison against "right now" makes a reviewer whose
 * due date is literally today flip to overdue at an inconsistent time of
 * day depending on timezone. This must match the server's own
 * `due_date < current_date` check (0104_reviewer_overdue_replacement_flow.sql)
 * bit-for-bit -- a reviewer isn't overdue until the day AFTER their
 * deadline, on both sides, or the server rejects a replacement request the
 * UI thought was valid. */
export function isReviewerOverdue(assignment: Pick<ReviewerAssignmentRow, 'status' | 'due_date'>): boolean {
  if (assignment.status !== 'INVITED' && assignment.status !== 'ACCEPTED') return false;
  if (!assignment.due_date) return false;
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return assignment.due_date.slice(0, 10) < todayISO;
}

export type ReviewerDisplayStatus = 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'SUBMITTED' | 'OVERDUE';

/** The status label every workspace should render for a reviewer_assignments
 * row -- overlays "OVERDUE" on top of the raw status the same way
 * getManuscriptStatusLabel() overlays production sub-states on ACCEPTED. */
export function getReviewerDisplayStatus(assignment: Pick<ReviewerAssignmentRow, 'status' | 'due_date'>): ReviewerDisplayStatus {
  if (isReviewerOverdue(assignment)) return 'OVERDUE';
  return assignment.status;
}

/** True once this reviewer needs replacing -- either they declined, or
 * they've gone overdue. Doesn't gate on whether a replacement has actually
 * been requested/selected yet -- callers that need that distinction check
 * replacement_requested_at separately. */
export function reviewerNeedsReplacement(assignment: Pick<ReviewerAssignmentRow, 'status' | 'due_date'>): boolean {
  return assignment.status === 'DECLINED' || isReviewerOverdue(assignment);
}
