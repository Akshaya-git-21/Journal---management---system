import { useState } from 'react';
import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow } from '../../../lib/workflow';
import { publishDecision } from '../../../lib/workflow';
import { AlertCircle } from 'lucide-react';

interface Props {
  manuscript: ManuscriptRow;
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  onWorkflowChange: () => void;
}

export function DecisionTab({
  manuscript,
  editorAssignments,
  reviewerAssignments,
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

  if (!canDecide) {
    const missing = [];
    if (!hasEditorEvaluation) missing.push('Editor evaluation');
    if (reviewerAssignments.length > 0 && !hasRequiredReviews) {
      const pending = reviewerAssignments.filter(r => r.status !== 'SUBMITTED').length;
      missing.push(`${pending} reviewer report(s)`);
    }
    if (hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews) && manuscript.status !== 'AWAITING_DECISION') {
      missing.push(`manuscript to reach Awaiting Decision (currently ${manuscript.status.replace(/_/g, ' ')})`);
    }

    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-900 mb-2">Decision Unavailable</h3>
            <p className="text-sm text-amber-800 mb-3">Waiting for: {missing.join(', ')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
      <div>
        <h3 className="text-sm font-black text-slate-900 mb-4">Make Final Decision</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
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

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

        <button
          onClick={handleMakeDecision}
          disabled={!decision || loading}
          className="mt-4 w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
        >
          {loading ? 'Submitting...' : 'Submit Decision'}
        </button>
      </div>
    </div>
  );
}
