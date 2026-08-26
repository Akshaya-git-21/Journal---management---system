import { useState, useEffect } from 'react';
import {
  getRevisionFiles, submitEditorRecommendation, ManuscriptFileRow, RevisionRow, ChecklistItem,
  ReviewerRecommendation
} from '../lib/workflow';
import { getLatestRevision } from '../lib/manuscriptStatusLabel';
import { Loader2, FileText, Eye, Download, CheckCircle, Send } from 'lucide-react';
import FilePreviewModal from './FilePreviewModal';

interface Props {
  manuscriptTitle: string;
  manuscriptId: string;
  revisions: RevisionRow[];
  onSubmitSuccess: () => void;
  /** Called instead of onSubmitSuccess specifically when the Editor confirms
   * "Move to Next Stage" -- lets the parent jump straight to the existing
   * reviewer-selection screen instead of dropping the Editor back at a
   * generic dashboard they'd have to navigate away from manually. Falls
   * back to onSubmitSuccess if not provided. */
  onMoveToNextStage?: () => void;
}

const DEFAULT_CHECKLIST: string[] = [
  'Manuscript has been reviewed.',
  'Required revisions have been identified.',
  'Author responses/revisions have been checked.',
  'Manuscript is suitable for the next stage.',
  'Editor comments have been provided.',
];

// Same 3 actions as the original screening round (EditorEvaluationFormTab.tsx's
// ACTION_META) -- Reject / Return to Author (always MAJOR_REVISION under the
// hood) / Move to Next Stage (ACCEPT, which now stays at EDITOR_REVIEW so the
// existing reviewer-selection flow picks it up -- see
// 0038_revision_loop_accept_and_author_response.sql). Replaces the previous
// Accept/Minor/Major triad, which had no Reject option and no path to
// reviewer selection at all.
type RevisionAction = 'REJECT' | 'RETURN_TO_AUTHOR' | 'NEXT_STAGE';
const ACTION_META: Record<RevisionAction, { title: string; confirmLabel: string; recommendation: ReviewerRecommendation; style: string }> = {
  REJECT: { title: 'Reject', confirmLabel: 'Confirm Rejection', recommendation: 'REJECT', style: 'bg-red-700 hover:bg-red-800' },
  RETURN_TO_AUTHOR: { title: 'Return to Author', confirmLabel: 'Confirm Return to Author', recommendation: 'MAJOR_REVISION', style: 'bg-amber-700 hover:bg-amber-800' },
  NEXT_STAGE: { title: 'Move to Next Stage', confirmLabel: 'Confirm & Move to Next Stage', recommendation: 'ACCEPT', style: 'bg-emerald-700 hover:bg-emerald-800' },
};
const ACTIONS: RevisionAction[] = ['REJECT', 'RETURN_TO_AUTHOR', 'NEXT_STAGE'];

/**
 * Dedicated full-page screen for an editor re-reviewing a resubmitted
 * revision. This is intentionally a separate, self-contained UI from the
 * original first-round Editor Evaluation (EditorEvaluationFormTab, which is
 * untouched and keeps its numerical scoring criteria) -- here there's no
 * scoring at all, just free-text Editor Comments + a checklist, and three
 * decision buttons whose labels are computed purely from the current
 * revision number (Accept Submission N / Minor Revision N+1 / Major
 * Revision N+1) -- never hardcoded, so the same screen works for every
 * revision cycle. Rendered by EditorWorkspace.tsx whenever the latest
 * revision is UNDER_REVIEW (Coordinator has forwarded it -- see
 * 0018_coordinator_revision_gate.sql / 0019_revision_comments_checklist.sql).
 */
export default function EditorRevisionReview({
  manuscriptTitle,
  manuscriptId,
  revisions,
  onSubmitSuccess,
  onMoveToNextStage,
}: Props) {
  const latestRevision = getLatestRevision(revisions);
  const [files, setFiles] = useState<ManuscriptFileRow[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [previewFile, setPreviewFile] = useState<ManuscriptFileRow | null>(null);

  const [comments, setComments] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [selectedAction, setSelectedAction] = useState<RevisionAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!latestRevision) return;
    setComments(latestRevision.editor_comments || '');
    setChecklist(
      latestRevision.editor_checklist && latestRevision.editor_checklist.length > 0
        ? latestRevision.editor_checklist
        : DEFAULT_CHECKLIST.map((label, i) => ({ id: `item-${i}`, label, checked: false }))
    );

    let isMounted = true;
    setLoadingFiles(true);
    getRevisionFiles(latestRevision.id)
      .then((f) => { if (isMounted) setFiles(f); })
      .catch((e) => console.error('Failed to load revision files:', e))
      .finally(() => { if (isMounted) setLoadingFiles(false); });
    return () => { isMounted = false; };
  }, [latestRevision?.id]);

  if (!latestRevision) return null;

  // The screening-stage revision loop always returns a manuscript with
  // MAJOR_REVISION as its decision_type (Return to Author has no
  // minor/major severity distinction -- see EditorEvaluationFormTab.tsx's
  // ACTION_META), so show that action name rather than the raw value.
  const kind = 'Return to Author';

  const toggleChecklistItem = (id: string) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
  };

  const handleConfirm = async () => {
    if (!selectedAction) return;
    setSubmitting(true);
    setError('');
    try {
      await submitEditorRecommendation(manuscriptId, ACTION_META[selectedAction].recommendation, comments.trim(), checklist);
      if (selectedAction === 'NEXT_STAGE') {
        (onMoveToNextStage || onSubmitSuccess)();
      } else {
        onSubmitSuccess();
      }
    } catch (e: any) {
      setError(e.message || 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-slate-50">
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {/* 1. Revision information */}
        <div className="border-b border-slate-200 pb-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Revision Review</p>
          <h1 className="text-xl font-black text-slate-900 mb-3">{manuscriptTitle}</h1>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-bold text-amber-700">{kind}</span>
            <span className="text-sm font-semibold text-slate-500">Revision #{latestRevision.revision_number}</span>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-1">
            <span className="text-xs text-slate-500">Requested {new Date(latestRevision.requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="text-xs font-bold text-blue-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              Editor Review · In Progress
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-3">
            The author has submitted their revision. Review the updated files below, add your comments, complete the checklist, and decide.
          </p>
        </div>

        {/* 2. Files for review */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">
            Revision {latestRevision.revision_number} — Files for Review
          </h3>
          {loadingFiles ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading files...
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No files uploaded for this revision yet.</p>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{f.file_name}</p>
                      <p className="text-xs text-slate-500">{f.file_type} · {f.file_size}</p>
                    </div>
                  </div>
                  {f.public_url && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setPreviewFile(f)} className="p-1.5 hover:bg-slate-200 rounded transition" title="View">
                        <Eye className="w-4 h-4 text-slate-600" />
                      </button>
                      <a href={f.public_url} download={f.file_name} className="p-1.5 hover:bg-slate-200 rounded transition" title="Download">
                        <Download className="w-4 h-4 text-slate-600" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2b. Author's Response -- the note the author typed when
            submitting this revision (manuscript_revisions.author_response,
            see 0038_revision_loop_accept_and_author_response.sql). Kept
            separate from the Editor's own comments below. Always shown
            (not hidden when empty) so it's clear this field exists even
            when this particular author left it blank -- their "Response to
            Editor" note is optional on the submission side. */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Author's Response</h3>
          {latestRevision.author_response ? (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{latestRevision.author_response}</p>
          ) : (
            <p className="text-sm text-slate-400 italic">The author did not provide a response note with this revision.</p>
          )}
        </div>

        {/* 3. Editor Comments */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Editor Comments</h3>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Enter your general comments about this revision..."
            rows={6}
            disabled={submitting}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* 4. Editor Checklist */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Editor Checklist</h3>
          <div className="space-y-2.5">
            {checklist.map((item) => (
              <label key={item.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleChecklistItem(item.id)}
                  disabled={submitting}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className={item.checked ? 'text-slate-500 line-through' : 'text-slate-700'}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 5-6. Decision buttons + Submit Decision */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide">Decision</h3>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ACTIONS.map((act) => {
              const meta = ACTION_META[act];
              const isSelected = selectedAction === act;
              return (
                <button
                  key={act}
                  type="button"
                  disabled={submitting}
                  onClick={() => setSelectedAction(act)}
                  className={`px-4 py-3 rounded-lg font-bold text-sm text-white transition disabled:opacity-50 flex items-center justify-center gap-2 ${meta.style} ${isSelected ? 'ring-2 ring-offset-2 ring-slate-900' : ''}`}
                >
                  {isSelected && <CheckCircle className="w-4 h-4" />}
                  {meta.title}
                </button>
              );
            })}
          </div>

          {selectedAction && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
              <p className="text-xs text-slate-600">
                Confirm <span className="font-bold">{ACTION_META[selectedAction].title}</span>
                {selectedAction === 'NEXT_STAGE'
                  ? ' and move to reviewer selection?'
                  : ' and submit this decision to the Coordinator?'}
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setSelectedAction(null)}
                  className="px-3 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirm}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center gap-2"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {ACTION_META[selectedAction].confirmLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {previewFile && (
        <FilePreviewModal
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          fileName={previewFile.file_name}
          fileType={previewFile.file_type}
          fileSize={previewFile.file_size}
          publicUrl={previewFile.public_url || undefined}
        />
      )}
    </div>
  );
}
