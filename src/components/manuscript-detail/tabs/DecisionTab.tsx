import { useState } from 'react';
import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, StatusHistoryRow, ProfileRow } from '../../../lib/workflow';
import { publishDecision } from '../../../lib/workflow';
import { AlertCircle, Users, Scale, UserCheck, Gavel, Clock } from 'lucide-react';
import { computeMajorityDecision, buildDecisionHistory } from '../../../lib/decisionUtils';
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
  statusHistory,
  profiles,
  onWorkflowChange
}: Props) {
  const [decision, setDecision] = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null>(null);
  const [letter, setLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasEditorEvaluation = editorAssignments.some(a => a.assessment_status === 'SUBMITTED');
  const hasRequiredReviews = reviewerAssignments.every(r => r.status === 'SUBMITTED');
  // The backend (publish_decision RPC) only accepts a decision once the
  // manuscript has actually reached AWAITING_DECISION -- checking just
  // hasEditorEvaluation/hasRequiredReviews let the form render as "ready"
  // before reviewers were even assigned (reviewerAssignments.length === 0
  // trivially satisfies hasRequiredReviews), so Submit always failed with
  // "Manuscript is not awaiting a decision".
  const canDecide = manuscript.status === 'AWAITING_DECISION' && hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews);

  const activeEditor = editorAssignments.find(a => a.status === 'ACCEPTED') || editorAssignments[0];
  const majority = computeMajorityDecision(reviewerAssignments);
  const history = buildDecisionHistory(editorAssignments, reviewerAssignments, revisions, statusHistory, profiles);
  const latestRevision = getLatestRevision(revisions);
  const decided = ['ACCEPTED', 'REVISION_REQUESTED', 'REJECTED', 'PUBLISHED'].includes(manuscript.status);
  const statusMeta = getManuscriptStatusMeta(manuscript.status, latestRevision);
  const finalDecisionLabel =
    manuscript.status === 'ACCEPTED' ? 'ACCEPT' :
    manuscript.status === 'REJECTED' ? 'REJECT' :
    manuscript.status === 'REVISION_REQUESTED' ? (latestRevision?.decision_type || null) :
    null;

  const handleMakeDecision = async () => {
    if (!decision) return;

    setLoading(true);
    setError('');

    try {
      await publishDecision(manuscript.id, decision, letter);
      onWorkflowChange();
      setDecision(null);
      setLetter('');
    } catch (e: any) {
      setError(e.message || 'Failed to make decision');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Reviewer Decisions */}
      <div className="bg-blue-50/60 border-2 border-blue-100 rounded-2xl p-6">
        <h3 className="text-sm font-black text-blue-900 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" /> Reviewer Decisions
        </h3>
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

      {/* Editor Decision */}
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

      {/* Majority Decision */}
      <div className="bg-indigo-50/60 border-2 border-indigo-100 rounded-2xl p-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2">
            <Scale className="w-4 h-4" /> Majority Reviewer Decision
          </h3>
          <p className="text-xs text-indigo-700/70 mt-1">Automatically calculated from submitted reviewer recommendations</p>
        </div>
        <DecisionPill decision={majority} size="lg" />
      </div>

      {/* Coordinator Final Decision */}
      <div className="bg-emerald-50/60 border-2 border-emerald-200 rounded-2xl p-6 space-y-6">
        <div>
          <h3 className="text-sm font-black text-emerald-900 flex items-center gap-2">
            <Gavel className="w-4 h-4" /> Coordinator Final Decision
          </h3>
          <p className="text-xs text-emerald-700/70 mt-1">
            {decided ? 'Chosen by the Coordinator — this is the manuscript\'s official final decision.' : 'To be chosen by the Coordinator below — this becomes the manuscript\'s official final decision.'}
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
                  hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews) && manuscript.status !== 'AWAITING_DECISION' && !decided && `manuscript to reach Awaiting Decision (currently ${manuscript.status.replace(/_/g, ' ')})`,
                ].filter(Boolean).join(', ') || 'this manuscript has already been decided'}
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

      {/* Final Status Card */}
      {decided && (
        <div className={`rounded-2xl p-6 border-2 ${
          manuscript.status === 'REJECTED' ? 'bg-red-50 border-red-200' :
          manuscript.status === 'REVISION_REQUESTED' ? 'bg-amber-50 border-amber-200' :
          'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Final Decision</p>
            <p className="text-lg font-black text-slate-900">{finalDecisionLabel ? (DECISION_LABELS[finalDecisionLabel] || finalDecisionLabel) : statusMeta.label}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 pt-3">Status</p>
            <p className="text-lg font-black text-slate-900">{statusMeta.label}</p>
            {statusMeta.nextStep && (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 pt-3">Next Step</p>
                <p className="text-sm font-bold text-slate-700">{statusMeta.nextStep}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Decision History */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" /> Decision History
        </h3>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No decisions recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map(entry => (
              <div key={entry.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{entry.actorRole}</p>
                    <p className="text-sm font-semibold text-slate-900">{entry.actorName} → {entry.decision}</p>
                    {entry.detail && <p className="text-xs text-slate-500 mt-1">{entry.detail}</p>}
                  </div>
                  <p className="text-xs text-slate-500 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
