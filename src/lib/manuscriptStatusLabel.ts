import { ManuscriptStatus } from '../types';
import { RevisionRow } from './workflow';

/**
 * Single source of truth for how a manuscript's status is *displayed*.
 * The underlying `manuscripts.status` column intentionally keeps its
 * existing values (ACCEPTED, REVISION_REQUESTED, REJECTED, ...) -- see
 * manuscript_status_check in supabase/migrations/0002_manuscripts_workflow.sql
 * and the RPCs that hardcode them (publish_decision, mark_published,
 * send_to_publisher, the Publisher RLS policy). Changing those values would
 * require a migration and touch several working guards for no functional
 * gain; instead every workspace renders through this function so "PRODUCTION"
 * and "REVISION 1 -- MINOR REVISION" appear consistently everywhere without
 * the raw status value ever changing.
 */
export function getManuscriptStatusLabel(status: ManuscriptStatus, latestRevision?: RevisionRow | null): string {
  if (status === 'ACCEPTED') return 'PRODUCTION';
  if (status === 'REVISION_REQUESTED' && latestRevision) {
    const kind = latestRevision.decision_type === 'MAJOR_REVISION' ? 'MAJOR' : 'MINOR';
    return `REVISION ${latestRevision.revision_number} — ${kind} REVISION`;
  }
  return status.replace(/_/g, ' ');
}

export function getManuscriptStatusMeta(status: ManuscriptStatus, latestRevision?: RevisionRow | null): { label: string; nextStep: string } {
  const label = getManuscriptStatusLabel(status, latestRevision);
  if (status === 'ACCEPTED') return { label, nextStep: 'Move to Publish' };
  if (status === 'REVISION_REQUESTED') {
    const nextStep = latestRevision?.status === 'REVISION_SUBMITTED'
      ? 'Coordinator to send to editor'
      : 'Author to submit revision';
    return { label, nextStep };
  }
  if (status === 'REJECTED') return { label, nextStep: 'Manuscript rejected' };
  if (status === 'PUBLISHED') return { label, nextStep: 'Published' };
  return { label, nextStep: '' };
}

/** Picks the most recent manuscript_revisions row (by revision_number) for
 * use as `latestRevision` above. */
export function getLatestRevision(revisions: RevisionRow[] | undefined | null): RevisionRow | null {
  if (!revisions || revisions.length === 0) return null;
  return revisions.reduce((latest, r) => (r.revision_number > latest.revision_number ? r : latest), revisions[0]);
}

/**
 * Finer-grained current-stage label than getManuscriptStatusLabel(): during
 * a revision cycle, `manuscripts.status` reuses the same EDITOR_REVIEW /
 * UNDER_REVIEW values as the original review round, so on its own it can't
 * distinguish "editor re-reviewing revision 1" from "editor reviewing the
 * original submission." This combines status with the latest revision row
 * to produce the stage text shown on live status badges (e.g. "REVISION 1
 * — EDITOR REVIEW · IN PROGRESS").
 *
 * manuscript_revisions.status carries the fine-grained sub-stage while
 * manuscripts.status stays REVISION_REQUESTED for both "with author" and
 * "with coordinator" (see 0018_coordinator_revision_gate.sql):
 *   AWAITING_AUTHOR_UPLOAD -> author hasn't uploaded yet
 *   REVISION_SUBMITTED     -> uploaded, awaiting Coordinator review
 *   UNDER_REVIEW           -> Coordinator forwarded it, Editor is reviewing
 *   COMPLETED              -> Editor decided (this row is closed)
 */
export function getWorkflowStageLabel(status: ManuscriptStatus, latestRevision?: RevisionRow | null): string {
  if (!latestRevision) return getManuscriptStatusLabel(status);

  const n = latestRevision.revision_number;
  if (latestRevision.status === 'AWAITING_AUTHOR_UPLOAD') return `REVISION ${n} REQUESTED`;
  if (latestRevision.status === 'REVISION_SUBMITTED') return `REVISION ${n} — AWAITING COORDINATOR REVIEW`;

  switch (status) {
    case 'EDITOR_REVIEW':
      return `REVISION ${n} — EDITOR REVIEW · IN PROGRESS`;
    case 'UNDER_REVIEW':
      return `REVISION ${n} — REVIEWER REVIEW · IN PROGRESS`;
    case 'AWAITING_DECISION':
      return `REVISION ${n} — AWAITING DECISION`;
    default:
      return getManuscriptStatusLabel(status, latestRevision);
  }
}
