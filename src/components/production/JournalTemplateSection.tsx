import { useEffect, useState } from 'react';
import { FileText, Upload, Download, Eye, Loader2, Trash2, ClipboardCheck } from 'lucide-react';
import { JournalTemplateRow, getJournalTemplates, uploadJournalTemplate, deleteJournalTemplate } from '../../lib/production';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Journal PDF Template (Task 7) -- a single journal-wide file (not per-
 * manuscript), used by both the Coordinator's and the GD Member's Production
 * sidebar. `canUpload` gates the Coordinator-only upload/replace/delete
 * actions client-side; the real gate is server-side RLS on journal_templates
 * and the templates/ storage prefix (0058_journal_pdf_template.sql) -- a GD
 * Member calling uploadJournalTemplate() would be rejected regardless of
 * what this component renders.
 */
export default function JournalTemplateSection({ canUpload }: { canUpload: boolean }) {
  const [templates, setTemplates] = useState<JournalTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const load = async () => {
    try {
      setTemplates(await getJournalTemplates());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (file: File) => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await uploadJournalTemplate(file);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to upload the template.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (t: JournalTemplateRow) => {
    setError('');
    try {
      await deleteJournalTemplate(t.id, t.storage_path);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to remove the template.');
    }
  };

  const current = templates[0] || null;
  const history = templates.slice(1);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold flex items-center gap-2">
            <ClipboardCheck className="w-3.5 h-3.5" /> Production
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">PDF Template</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl">
            {canUpload
              ? 'Upload the journal formatting template used during production. Replacing it keeps older versions for history.'
              : 'The journal formatting template to use while preparing this manuscript for production.'}
          </p>
        </div>
        {canUpload && (
          <label className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white shadow-sm self-start cursor-pointer ${uploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#008751] hover:bg-[#007043]'}`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : current ? 'Replace Template' : 'Upload Template'}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
            />
          </label>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
      ) : !current ? (
        <div className="text-center py-20 text-sm text-slate-400 bg-white border border-dashed border-slate-300 rounded-2xl">
          {canUpload ? 'No template uploaded yet. Upload one above.' : 'No journal template has been uploaded yet.'}
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 shrink-0">
                  <FileText className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Current Template</p>
                  <p className="mt-1 font-bold text-slate-900">{current.file_name}</p>
                  <p className="text-xs text-slate-400 mt-1">Uploaded {formatDate(current.uploaded_at)}</p>
                </div>
              </div>
              {current.public_url && (
                <div className="flex items-center gap-2 shrink-0">
                  <a href={current.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <Eye className="w-3.5 h-3.5" /> View
                  </a>
                  <a href={current.public_url} download className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                </div>
              )}
            </div>
          </div>

          {history.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                {showHistory ? 'Hide' : 'Show'} previous versions ({history.length})
              </button>
              {showHistory && (
                <div className="mt-4 space-y-2">
                  {history.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-4 py-2.5 text-sm">
                      <div>
                        <p className="text-slate-700">{t.file_name}</p>
                        <p className="text-[11px] text-slate-400">Uploaded {formatDate(t.uploaded_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.public_url && (
                          <a href={t.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                            <Eye className="w-3 h-3" /> View
                          </a>
                        )}
                        {canUpload && (
                          <button onClick={() => handleDelete(t)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
