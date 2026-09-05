import { ManuscriptStatus } from '../types';
import { RevisionRow } from './workflow';

interface EditorAssignmentStatusLike {
  status: 'INVITED' | 'ACCEPTED' | 'DECLINED';
}

/**
 * Phase 3 -- standardized user-facing manuscript status. Exactly 8 values,
 * identical across Author/Coordinator/Editor/Reviewer. Internal workflow
 * states (editor assignment status, reviewer invite/accept status, revision
 * sub-status, coordinator relay steps) are never shown as the primary
 * status -- see supabase/migrations/0036_standard_display_status.sql for
 * where the mapping actually happens.
 */
export const STANDARD_STATUSES = [
  'SUBMITTED', 'EDITORIAL REVIEW', 'IN REVISION', 'PEER REVIEW',
  'ACCEPTED', 'REJECTED', 'PROOFREADING', 'PUBLISHED',
] as const;
export type StandardStatus = typeof STANDARD_STATUSES[number];

/** Shared badge coloring so every workspace renders the same status the
 * same way -- no more per-workspace STATUS_STYLES duplicates. */
export const STANDARD_STATUS_COLORS: Record<StandardStatus | 'DRAFT' | 'PRODUCTION PREPARATION' | 'EDITOR ASSIGNED', string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-200',
  'EDITORIAL REVIEW': 'bg-blue-50 text-blue-700 border-blue-200',
  'IN REVISION': 'bg-orange-50 text-orange-700 border-orange-200',
  'PEER REVIEW': 'bg-purple-50 text-purple-700 border-purple-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  PROOFREADING: 'bg-sky-50 text-sky-700 border-sky-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'PRODUCTION PREPARATION': 'bg-teal-50 text-teal-700 border-teal-200',
  'EDITOR ASSIGNED': 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

interface ManuscriptStatusLike {
  status: ManuscriptStatus;
  display_status?: string | null;
  production_stage?: string | null;
}

/** Once a proof is with the author (Task 11), the standard "PROOFREADING"
 * status (already one of the 8 canonical STANDARD_STATUSES) applies instead
 * of the coarser internal "PRODUCTION PREPARATION" label -- everything
 * before this is Coordinator/GD Member work the author never sees. */
const PROOFREADING_PRODUCTION_STATUSES = new Set([
  'PROOF_SENT_TO_AUTHOR', 'AUTHOR_PROOF_REVIEW', 'CORRECTIONS_SUBMITTED',
  'PRODUCTION_REVIEW', 'PROOF_UPDATED', 'CLARIFICATION_REQUESTED',
  'AUTHOR_APPROVED', 'READY_FOR_PUBLICATION', 'CORRECTIONS_IN_PROGRESS', 'FINAL_PROOF_READY',
]);

/**
 * The manuscript's PRIMARY user-facing status -- always one of
 * STANDARD_STATUSES (or 'DRAFT' for an author's own unsubmitted draft,
 * which sits outside the 8-status pipeline entirely). Reads the
 * `display_status` computed column (see 0036) wherever it was selected;
 * every manuscript fetcher in lib/workflow.ts requests it, so this is
 * normally just a passthrough. The fallback below only matters if some
 * query forgot to select it -- kept coarse but self-consistent rather than
 * throwing, since a stale/missing field shouldn't crash a badge.
 */
export function getManuscriptStatusLabel(manuscript: ManuscriptStatusLike, latestRevision?: RevisionRow | null, productionStatus?: string | null): string {
  if (manuscript.display_status) {
    // The `display_status` computed column doesn't know about the Production
    // module's manuscript_production row (a separate, additive table -- see
    // supabase/migrations/0047_production_module.sql), so it always reports
    // an accepted-but-not-yet-in-production manuscript as ACCEPTED. Once the
    // Coordinator has clicked "Move to Production" (start_production RPC),
    // overlay that here rather than touching the DB function -- callers that
    // don't pass productionStatus (Editor/Reviewer/Author views) are
    // unaffected, so this is purely additive to the Coordinator's own view.
    if (manuscript.display_status === 'ACCEPTED' && productionStatus && productionStatus !== 'NOT_STARTED') {
      return PROOFREADING_PRODUCTION_STATUSES.has(productionStatus) ? 'PROOFREADING' : 'PRODUCTION PREPARATION';
    }
    return manuscript.display_status;
  }

  const status = manuscript.status;
  if (status === 'ACCEPTED') {
    if (productionStatus && productionStatus !== 'NOT_STARTED') {
      return PROOFREADING_PRODUCTION_STATUSES.has(productionStatus) ? 'PROOFREADING' : 'PRODUCTION PREPARATION';
    }
    return manuscript.production_stage === 'SENT_TO_PUBLISHER' ? 'PROOFREADING' : 'ACCEPTED';
  }
  if (status === 'EDITOR_REVIEW' || status === 'AWAITING_DECISION') return 'EDITORIAL REVIEW';
  if (status === 'UNDER_REVIEW') return 'PEER REVIEW';
  if (status === 'REVISION_REQUESTED') {
    return latestRevision?.status === 'AWAITING_AUTHOR_UPLOAD' ? 'IN REVISION' : 'EDITORIAL REVIEW';
  }
  return status.replace(/_/g, ' ');
}

export function getManuscriptStatusMeta(manuscript: ManuscriptStatusLike, latestRevision?: RevisionRow | null, productionStatus?: string | null): { label: string; nextStep: string } {
  const label = getManuscriptStatusLabel(manuscript, latestRevision, productionStatus);
  if (label === 'PRODUCTION PREPARATION') return { label, nextStep: 'Coordinator preparing manuscript for production' };
  if (label === 'ACCEPTED') return { label, nextStep: 'Production' };
  if (label === 'IN REVISION') {
    const nextStep = latestRevision?.status === 'AWAITING_AUTHOR_UPLOAD' ? 'Author to submit revision' : 'Coordinator to forward';
    return { label, nextStep };
  }
  if (label === 'REJECTED') return { label, nextStep: 'Manuscript rejected' };
  if (label === 'PUBLISHED') return { label, nextStep: 'Published' };
  return { label, nextStep: '' };
}

/**
 * Coordinator-only variant of getManuscriptStatusLabel(): the shared
 * "EDITORIAL REVIEW" label is what every role (Author included) sees the
 * moment assign_editor() fires -- correct for the Author, who only cares
 * that their manuscript reached an editor. The Coordinator, though, is the
 * one who has to notice a still-pending assignment and chase it up, so
 * their view distinguishes "assigned, not yet accepted" (EDITOR ASSIGNED)
 * from "the editor is actually working on it" (EDITORIAL REVIEW) using the
 * same editorAssignments the Overview/Decision tabs already fetch. Never
 * touches manuscripts.status or display_status -- purely a Coordinator-side
 * relabeling of the same EDITORIAL REVIEW state, so Author/Editor/Reviewer
 * views are unaffected.
 */
export function getCoordinatorStatusLabel(
  manuscript: ManuscriptStatusLike,
  editorAssignments: EditorAssignmentStatusLike[] | undefined | null,
  latestRevision?: RevisionRow | null,
  productionStatus?: string | null
): string {
  const label = getManuscriptStatusLabel(manuscript, latestRevision, productionStatus);
  if (label !== 'EDITORIAL REVIEW' || !editorAssignments || editorAssignments.length === 0) return label;
  const activeEditor = editorAssignments.find((a) => a.status === 'ACCEPTED') || editorAssignments[0];
  return activeEditor.status === 'ACCEPTED' ? label : 'EDITOR ASSIGNED';
}

export function getCoordinatorStatusMeta(
  manuscript: ManuscriptStatusLike,
  editorAssignments: EditorAssignmentStatusLike[] | undefined | null,
  latestRevision?: RevisionRow | null,
  productionStatus?: string | null
): { label: string; nextStep: string } {
  const label = getCoordinatorStatusLabel(manuscript, editorAssignments, latestRevision, productionStatus);
  if (label === 'EDITOR ASSIGNED') return { label, nextStep: 'Waiting for the editor to accept the assignment' };
  return getManuscriptStatusMeta(manuscript, latestRevision, productionStatus);
}

/** Picks the most recent manuscript_revisions row (by revision_number). */
export function getLatestRevision(revisions: RevisionRow[] | undefined | null): RevisionRow | null {
  if (!revisions || revisions.length === 0) return null;
  return revisions.reduce((latest, r) => (r.revision_number > latest.revision_number ? r : latest), revisions[0]);
}

/**
 * Revision number/type as metadata SEPARATE from the primary status --
 * spec requires these are never folded into the status string itself
 * (no "REVISION 2" or "MAJOR REVISION" as a status value). Render
 * alongside getManuscriptStatusLabel()'s result, e.g.:
 *   Status: IN REVISION
 *   Revision: 2 (Major Revision)
 * Returns null when there's no revision cycle to report.
 */
export function getRevisionMeta(latestRevision?: RevisionRow | null): { revisionNumber: number; revisionType: string | null } | null {
  if (!latestRevision || latestRevision.revision_number <= 0) return null;
  return {
    revisionNumber: latestRevision.revision_number,
    revisionType: latestRevision.decision_type === 'MAJOR_REVISION' ? 'Major Revision'
      : latestRevision.decision_type === 'MINOR_REVISION' ? 'Minor Revision' : null,
  };
}
