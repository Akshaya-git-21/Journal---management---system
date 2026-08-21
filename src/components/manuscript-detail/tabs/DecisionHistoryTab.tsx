import { EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, StatusHistoryRow, ProfileRow } from '../../../lib/workflow';
import { Clock } from 'lucide-react';
import { buildDecisionHistory } from '../../../lib/decisionUtils';

interface Props {
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  revisions: RevisionRow[];
  statusHistory: StatusHistoryRow[];
  profiles: Record<string, ProfileRow>;
}

/**
 * Flat, chronological feed of every decision recorded for this manuscript --
 * reviewer recommendations, editor recommendations, each revision cycle, and
 * the coordinator's final accept/reject. Split out into its own tab (was
 * previously a section at the bottom of DecisionTab) so DecisionTab can stay
 * focused on the current, segregated-by-stage decision state instead of also
 * carrying the full raw timeline.
 */
export function DecisionHistoryTab({
  editorAssignments,
  reviewerAssignments,
  revisions,
  statusHistory,
  profiles
}: Props) {
  const history = buildDecisionHistory(editorAssignments, reviewerAssignments, revisions, statusHistory, profiles);

  return (
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
  );
}
