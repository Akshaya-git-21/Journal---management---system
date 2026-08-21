import { ReviewerRecommendation } from '../types';
import { EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, StatusHistoryRow, ProfileRow } from './workflow';

/** Majority of SUBMITTED reviewer recommendations. 'SPLIT' on a tie,
 * null when no reviewer has submitted yet. */
export function computeMajorityDecision(reviewerAssignments: ReviewerAssignmentRow[]): ReviewerRecommendation | 'SPLIT' | null {
  const submitted = reviewerAssignments.filter(r => r.status === 'SUBMITTED' && r.recommendation);
  if (submitted.length === 0) return null;

  const counts = new Map<ReviewerRecommendation, number>();
  submitted.forEach(r => {
    const rec = r.recommendation as ReviewerRecommendation;
    counts.set(rec, (counts.get(rec) || 0) + 1);
  });

  let winner: ReviewerRecommendation | null = null;
  let winnerCount = 0;
  let tie = false;
  counts.forEach((count, rec) => {
    if (count > winnerCount) {
      winner = rec;
      winnerCount = count;
      tie = false;
    } else if (count === winnerCount) {
      tie = true;
    }
  });

  return tie ? 'SPLIT' : winner;
}

/**
 * Dynamic decision-button labels: "Accept Submission N" / "Minor Revision
 * N+1" / "Major Revision N+1", computed purely from the current revision
 * number -- never hardcoded, so the same logic works for Revision 1, 2, 3,
 * and every subsequent cycle.
 */
export function getRevisionDecisionLabel(recommendation: ReviewerRecommendation, currentRevisionNumber: number): string {
  switch (recommendation) {
    case 'ACCEPT': return `Accept Submission ${currentRevisionNumber}`;
    case 'MINOR_REVISION': return `Minor Revision ${currentRevisionNumber + 1}`;
    case 'MAJOR_REVISION': return `Major Revision ${currentRevisionNumber + 1}`;
    case 'REJECT': return 'Reject';
    default: return recommendation.replace(/_/g, ' ');
  }
}

export type DecisionHistoryEntry = {
  id: string;
  actorRole: 'REVIEWER' | 'EDITOR' | 'COORDINATOR';
  actorName: string;
  decision: string;
  detail?: string;
  createdAt: string;
};

/** Chronological, append-only feed of every decision recorded for this
 * manuscript -- reviewer recommendations, the editor's recommendation, each
 * coordinator revision cycle, and the coordinator's final accept/reject.
 * Built entirely from data already fetched for the manuscript detail view;
 * nothing here is mutated or overwritten by a later revision cycle. */
export function buildDecisionHistory(
  editorAssignments: EditorAssignmentRow[],
  reviewerAssignments: ReviewerAssignmentRow[],
  revisions: RevisionRow[],
  statusHistory: StatusHistoryRow[],
  profiles: Record<string, ProfileRow>
): DecisionHistoryEntry[] {
  const entries: DecisionHistoryEntry[] = [];

  reviewerAssignments
    .filter(r => r.status === 'SUBMITTED' && r.recommendation && r.submitted_at)
    .forEach(r => {
      entries.push({
        id: `reviewer-${r.id}`,
        actorRole: 'REVIEWER',
        actorName: profiles[r.reviewer_id]?.name || 'Reviewer',
        decision: (r.recommendation as string).replace(/_/g, ' '),
        createdAt: r.submitted_at as string,
      });
    });

  editorAssignments
    .filter(a => a.assessment_status === 'SUBMITTED' && a.recommendation && a.recommendation_submitted_at)
    .forEach(a => {
      entries.push({
        id: `editor-${a.id}`,
        actorRole: 'EDITOR',
        actorName: profiles[a.editor_id]?.name || 'Editor',
        decision: (a.recommendation as string).replace(/_/g, ' '),
        createdAt: a.recommendation_submitted_at as string,
      });
    });

  revisions.forEach(rev => {
    entries.push({
      id: `revision-${rev.id}`,
      actorRole: 'COORDINATOR',
      actorName: profiles[rev.requested_by || '']?.name || 'Coordinator',
      decision: `${rev.decision_type === 'MAJOR_REVISION' ? 'MAJOR' : 'MINOR'} REVISION — Revision ${rev.revision_number}`,
      detail: rev.decision_letter || undefined,
      createdAt: rev.requested_at,
    });

    if (rev.editor_decision && rev.editor_decision_at) {
      entries.push({
        id: `revision-${rev.id}-editor-decision`,
        actorRole: 'EDITOR',
        actorName: 'Editor',
        decision: `Revision ${rev.revision_number} — ${getRevisionDecisionLabel(rev.editor_decision, rev.revision_number)}`,
        detail: rev.editor_comments || undefined,
        createdAt: rev.editor_decision_at,
      });
    }

    if (rev.coordinator_decision && rev.coordinator_decision_at) {
      entries.push({
        id: `revision-${rev.id}-coordinator-decision`,
        actorRole: 'COORDINATOR',
        actorName: 'Coordinator',
        decision: `Revision ${rev.revision_number} — Final: ${getRevisionDecisionLabel(rev.coordinator_decision, rev.revision_number)}`,
        detail: rev.coordinator_note || undefined,
        createdAt: rev.coordinator_decision_at,
      });
    }
  });

  statusHistory
    .filter(h => h.to_status === 'ACCEPTED' || h.to_status === 'REJECTED')
    .forEach(h => {
      entries.push({
        id: `status-${h.id}`,
        actorRole: 'COORDINATOR',
        actorName: (h.actor_id && profiles[h.actor_id]?.name) || 'Coordinator',
        decision: h.to_status === 'ACCEPTED' ? 'ACCEPT — Production' : 'REJECT',
        detail: h.note || undefined,
        createdAt: h.created_at,
      });
    });

  return entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
