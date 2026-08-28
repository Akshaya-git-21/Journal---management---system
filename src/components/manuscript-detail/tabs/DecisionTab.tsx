import { useState, useEffect } from 'react';
import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, StatusHistoryRow, ProfileRow, ScreeningResponse } from '../../../lib/workflow';
import { publishDecision, sendToPublisher, listActiveProfilesByRole, coordinatorSendRevisionToReviewers } from '../../../lib/workflow';
import { createAndActivatePublisherAccount } from '../../../lib/auth';
import { AlertCircle, Users, UserCheck, Gavel, FileCheck, ChevronDown, ChevronRight, Send, X, Copy, Loader2, Building2, UserPlus, ChevronLeft, CheckCircle2, CheckCircle, XCircle, ClipboardList } from 'lucide-react';
import { getRevisionDecisionLabel } from '../../../lib/decisionUtils';
import { getManuscriptStatusMeta, getManuscriptStatusLabel, getLatestRevision } from '../../../lib/manuscriptStatusLabel';

interface Props {
  manuscript: ManuscriptRow;
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  revisions: RevisionRow[];
  statusHistory: StatusHistoryRow[];
  profiles: Record<string, ProfileRow>;
  isEditor?: boolean;
  onWorkflowChange: () => void;
}

const SCREENING_QUESTION_LABELS: Record<string, string> = {
  scope_fit: 'Journal Scope Fit',
  novelty_significance: 'Novelty and Significance',
  scientific_soundness: 'Scientific Soundness',
  completeness: 'Manuscript Completeness',
  guidelines_compliance: 'Author Guidelines Compliance',
  ethical_compliance: 'Ethical Compliance',
  disclosures: 'Disclosures and Declarations',
  research_integrity: 'Research Integrity',
  language_clarity: 'Language and Clarity',
  reviewer_suitability: 'Reviewer Suitability',
};

const DECISION_LABELS: Record<string, string> = {
  ACCEPT: 'Accept',
  MINOR_REVISION: 'Minor Revision',
  MAJOR_REVISION: 'Major Revision',
  REJECT: 'Reject',
  SPLIT: 'Split decision',
};

// Screening-stage Editor decision: only Reject Submission / Return to
// Author / Move to Next Stage exist (see EditorEvaluationFormTab.tsx's
// ACTION_META) -- MAJOR_REVISION is how "Return to Author" is stored, not
// a real "Major Revision" decision type at this stage.
const SCREENING_DECISION_LABELS: Record<string, string> = {
  ACCEPT: 'Move to Next Stage',
  MAJOR_REVISION: 'Return to Author',
  MINOR_REVISION: 'Return to Author',
  REJECT: 'Reject Submission',
};

function DecisionPill({ decision, size = 'sm', screeningStage = false }: { decision: string | null; size?: 'sm' | 'lg'; screeningStage?: boolean }) {
  if (!decision) return <span className="text-xs text-slate-400 italic">Pending</span>;
  const style =
    decision === 'ACCEPT' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
    decision === 'REJECT' ? 'bg-red-100 text-red-800 border-red-300' :
    decision === 'SPLIT' ? 'bg-slate-100 text-slate-600 border-slate-200' :
    decision === 'MAJOR_REVISION' ? 'bg-orange-100 text-orange-800 border-orange-300' :
    'bg-amber-100 text-amber-800 border-amber-300';
  const labels = screeningStage ? SCREENING_DECISION_LABELS : DECISION_LABELS;
  return (
    <span className={`font-bold rounded-full border ${style} ${size === 'lg' ? 'text-sm px-4 py-1.5' : 'text-xs px-2.5 py-1'}`}>
      {labels[decision] || decision.replace(/_/g, ' ')}
    </span>
  );
}

export function DecisionTab({
  manuscript,
  editorAssignments,
  reviewerAssignments,
  revisions,
  profiles,
  isEditor,
  onWorkflowChange
}: Props) {
  const [decision, setDecision] = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null>(null);
  const [letter, setLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRevisions, setExpandedRevisions] = useState<Record<string, boolean>>({});
  const [firstSubmissionExpanded, setFirstSubmissionExpanded] = useState(false);
  const [reviewerDecisionsExpanded, setReviewerDecisionsExpanded] = useState(true);
  const [finalDecisionExpanded, setFinalDecisionExpanded] = useState(true);
  const [showSendToPublisherModal, setShowSendToPublisherModal] = useState(false);
  const toggleRevisionExpanded = (id: string) => setExpandedRevisions(prev => ({ ...prev, [id]: !prev[id] }));

  const hasEditorEvaluation = editorAssignments.some(a => a.assessment_status === 'SUBMITTED');
  // Declined rows don't block completion -- only the non-declined ones need
  // to have actually submitted (a stale DECLINED row would otherwise
  // permanently block this from ever being "ready", since it never becomes
  // SUBMITTED).
  const activeReviewerAssignments = reviewerAssignments.filter(r => r.status !== 'DECLINED');
  const hasRequiredReviews = activeReviewerAssignments.length > 0 && activeReviewerAssignments.every(r => r.status === 'SUBMITTED');

  const activeEditor = editorAssignments.find(a => a.status === 'ACCEPTED') || editorAssignments[0];
  const latestRevision = getLatestRevision(revisions);
  const sortedRevisions = [...revisions].sort((a, b) => a.revision_number - b.revision_number);
  const firstSubmissionRevision = sortedRevisions[0] || null;
  // The most recent revision cycle that an editor has actually decided on.
  // Once the coordinator finalizes a MINOR/MAJOR decision, a fresh blank
  // revision row is created for the next cycle -- latestRevision then points
  // at that new (undecided) row, so the editor/coordinator decision data for
  // the cycle that was just closed out has to be read from here instead.
  const decidedRevision = [...revisions].reverse().find(r => r.editor_decision) || null;
  // True while the Coordinator still needs to confirm the editor's decision
  // on the CURRENT revision cycle (submit_editor_recommendation parks the
  // manuscript at AWAITING_DECISION without opening the next cycle -- see
  // 0020_coordinator_gated_revision_decision.sql). Revision cycles reset
  // editor_assignments.assessment_status to NOT_STARTED and never resubmit
  // it (no scoring step on EditorRevisionReview.tsx), so hasEditorEvaluation
  // doesn't apply here -- decidedRevision.editor_decision is the evidence
  // the editor has in fact decided.
  const pendingRevisionConfirm = !!(
    manuscript.status === 'AWAITING_DECISION' &&
    decidedRevision && latestRevision &&
    decidedRevision.id === latestRevision.id &&
    !decidedRevision.coordinator_decision
  );
  // Peer-review round: reviews already pushed the manuscript to
  // AWAITING_DECISION and at least one reviewer was ever assigned -- the
  // screening round's own AWAITING_DECISION (reject/revision) always has
  // zero reviewerAssignments, since reviewers aren't selected until
  // screening ACCEPTs. Distinct from the revision-loop round, which always
  // has sortedRevisions.length > 0.
  const isPeerReviewRound = sortedRevisions.length === 0 && reviewerAssignments.length > 0;
  const latestReviewSubmittedAt = activeReviewerAssignments.reduce<string | null>((latest, r) => (
    r.submitted_at && (!latest || r.submitted_at > latest) ? r.submitted_at : latest
  ), null);
  // Same "only counts if it postdates what it's deciding on" rule as
  // EditorWorkspace.tsx's own Decision tab -- the Coordinator must not be
  // able to act on a stale screening-round recommendation as if it were the
  // Editor's actual peer-review call.
  const editorDecisionIsFreshForPeerReview = !!(
    activeEditor?.recommendation && activeEditor.recommendation_submitted_at &&
    latestReviewSubmittedAt && activeEditor.recommendation_submitted_at > latestReviewSubmittedAt
  );
  const pendingPeerReviewConfirm = isPeerReviewRound && manuscript.status === 'AWAITING_DECISION' && editorDecisionIsFreshForPeerReview;
  // The VERY FIRST screening-stage decision (Reject Submission / Return to
  // Author / Move to Next Stage) -- no revision has ever been created yet
  // (sortedRevisions.length === 0, so pendingRevisionConfirm can't apply)
  // and no reviewer has ever been assigned (reviewerAssignments.length ===
  // 0, so pendingPeerReviewConfirm/isPeerReviewRound can't apply either).
  // Without this, the Coordinator fell through to the free 4-button picker
  // below even though the Editor already decided -- same confirm-only
  // pattern as the other two rounds, just never extended to this one.
  const pendingScreeningConfirm = !!(
    sortedRevisions.length === 0 && reviewerAssignments.length === 0 &&
    manuscript.status === 'AWAITING_DECISION' && activeEditor?.recommendation
  );
  // The backend (publish_decision RPC) only accepts a decision once the
  // manuscript has actually reached AWAITING_DECISION -- checking just
  // hasEditorEvaluation/hasRequiredReviews let the form render as "ready"
  // before reviewers were even assigned (reviewerAssignments.length === 0
  // trivially satisfies hasRequiredReviews), so Submit always failed with
  // "Manuscript is not awaiting a decision".
  const canDecide = manuscript.status === 'AWAITING_DECISION' &&
    (pendingRevisionConfirm || (hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews)));

  // Pre-fill the note-to-author with the Editor's own Return to
  // Author / Rejection reason so it reaches the Author by default -- the
  // Coordinator can still edit it, but the Editor's actual words are what
  // gets sent unless the Coordinator deliberately changes them.
  useEffect(() => {
    if (pendingScreeningConfirm && !letter && activeEditor?.action_reason) {
      setLetter(activeEditor.action_reason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScreeningConfirm, activeEditor?.action_reason]);
  const decided = ['ACCEPTED', 'REVISION_REQUESTED', 'REJECTED', 'PUBLISHED'].includes(manuscript.status);
  const statusMeta = getManuscriptStatusMeta(manuscript, latestRevision);
  const finalDecisionLabel =
    manuscript.status === 'ACCEPTED' ? 'ACCEPT' :
    manuscript.status === 'REJECTED' ? 'REJECT' :
    manuscript.status === 'REVISION_REQUESTED' ? (latestRevision?.decision_type || null) :
    null;
  // When the coordinator's final decision on this revision is already
  // recorded (publish_decision stamps coordinator_decision onto the
  // revision it just closed out -- see 0019_revision_comments_checklist.sql),
  // prefer its exact dynamic label ("Minor Revision 2") over the generic one.
  const finalRevisionDecisionLabel = decidedRevision?.coordinator_decision
    ? getRevisionDecisionLabel(decidedRevision.coordinator_decision, decidedRevision.revision_number)
    : null;

  const submitPublishDecision = async (finalDecision: 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT') => {
    setLoading(true);
    setError('');

    try {
      await publishDecision(manuscript.id, finalDecision, letter);
      onWorkflowChange();
      setDecision(null);
      setLetter('');
    } catch (e: any) {
      setError(e.message || 'Failed to make decision');
    } finally {
      setLoading(false);
    }
  };

  const handleMakeDecision = () => {
    if (!decision) return;
    return submitPublishDecision(decision);
  };

  const handleConfirmRevisionDecision = () => {
    if (!decidedRevision?.editor_decision) return;
    return submitPublishDecision(decidedRevision.editor_decision as 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION');
  };

  // Editor asked for another look from the reviewers instead of deciding
  // unilaterally (EditorRevisionReview.tsx's "Move to Reviewer" action) --
  // the Coordinator carries that out here rather than confirming a
  // publish_decision outcome. See coordinator_send_revision_to_reviewers()
  // in 0043_editor_initiated_reviewer_recheck.sql.
  const [sendingToReviewers, setSendingToReviewers] = useState(false);
  const handleSendRevisionToReviewers = async () => {
    setSendingToReviewers(true);
    setError('');
    try {
      await coordinatorSendRevisionToReviewers(manuscript.id);
      onWorkflowChange();
    } catch (e: any) {
      setError(e.message || 'Failed to send revision to reviewers');
    } finally {
      setSendingToReviewers(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Reviewer Decisions -- original round peer review only. Nothing
          to show at the screening stage (before any reviewer is ever
          assigned), so this card doesn't render at all rather than showing
          an empty "No reviewers assigned yet" placeholder. */}
      {reviewerAssignments.length > 0 && (
      <div className="bg-blue-50/60 border-2 border-blue-100 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setReviewerDecisionsExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-6 py-4 hover:bg-blue-50 transition"
        >
          {reviewerDecisionsExpanded ? <ChevronDown className="w-4 h-4 text-blue-700" /> : <ChevronRight className="w-4 h-4 text-blue-700" />}
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2">
            <Users className="w-4 h-4" /> Reviewer Decisions
          </h3>
        </button>
        {reviewerDecisionsExpanded && (
          <div className="px-6 pb-6">
            <div className="space-y-2">
              {reviewerAssignments.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-white border border-blue-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{profiles[r.reviewer_id]?.name || 'Reviewer'}</p>
                    <p className="text-xs text-slate-500">{r.status === 'SUBMITTED' ? 'Review submitted' : r.status.replace(/_/g, ' ')}</p>
                  </div>
                  <DecisionPill decision={r.status === 'SUBMITTED' ? (r.recommendation || null) : null} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* 1b. Initial Editorial Screening summary -- shown once, for the
          round-1 gate only (no revisions yet), so the Coordinator can see
          the Editor's 10-question questionnaire, reasons, comments, and
          reject/revision reason before confirming the decision below. */}
      {sortedRevisions.length === 0 && activeEditor && (activeEditor.screening_responses?.length ?? 0) > 0 && (
        <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 flex items-center gap-2 border-b border-slate-200">
            <ClipboardList className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-black text-slate-900">Initial Editorial Screening</h3>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-3">
              {(activeEditor.screening_responses as ScreeningResponse[]).map((r, idx) => (
                <div key={r.question_id} className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold text-slate-800">{idx + 1}. {SCREENING_QUESTION_LABELS[r.question_id] || r.question_id}</p>
                    {r.answer ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Yes
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" /> No
                      </span>
                    )}
                  </div>
                  {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                </div>
              ))}
            </div>
            {activeEditor.screening_comments && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Editor Comments</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3">{activeEditor.screening_comments}</p>
              </div>
            )}
            {activeEditor.action_reason && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">
                  {activeEditor.recommendation === 'REJECT' ? 'Rejection Reason' : 'Return to Author Reason'}
                </p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded-lg p-3">{activeEditor.action_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* 4. First Submission Decision -- the Coordinator's decision on the
          ORIGINAL submission. If it required a revision, that decision is
          permanently captured in revision #1's own opening fields
          (decision_type/decision_letter/requested_at), which never get
          touched again once revision #1 exists. If it was accepted or
          rejected outright with no revision ever requested, read that
          straight off the manuscript status instead. */}
      {firstSubmissionRevision ? (
        <div className="bg-white border-2 border-violet-100 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setFirstSubmissionExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 bg-violet-50/60 hover:bg-violet-50 transition"
          >
            <div className="flex items-center gap-2">
              {firstSubmissionExpanded ? <ChevronDown className="w-4 h-4 text-violet-700" /> : <ChevronRight className="w-4 h-4 text-violet-700" />}
              <FileCheck className="w-4 h-4 text-violet-700" />
              <h3 className="text-sm font-black text-violet-900">First Submission Decision</h3>
            </div>
            <span className="font-bold rounded-full border bg-violet-100 text-violet-800 border-violet-300 text-sm px-4 py-1.5">
              {firstSubmissionRevision.origin === 'EDITOR_SCREENING'
                ? 'Return to Author'
                : getRevisionDecisionLabel(firstSubmissionRevision.decision_type as any, 0)}
            </span>
          </button>
          {firstSubmissionExpanded && (
            <div className="px-6 pb-6 pt-1 space-y-3">
              <p className="text-xs text-violet-700/70">
                {new Date(firstSubmissionRevision.requested_at).toLocaleString()}
                {firstSubmissionRevision.requested_by && profiles[firstSubmissionRevision.requested_by] ? ` — ${profiles[firstSubmissionRevision.requested_by].name}` : ''}
              </p>
              {firstSubmissionRevision.decision_letter && (
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-white border border-violet-200 rounded-lg p-3">{firstSubmissionRevision.decision_letter}</p>
              )}
            </div>
          )}
        </div>
      ) : (manuscript.status === 'ACCEPTED' || manuscript.status === 'REJECTED') ? (
        <div className="bg-violet-50/60 border-2 border-violet-100 rounded-2xl p-6 flex items-center justify-between">
          <h3 className="text-sm font-black text-violet-900 flex items-center gap-2">
            <FileCheck className="w-4 h-4" /> First Submission Decision
          </h3>
          <DecisionPill decision={manuscript.status === 'ACCEPTED' ? 'ACCEPT' : 'REJECT'} size="lg" />
        </div>
      ) : null}

      {/* 5. One card per revision cycle, chronological -- each shows that
          cycle's Editor Decision (comments + checklist, dynamically
          labeled) and Coordinator Decision, never overwritten by a later
          cycle (see 0019/0020 migrations). */}
      {sortedRevisions.map((rev, idx) => {
        const isExpanded = expandedRevisions[rev.id] ?? idx === sortedRevisions.length - 1;
        const fullyDecided = !!rev.editor_decision && !!rev.coordinator_decision;
        const statusPill = fullyDecided
          ? { label: getRevisionDecisionLabel(rev.coordinator_decision as any, rev.revision_number), className: 'bg-emerald-100 text-emerald-700' }
          : rev.editor_decision
          ? { label: 'AWAITING COORDINATOR', className: 'bg-amber-100 text-amber-700' }
          : { label: 'AWAITING EDITOR', className: 'bg-slate-100 text-slate-600' };

        return (
          <div key={rev.id} className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleRevisionExpanded(rev.id)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                <h3 className="text-sm font-black text-slate-900">Revision {rev.revision_number} Decision</h3>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${fullyDecided ? '' : 'uppercase'} ${statusPill.className}`}>
                {statusPill.label}
              </span>
            </button>

            {isExpanded && (
              <div className="px-6 pb-6 pt-1 space-y-5">
                <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-700/70 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" /> Editor Decision
                    </p>
                    {rev.editor_decision ? (
                      <span className="font-bold rounded-full border bg-teal-100 text-teal-800 border-teal-300 text-xs px-2.5 py-1">
                        {getRevisionDecisionLabel(rev.editor_decision as any, rev.revision_number)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Awaiting editor decision</span>
                    )}
                  </div>
                  {rev.editor_comments && (
                    <p className="text-sm text-slate-800 whitespace-pre-wrap bg-white border border-teal-200 rounded-lg p-3">{rev.editor_comments}</p>
                  )}
                  {rev.editor_checklist?.length > 0 && (
                    <div className="bg-white border border-teal-200 rounded-lg p-3 space-y-1.5">
                      {rev.editor_checklist.map(item => (
                        <p key={item.id} className={`text-sm flex items-center gap-2 ${item.checked ? 'text-slate-700' : 'text-slate-400'}`}>
                          <span>{item.checked ? '☑' : '☐'}</span> {item.label}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 6. Coordinator Final Decision -- the action card. Only relevant
          while something is actually pending; once decided, the Final
          Decision card (7, below) is the single place that shows the
          outcome -- no need to also keep this action card around
          redundantly saying the same thing. */}
      {!decided && (
      <div className="bg-emerald-50/60 border-2 border-emerald-200 rounded-2xl p-6 space-y-6">
        <div>
          <h3 className="text-sm font-black text-emerald-900 flex items-center gap-2">
            <Gavel className="w-4 h-4" /> Editor Decision
          </h3>
          <p className="text-xs text-emerald-700/70 mt-1">
            To be chosen by the Coordinator below — this becomes the manuscript's official final decision.
          </p>
        </div>

        {!canDecide ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900 mb-1">Decision Unavailable</p>
              <p className="text-sm text-amber-800">
                Waiting for: {[
                  !hasEditorEvaluation && 'Editor evaluation',
                  reviewerAssignments.length > 0 && !hasRequiredReviews && `${reviewerAssignments.filter(r => r.status !== 'SUBMITTED').length} reviewer report(s)`,
                  hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews) && manuscript.status !== 'AWAITING_DECISION' && `manuscript to be ready for a decision (currently ${getManuscriptStatusLabel(manuscript)})`,
                ].filter(Boolean).join(', ') || 'the manuscript to be ready for a decision'}
              </p>
            </div>
          </div>
        ) : pendingRevisionConfirm && decidedRevision && decidedRevision.editor_decision === 'ADDITIONAL_REVIEW' ? (
          <>
            <div className="bg-white border-2 border-blue-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700/70 mb-1">Editor's Decision</p>
              <p className="text-lg font-black text-slate-900">Editor requests reviewer re-check</p>
              {decidedRevision.editor_comments && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap bg-blue-50 border border-blue-200 rounded-lg p-3">{decidedRevision.editor_comments}</p>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleSendRevisionToReviewers}
              disabled={sendingToReviewers}
              className="w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {sendingToReviewers ? 'Sending...' : 'Send to Reviewers for Re-review'}
            </button>
          </>
        ) : pendingRevisionConfirm && decidedRevision ? (
          <>
            <div className="bg-white border-2 border-emerald-200 rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700/70 mb-1">Editor's Decision</p>
              <p className="text-lg font-black text-slate-900">
                {getRevisionDecisionLabel(decidedRevision.editor_decision as any, decidedRevision.revision_number)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {decidedRevision.editor_decision === 'ACCEPT' ? 'Decision Letter to Author (Optional)' : 'Note to Author (Optional)'}
              </label>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                placeholder="Write a note to the author..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                rows={6}
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleConfirmRevisionDecision}
              disabled={loading}
              className="w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? 'Sending...' : decidedRevision.editor_decision === 'ACCEPT'
                ? `Accept Submission ${decidedRevision.revision_number} — Send to Production`
                : `Send Back to Author for Revision ${decidedRevision.revision_number + 1}`}
            </button>
          </>
        ) : pendingPeerReviewConfirm && activeEditor?.recommendation ? (
          <>
            <div className="bg-white border-2 border-emerald-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700/70 mb-1">Editor's Decision (Peer Review)</p>
              <p className="text-lg font-black text-slate-900">
                {DECISION_LABELS[activeEditor.recommendation] || activeEditor.recommendation.replace(/_/g, ' ')}
              </p>
              {activeEditor.peer_review_comments && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap bg-emerald-50 border border-emerald-200 rounded-lg p-3">{activeEditor.peer_review_comments}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {activeEditor.recommendation === 'ACCEPT' ? 'Decision Letter to Author (Optional)' : 'Note to Author (Optional)'}
              </label>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                placeholder="Write a note to the author..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                rows={6}
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={() => submitPublishDecision(activeEditor.recommendation as 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT')}
              disabled={loading}
              className="w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? 'Sending...' : activeEditor.recommendation === 'ACCEPT'
                ? 'Accept Submission — Send to Production'
                : activeEditor.recommendation === 'REJECT'
                ? 'Confirm Rejection'
                : 'Send Back to Author for Revision 1'}
            </button>
          </>
        ) : pendingScreeningConfirm && activeEditor?.recommendation ? (
          <>
            {/* Comments / Return to Author Reason are already shown above in
                the Initial Editorial Screening card, and that's what gets
                sent to the Author (letter state is pre-filled from
                activeEditor.action_reason by the useEffect above). Just a
                compact "Decision: X" line plus the confirm action here. */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700/70">Decision</p>
              <p className="text-base font-black text-slate-900">
                {SCREENING_DECISION_LABELS[activeEditor.recommendation] || activeEditor.recommendation.replace(/_/g, ' ')}
              </p>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={() => submitPublishDecision(activeEditor.recommendation as 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT')}
              disabled={loading}
              className="w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? 'Sending...' : activeEditor.recommendation === 'ACCEPT'
                ? 'Move to Peer Review — Confirm'
                : activeEditor.recommendation === 'REJECT'
                ? 'Confirm Rejection'
                : 'Return Back to Author'}
            </button>
          </>
        ) : isPeerReviewRound ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900 mb-1">Waiting for the Editor</p>
              <p className="text-sm text-amber-800">
                Both peer reviews are in, but the Editor hasn't recorded a decision on them yet. The Coordinator confirms the Editor's call here — not a free pick.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { id: 'ACCEPT', label: 'Accept', color: 'emerald' },
                { id: 'MINOR_REVISION', label: 'Minor Revision', color: 'amber' },
                { id: 'MAJOR_REVISION', label: 'Major Revision', color: 'orange' },
                { id: 'REJECT', label: 'Reject', color: 'red' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setDecision(opt.id as any)}
                  className={`px-4 py-3 rounded-lg font-bold text-sm transition ${
                    decision === opt.id
                      ? `bg-${opt.color}-600 text-white`
                      : `border-2 border-${opt.color}-200 text-${opt.color}-700 hover:bg-${opt.color}-50`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Decision Letter (Optional)</label>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                placeholder="Write a decision letter to the author..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                rows={6}
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleMakeDecision}
              disabled={!decision || loading}
              className="w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? 'Submitting...' : 'Submit Decision'}
            </button>
          </>
        )}
      </div>
      )}

      {/* 7. Final Status Card */}
      {decided && (
        <div className={`rounded-2xl border-2 overflow-hidden ${
          manuscript.status === 'REJECTED' ? 'bg-red-50 border-red-200' :
          manuscript.status === 'REVISION_REQUESTED' ? 'bg-amber-50 border-amber-200' :
          'bg-emerald-50 border-emerald-200'
        }`}>
          <button
            type="button"
            onClick={() => setFinalDecisionExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-6 py-4 hover:bg-black/5 transition"
          >
            {finalDecisionExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Final Decision</p>
              <p className="text-lg font-black text-slate-900">{finalRevisionDecisionLabel || (finalDecisionLabel ? (DECISION_LABELS[finalDecisionLabel] || finalDecisionLabel) : statusMeta.label)}</p>
            </div>
          </button>
          {finalDecisionExpanded && (
            <div className="px-6 pb-6 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</p>
              <p className="text-lg font-black text-slate-900">{statusMeta.label}</p>
              {statusMeta.nextStep && (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 pt-3">Next Step</p>
                  <p className="text-sm font-bold text-slate-700">{statusMeta.nextStep}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 8. Send to Publisher -- Coordinator-only, once the manuscript has
          actually been accepted. Opens a self-contained "create a Publisher
          account" flow instead of requiring the Coordinator to separately
          visit the Publishers roster first. Once already sent, the button
          stays available (relabeled) so the Coordinator can reopen the same
          modal to see which Publisher accounts currently have access --
          the actual send_to_publisher RPC only fires once, but the roster
          view stays reachable indefinitely for reference. */}
      {!isEditor && manuscript.status === 'ACCEPTED' && (
        <button
          type="button"
          onClick={() => setShowSendToPublisherModal(true)}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 font-bold rounded-2xl transition ${
            manuscript.production_stage ? 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-900 hover:bg-slate-800 text-white'
          }`}
        >
          <Send className="w-4 h-4" /> {manuscript.production_stage ? 'View Publisher Accounts' : 'Send to Publisher'}
        </button>
      )}

      {showSendToPublisherModal && (
        <SendToPublisherModal
          manuscriptId={manuscript.id}
          alreadySent={!!manuscript.production_stage}
          assignedPublisherId={manuscript.assigned_publisher_id}
          onClose={() => setShowSendToPublisherModal(false)}
          onSent={onWorkflowChange}
        />
      )}
    </div>
  );
}

function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  return Array.from({ length: 12 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Coordinator-only: hand this manuscript off to Publishers (send_to_publisher
 * notifies every ACTIVE publisher account -- it isn't targeted at one
 * specific account). If active publisher accounts already exist, offer to
 * send directly to that roster; otherwise (or if the Coordinator explicitly
 * wants to onboard someone new) fall back to creating a new Publisher
 * account first, same as the original "Invite Publisher" flow.
 */
function SendToPublisherModal({ manuscriptId, alreadySent, assignedPublisherId, onClose, onSent }: { manuscriptId: string; alreadySent: boolean; assignedPublisherId?: string | null; onClose: () => void; onSent: () => void }) {
  const [loadingPublishers, setLoadingPublishers] = useState(true);
  const [existingPublishers, setExistingPublishers] = useState<ProfileRow[]>([]);
  const [mode, setMode] = useState<'PICK' | 'CREATE'>('PICK');
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [password, setPassword] = useState(generateTempPassword());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    listActiveProfilesByRole('PUBLISHER')
      .then((rows) => {
        setExistingPublishers(rows);
        if (rows.length === 0 && !alreadySent) setMode('CREATE');
      })
      .catch(() => { if (!alreadySent) setMode('CREATE'); })
      .finally(() => setLoadingPublishers(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSendToExisting = async () => {
    if (!selectedPublisherId) { setError('Choose which Publisher account to send this manuscript to.'); return; }
    setLoading(true);
    setError('');
    try {
      await sendToPublisher(manuscriptId, selectedPublisherId);
      setSent(true);
      onSent();
    } catch (e: any) {
      setError(e.message || 'Failed to send to publisher.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOrg = organization.trim();
    setError('');

    if (!normalizedName) { setError('Please enter the publisher name.'); return; }
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) { setError('Please enter a valid email address.'); return; }
    if (!normalizedOrg) { setError('Please enter the publisher organization.'); return; }
    if (!password || password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setLoading(true);
    try {
      const profile = await createAndActivatePublisherAccount(normalizedEmail, password, normalizedName, normalizedOrg);
      if (!profile) throw new Error('Publisher account was created but could not be looked up.');
      await sendToPublisher(manuscriptId, profile.id);
      setCredentials({ email: normalizedEmail, password });
      setSent(true);
      onSent();
    } catch (e: any) {
      setError(e.message || 'Failed to create the publisher account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-[#004d2b] to-[#008751] text-white px-6 py-4 flex items-center justify-between border-b">
          <h2 className="text-lg font-bold">{sent ? 'Sent to Publisher' : alreadySent ? 'Publisher Accounts' : mode === 'CREATE' ? 'Create Publisher Account' : 'Send to Publisher'}</h2>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-1 rounded transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="p-6 space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-bold text-emerald-900 mb-1">✓ Manuscript sent to production</p>
              <p className="text-xs text-emerald-800">
                {credentials
                  ? 'The publisher account below can now access this manuscript. This password is only shown once -- copy it now.'
                  : 'This manuscript is now visible to every active Publisher account.'}
              </p>
            </div>
            {credentials && (
              <>
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Email</p>
                  <div className="bg-white rounded-lg p-2 flex items-center justify-between">
                    <p className="text-sm font-mono text-slate-800 break-all">{credentials.email}</p>
                    <button onClick={() => copyToClipboard(credentials.email, 'email')} className="ml-2 p-2 hover:bg-slate-100 rounded-lg transition shrink-0" title="Copy email">
                      <Copy className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                  {copiedField === 'email' && <p className="text-[10px] text-emerald-600 font-semibold">✓ Copied</p>}
                </div>
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Password</p>
                  <div className="bg-white rounded-lg p-2 flex items-center justify-between">
                    <p className="text-sm font-mono text-slate-800 break-all">{credentials.password}</p>
                    <button onClick={() => copyToClipboard(credentials.password, 'password')} className="ml-2 p-2 hover:bg-slate-100 rounded-lg transition shrink-0" title="Copy password">
                      <Copy className="w-4 h-4 text-emerald-600" />
                    </button>
                  </div>
                  {copiedField === 'password' && <p className="text-[10px] text-emerald-600 font-semibold">✓ Copied</p>}
                </div>
                <p className="text-[10px] text-slate-500">This account also now appears on the Coordinator's Publishers roster (sidebar), where the password can be reset again later if needed.</p>
              </>
            )}
            <button onClick={onClose} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition">
              Done
            </button>
          </div>
        ) : loadingPublishers ? (
          <div className="p-10 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading publisher accounts...
          </div>
        ) : mode === 'PICK' ? (
          <div className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
            <p className="text-xs text-slate-500">
              {alreadySent
                ? 'This manuscript is already in production. The account it was sent to is highlighted below.'
                : 'Choose which Publisher account this manuscript should be sent to.'}
            </p>
            {existingPublishers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">No active publisher accounts found.</div>
            ) : (
              <div className="space-y-2">
                {existingPublishers.map((p) => {
                  const isAssigned = alreadySent && p.id === assignedPublisherId;
                  const isSelected = !alreadySent && p.id === selectedPublisherId;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      disabled={alreadySent}
                      onClick={() => setSelectedPublisherId(p.id)}
                      className={`w-full flex items-center gap-3 border rounded-xl p-3 text-left transition ${
                        isAssigned ? 'border-emerald-400 bg-emerald-50' : isSelected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'
                      } ${alreadySent ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className={`p-2 rounded-lg shrink-0 border ${isAssigned || isSelected ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                        <Building2 className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{p.name || 'Unnamed publisher'}</p>
                        <p className="text-xs text-slate-500 truncate">{p.email}</p>
                      </div>
                      {isAssigned && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full shrink-0">Sent here</span>}
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
            {alreadySent ? (
              <button onClick={onClose} className="w-full bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition">
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={handleSendToExisting}
                  disabled={loading || !selectedPublisherId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {loading ? 'Sending...' : selectedPublisherId ? 'Send to Publisher' : 'Select a publisher to send'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('CREATE')}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Invite a new Publisher instead
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {existingPublishers.length > 0 && (
              <button
                type="button"
                onClick={() => setMode('PICK')}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back to existing publishers
              </button>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Publisher name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Lee"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Email address</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="publisher@example.com"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Organization</label>
              <input
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Springer Nature"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Temporary password</label>
              <div className="flex gap-2">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-500"
                />
                <button type="button" onClick={() => setPassword(generateTempPassword())} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shrink-0">
                  Generate
                </button>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition"
            >
              {loading ? 'Sending...' : 'Create Account & Send to Publisher'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
