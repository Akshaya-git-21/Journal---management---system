import { useState } from 'react';
import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, StatusHistoryRow, ProfileRow } from '../../../lib/workflow';
import { publishDecision } from '../../../lib/workflow';
import { AlertCircle, Users, Scale, UserCheck, Gavel, FileCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { computeMajorityDecision, getRevisionDecisionLabel } from '../../../lib/decisionUtils';
import { getManuscriptStatusMeta, getLatestRevision } from '../../../lib/manuscriptStatusLabel';

interface Props {
  manuscript: ManuscriptRow;
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  revisions: RevisionRow[];
  statusHistory: StatusHistoryRow[];
  profiles: Record<string, ProfileRow>;
  onWorkflowChange: () => void;
}

const DECISION_LABELS: Record<string, string> = {
  ACCEPT: 'Accept',
  MINOR_REVISION: 'Minor Revision',
  MAJOR_REVISION: 'Major Revision',
  REJECT: 'Reject',
  SPLIT: 'Split decision',
};

function DecisionPill({ decision, size = 'sm' }: { decision: string | null; size?: 'sm' | 'lg' }) {
  if (!decision) return <span className="text-xs text-slate-400 italic">Pending</span>;
  const style =
    decision === 'ACCEPT' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
    decision === 'REJECT' ? 'bg-red-100 text-red-800 border-red-300' :
    decision === 'SPLIT' ? 'bg-slate-100 text-slate-600 border-slate-200' :
    decision === 'MAJOR_REVISION' ? 'bg-orange-100 text-orange-800 border-orange-300' :
    'bg-amber-100 text-amber-800 border-amber-300';
  return (
    <span className={`font-bold rounded-full border ${style} ${size === 'lg' ? 'text-sm px-4 py-1.5' : 'text-xs px-2.5 py-1'}`}>
      {DECISION_LABELS[decision] || decision.replace(/_/g, ' ')}
    </span>
  );
}

export function DecisionTab({
  manuscript,
  editorAssignments,
  reviewerAssignments,
  revisions,
  profiles,
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
  const toggleRevisionExpanded = (id: string) => setExpandedRevisions(prev => ({ ...prev, [id]: !prev[id] }));

  const hasEditorEvaluation = editorAssignments.some(a => a.assessment_status === 'SUBMITTED');
  const hasRequiredReviews = reviewerAssignments.every(r => r.status === 'SUBMITTED');

  const activeEditor = editorAssignments.find(a => a.status === 'ACCEPTED') || editorAssignments[0];
  const majority = computeMajorityDecision(reviewerAssignments);
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
  // The backend (publish_decision RPC) only accepts a decision once the
  // manuscript has actually reached AWAITING_DECISION -- checking just
  // hasEditorEvaluation/hasRequiredReviews let the form render as "ready"
  // before reviewers were even assigned (reviewerAssignments.length === 0
  // trivially satisfies hasRequiredReviews), so Submit always failed with
  // "Manuscript is not awaiting a decision".
  const canDecide = manuscript.status === 'AWAITING_DECISION' &&
    (pendingRevisionConfirm || (hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews)));
  const decided = ['ACCEPTED', 'REVISION_REQUESTED', 'REJECTED', 'PUBLISHED'].includes(manuscript.status);
  const statusMeta = getManuscriptStatusMeta(manuscript.status, latestRevision);
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

  return (
    <div className="space-y-6">
      {/* 1. Reviewer Decisions -- original round peer review only. */}
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
            {reviewerAssignments.length === 0 ? (
              <p className="text-sm text-blue-700/70">No reviewers assigned yet.</p>
            ) : (
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
            )}
          </div>
        )}
      </div>

      {/* 2. Editor Decision -- original round only. Once a revision cycle
          exists, editor_assignments.recommendation has been overwritten by
          that cycle's decision, so the original round's outcome is only
          reliably available via the First Submission Decision card below
          (derived from the immutable revision row it produced). */}
      {sortedRevisions.length === 0 && (
        <div className="bg-teal-50/60 border-2 border-teal-100 rounded-2xl p-6 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-teal-900 flex items-center gap-2 mb-1">
              <UserCheck className="w-4 h-4" /> Editor Decision
            </h3>
            <p className="text-xs text-teal-700/70">{activeEditor ? profiles[activeEditor.editor_id]?.name || 'Editor' : 'No editor assigned'}</p>
            {activeEditor?.assessment_status === 'SUBMITTED' && !activeEditor.recommendation && (
              <p className="text-xs text-amber-600 mt-1">Evaluation submitted — recommendation not yet given</p>
            )}
          </div>
          <DecisionPill decision={activeEditor?.recommendation || null} />
        </div>
      )}

      {/* 3. Majority Reviewer Decision */}
      <div className="bg-indigo-50/60 border-2 border-indigo-100 rounded-2xl p-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2">
            <Scale className="w-4 h-4" /> Majority Reviewer Decision
          </h3>
          <p className="text-xs text-indigo-700/70 mt-1">Automatically calculated from submitted reviewer recommendations</p>
        </div>
        <DecisionPill decision={majority} size="lg" />
      </div>

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
              {getRevisionDecisionLabel(firstSubmissionRevision.decision_type as any, 0)}
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

                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700/70 flex items-center gap-1.5">
                      <Gavel className="w-3.5 h-3.5" /> Coordinator Decision
                    </p>
                    {rev.coordinator_decision ? (
                      <span className="font-bold rounded-full border bg-emerald-100 text-emerald-800 border-emerald-300 text-xs px-2.5 py-1">
                        {getRevisionDecisionLabel(rev.coordinator_decision as any, rev.revision_number)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        {rev.editor_decision ? 'Awaiting coordinator confirmation' : 'Awaiting editor decision'}
                      </span>
                    )}
                  </div>
                  {rev.coordinator_note && (
                    <p className="text-sm text-slate-800 whitespace-pre-wrap bg-white border border-emerald-200 rounded-lg p-3">{rev.coordinator_note}</p>
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
            <Gavel className="w-4 h-4" /> Coordinator Final Decision
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
                  hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews) && manuscript.status !== 'AWAITING_DECISION' && `manuscript to reach Awaiting Decision (currently ${manuscript.status.replace(/_/g, ' ')})`,
                ].filter(Boolean).join(', ') || 'the manuscript to reach Awaiting Decision'}
              </p>
            </div>
          </div>
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
    </div>
  );
}
