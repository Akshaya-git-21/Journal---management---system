import { useState, useEffect } from 'react';
import { getRevisionFiles, ManuscriptFileRow, RevisionRow, EditorAssignmentRow, SuggestedReviewerRow } from '../lib/workflow';
import { getLatestRevision } from '../lib/manuscriptStatusLabel';
import { Loader2, FileText, Eye, Download } from 'lucide-react';
import { EditorEvaluationFormTab } from './manuscript-detail/tabs/EditorEvaluationFormTab';
import FilePreviewModal from './FilePreviewModal';

interface Props {
  manuscriptTitle: string;
  manuscriptId: string;
  assignmentId: string;
  assignment: EditorAssignmentRow;
  revisions: RevisionRow[];
  suggestedReviewers: SuggestedReviewerRow[];
  onSubmitSuccess: () => void;
}

/**
 * Dedicated full-page screen for an editor re-reviewing a resubmitted
 * revision -- mirrors AuthorRevisionRequest.tsx's shape (header banner,
 * files for this specific revision, then the action area) rather than
 * living inside the regular tabbed manuscript view. Rendered by
 * EditorWorkspace.tsx whenever the latest revision is UNDER_REVIEW (i.e.
 * the Coordinator has forwarded it -- see 0018_coordinator_revision_gate.sql).
 */
export default function EditorRevisionReview({
  manuscriptTitle,
  manuscriptId,
  assignmentId,
  assignment,
  revisions,
  suggestedReviewers,
  onSubmitSuccess,
}: Props) {
  const latestRevision = getLatestRevision(revisions);
  const [files, setFiles] = useState<ManuscriptFileRow[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [previewFile, setPreviewFile] = useState<ManuscriptFileRow | null>(null);

  useEffect(() => {
    if (!latestRevision) return;
    let isMounted = true;
    setLoadingFiles(true);
    getRevisionFiles(latestRevision.id)
      .then((f) => { if (isMounted) setFiles(f); })
      .catch((e) => console.error('Failed to load revision files:', e))
      .finally(() => { if (isMounted) setLoadingFiles(false); });
    return () => { isMounted = false; };
  }, [latestRevision?.id]);

  if (!latestRevision) return null;

  const isMinor = latestRevision.decision_type === 'MINOR_REVISION';
  const kind = isMinor ? 'Minor Revision' : latestRevision.decision_type === 'MAJOR_REVISION' ? 'Major Revision' : 'Revision';

  return (
    <div className="w-full bg-slate-50">
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {/* Header */}
        <div className="border-b border-slate-200 pb-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Revision Review</p>
          <h1 className="text-xl font-black text-slate-900 mb-3">{manuscriptTitle}</h1>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className={`text-sm font-bold ${isMinor ? 'text-amber-700' : 'text-red-700'}`}>{kind}</span>
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
            The author has submitted their revision. Review the updated files below, complete your evaluation, and decide whether to accept it or request another revision.
          </p>
        </div>

        {/* Files for Review */}
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

        {/* Comments + Evaluation + Decision (accept / request another revision) */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">
            Your Evaluation & Decision
          </h3>
          <EditorEvaluationFormTab
            assignmentId={assignmentId}
            manuscriptId={manuscriptId}
            assignment={assignment}
            suggestedReviewers={suggestedReviewers}
            revisions={revisions}
            onSubmitSuccess={onSubmitSuccess}
          />
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
