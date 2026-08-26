import { ManuscriptRow, RevisionRow } from '../../lib/workflow';
import { Download, MoreVertical, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getManuscriptStatusLabel, getRevisionMeta, STANDARD_STATUS_COLORS } from '../../lib/manuscriptStatusLabel';

interface Props {
  manuscript: ManuscriptRow;
  onRefresh: () => void;
  latestRevision?: RevisionRow | null;
}

export default function ManuscriptDetailHeader({ manuscript, onRefresh, latestRevision }: Props) {
  const formatDate = (date: string | null) => {
    if (!date) return '--';
    return new Date(date).toLocaleString();
  };
  const statusLabel = getManuscriptStatusLabel(manuscript, latestRevision);
  const revisionMeta = getRevisionMeta(latestRevision);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <p className="font-mono text-xs text-slate-400">{manuscript.id}</p>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{manuscript.title}</h1>
          <p className="text-sm text-slate-600 mt-1">
            by <span className="font-semibold">{manuscript.author_name}</span> &middot; {manuscript.author_email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full font-bold text-sm uppercase tracking-wide border ${STANDARD_STATUS_COLORS[statusLabel as keyof typeof STANDARD_STATUS_COLORS] || STANDARD_STATUS_COLORS.DRAFT}`}>
            {statusLabel}
          </span>
          {revisionMeta && (
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-bold text-xs uppercase tracking-wide">
              Revision {revisionMeta.revisionNumber}{revisionMeta.revisionType ? ` — ${revisionMeta.revisionType}` : ''}
            </span>
          )}
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
          <button
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            title="More actions"
          >
            <MoreVertical className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Submitted</p>
          <p className="text-slate-900">{formatDate(manuscript.submitted_at)}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Type</p>
          <p className="text-slate-900">{manuscript.manuscript_type || 'Original Research'}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Section</p>
          <p className="text-slate-900">{manuscript.section || 'General'}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Last Updated</p>
          <p className="text-slate-900">{formatDate(manuscript.updated_at)}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
        <button
          onClick={async () => {
            try {
              const { data, error } = await supabase
                .from('manuscript_files')
                .select('file_name, public_url')
                .eq('manuscript_id', manuscript.id);

              if (error) throw error;
              if (!data || data.length === 0) {
                alert('No files to download');
                return;
              }

              // Download each file
              for (const file of data) {
                if (file.public_url) {
                  const link = document.createElement('a');
                  link.href = file.public_url;
                  link.download = file.file_name;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }
            } catch (e) {
              console.error('Download error:', e);
              alert('Failed to download files');
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition"
        >
          <Download className="w-3.5 h-3.5" />
          Download All Files
        </button>
      </div>
    </div>
  );
}
