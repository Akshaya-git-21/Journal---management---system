import { useEffect, useState } from 'react';
import { getRevisions, getRevisionFiles, getManuscriptFiles, RevisionRow, ManuscriptFileRow, ProfileRow } from '../lib/workflow';
import { ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';

interface Props {
  manuscriptId: string;
  profiles?: Record<string, ProfileRow>;
}

const STATUS_LABEL: Record<string, string> = {
  AWAITING_AUTHOR_UPLOAD: 'Awaiting Author Upload',
  REVISION_SUBMITTED: 'Revision Submitted',
  UNDER_REVIEW: 'Under Editor Review',
  COMPLETED: 'Completed',
};

/**
 * Full revision history -- original submission + every Revision N, each
 * showing its own decision letter, status, timestamps, and files. Files are
 * scoped by revision_id (see manuscript_files.revision_id in workflow.ts),
 * so nothing here ever overwrites or hides an earlier revision's uploads --
 * the original submission's files (getManuscriptFiles, revision_id IS NULL)
 * stay listed separately from every subsequent revision's files.
 * Shared across Author/Editor/Coordinator detail views; RLS already scopes
 * what each caller is allowed to see.
 */
export default function RevisionHistoryPanel({ manuscriptId, profiles = {} }: Props) {
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [originalFiles, setOriginalFiles] = useState<ManuscriptFileRow[]>([]);
  const [revisionFiles, setRevisionFiles] = useState<Record<string, ManuscriptFileRow[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([getRevisions(manuscriptId), getManuscriptFiles(manuscriptId)])
      .then(async ([revs, files]) => {
        if (!active) return;
        setRevisions(revs);
        setOriginalFiles(files);

        const filesByRevision: Record<string, ManuscriptFileRow[]> = {};
        await Promise.all(revs.map(async (r) => {
          filesByRevision[r.id] = await getRevisionFiles(r.id);
        }));
        if (active) setRevisionFiles(filesByRevision);

        // Original submission open by default when there are no revisions
        // yet; otherwise open the most recent revision.
        setExpanded(revs.length > 0 ? { [revs[revs.length - 1].id]: true } : { original: true });
      })
      .catch((e: any) => { if (active) setError(e.message || 'Failed to load revision history'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [manuscriptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading revision history...
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">{error}</div>;
  }

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderFiles = (files: ManuscriptFileRow[]) => (
    files.length === 0 ? (
      <p className="text-xs text-slate-400 italic">No files</p>
    ) : (
      <div className="space-y-2">
        {files.map((f) => (
          <div key={f.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{f.file_name}</p>
                <p className="text-[10px] text-slate-500">{f.file_type} &middot; {f.file_size || '--'} &middot; {new Date(f.uploaded_at).toLocaleString()}</p>
              </div>
            </div>
            {f.public_url && (
              <a href={f.public_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-emerald-700 hover:underline shrink-0 ml-2">
                View
              </a>
            )}
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="space-y-3">
      {/* Original submission -- files are revision_id IS NULL, immutable */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggle('original')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2">
            {expanded.original ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            <span className="text-sm font-black text-slate-900">Original Submission</span>
          </div>
          <span className="text-[11px] font-bold text-slate-500 uppercase">{originalFiles.length} file{originalFiles.length !== 1 ? 's' : ''}</span>
        </button>
        {expanded.original && (
          <div className="px-5 pb-5 pt-1">{renderFiles(originalFiles)}</div>
        )}
      </div>

      {revisions.map((rev) => (
        <div key={rev.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => toggle(rev.id)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              {expanded[rev.id] ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
              <span className="text-sm font-black text-slate-900">
                Revision {rev.revision_number}
                {rev.decision_type && (
                  <span className="ml-2 text-[10px] font-bold uppercase text-orange-600">
                    {rev.decision_type === 'MAJOR_REVISION' ? 'Major' : 'Minor'}
                  </span>
                )}
              </span>
            </div>
            <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${
              rev.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700'
              : rev.status === 'REVISION_SUBMITTED' || rev.status === 'UNDER_REVIEW' ? 'bg-blue-100 text-blue-700'
              : 'bg-amber-100 text-amber-700'
            }`}>
              {STATUS_LABEL[rev.status] || rev.status}
            </span>
          </button>
          {expanded[rev.id] && (
            <div className="px-5 pb-5 pt-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                <div>
                  <p className="font-bold text-slate-700 uppercase text-[10px] mb-1">Requested</p>
                  <p>{new Date(rev.requested_at).toLocaleString()}{rev.requested_by && profiles[rev.requested_by] ? ` by ${profiles[rev.requested_by].name}` : ''}</p>
                </div>
                {rev.submitted_at && (
                  <div>
                    <p className="font-bold text-slate-700 uppercase text-[10px] mb-1">Submitted</p>
                    <p>{new Date(rev.submitted_at).toLocaleString()}</p>
                  </div>
                )}
              </div>
              {rev.decision_letter && (
                <div>
                  <p className="font-bold text-slate-700 uppercase text-[10px] mb-1">Decision Letter</p>
                  <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap">{rev.decision_letter}</p>
                </div>
              )}
              <div>
                <p className="font-bold text-slate-700 uppercase text-[10px] mb-2">Files for This Revision</p>
                {renderFiles(revisionFiles[rev.id] || [])}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
