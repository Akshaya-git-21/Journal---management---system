import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, Eye, Download, Check } from 'lucide-react';
import { ManuscriptRow, ProfileRow, getManuscript, getProfilesByIds } from '../../lib/workflow';
import {
  ProductionRow, ProofRow,
  getProduction, getProofs,
  gdMemberSavePublicationMetadata, gdMemberPublishArticle
} from '../../lib/production';
import { getManuscriptStatusLabel, STANDARD_STATUS_COLORS } from '../../lib/manuscriptStatusLabel';

const JOURNAL_NAME = 'Journal of Molecular Sciences';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Tasks 19-22 -- Publication is its own workflow stage for the GD Member,
 * kept as a dedicated page (its own sidebar section, see
 * GDMemberWorkspace.tsx) rather than folded into the same detail view as
 * the earlier production/corrections work in GDMemberProductionDetail.tsx.
 * Shown only for READY_FOR_PUBLICATION and PUBLISHED -- read-only regarding
 * production corrections at this stage.
 */
export default function GDMemberPublicationDetail({ manuscriptId, onBack }: { manuscriptId: string; onBack: () => void }) {
  const [manuscript, setManuscript] = useState<ManuscriptRow | null>(null);
  const [production, setProduction] = useState<ProductionRow | null>(null);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [editorProfile, setEditorProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [metaForm, setMetaForm] = useState({ volume: '', issue: '', publicationDate: '', pageNumbers: '', doi: '', articleUrl: '' });
  const [metaDirty, setMetaDirty] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState('');
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const load = async () => {
    try {
      const [m, prod, pf] = await Promise.all([
        getManuscript(manuscriptId),
        getProduction(manuscriptId),
        getProofs(manuscriptId),
      ]);
      setManuscript(m);
      setProduction(prod);
      setProofs(pf);
      if (!metaDirty && m) {
        setMetaForm({
          volume: m.volume || '', issue: m.issue || '', publicationDate: m.publication_date || '',
          pageNumbers: m.page_numbers || '', doi: m.doi || '', articleUrl: m.article_url || ''
        });
      }
      if (m?.assigned_editor_id) {
        const map = await getProfilesByIds([m.assigned_editor_id]);
        setEditorProfile(map[m.assigned_editor_id] || null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [manuscriptId]);

  const handleSaveMetadata = async () => {
    setSavingMeta(true);
    setMetaError('');
    try {
      await gdMemberSavePublicationMetadata(manuscriptId, metaForm);
      setMetaDirty(false);
      await load();
    } catch (e: any) {
      setMetaError(e.message || 'Failed to save publication metadata.');
    } finally {
      setSavingMeta(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError('');
    try {
      await gdMemberPublishArticle(manuscriptId);
      setShowPublishConfirm(false);
      await load();
    } catch (e: any) {
      setPublishError(e.message || 'Failed to publish the article.');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading publication details...</div>;
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>;
  if (!manuscript) return <div className="text-center py-24 text-slate-400">Manuscript not found.</div>;

  const status = production?.production_status;
  const currentProof = proofs[0] || null;
  const requiredMissing = !metaForm.volume.trim() || !metaForm.issue.trim() || !metaForm.doi.trim() || !metaForm.publicationDate;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border border-slate-200 rounded-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Publication</p>
            <h1 className="mt-2 text-2xl font-black text-slate-900">{manuscript.title}</h1>
          </div>
          {(() => {
            const statusLabel = getManuscriptStatusLabel(manuscript, undefined, status ?? null);
            const statusStyle = STANDARD_STATUS_COLORS[statusLabel as keyof typeof STANDARD_STATUS_COLORS] || STANDARD_STATUS_COLORS.DRAFT;
            return (
              <span className={`shrink-0 px-3 py-1 rounded-full font-bold text-sm uppercase tracking-wide border ${statusStyle}`}>
                {statusLabel}
              </span>
            );
          })()}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Manuscript ID</p><p className="font-mono text-slate-700">{manuscript.id}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Author</p><p className="text-slate-700">{manuscript.author_name} &lt;{manuscript.author_email}&gt;</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Editor</p><p className="text-slate-700">{editorProfile?.name || '--'}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Journal</p><p className="text-slate-700">{JOURNAL_NAME}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Accepted Date</p><p className="text-slate-700">{formatDate(production?.accepted_at || manuscript.updated_at)}</p></div>
        </div>
      </div>

      {/* Task 19: Final approved PDF + proofreading approval, read-only. */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-3">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Final Approved Proof</h2>
        {currentProof ? (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm">
            <div>
              <p className="font-bold text-slate-800">Proof v{currentProof.version}</p>
              <p className="text-xs text-slate-400">{currentProof.file_name}{currentProof.approved_at ? ` • Approved by author ${formatDate(currentProof.approved_at)}` : ''}</p>
            </div>
            {currentProof.public_url && (
              <div className="flex items-center gap-2 shrink-0">
                <a href={currentProof.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View</a>
                <a href={currentProof.public_url} download className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> Download</a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No approved proof on file.</p>
        )}
        <p className="text-xs text-slate-500">Proofreading approved by the author{currentProof?.approved_at ? ` on ${formatDate(currentProof.approved_at)}` : ''} and confirmed by the Coordinator.</p>
      </div>

      {/* Task 20/21: Publication Details form + Publish Article. */}
      {status === 'READY_FOR_PUBLICATION' && (
        <div className="bg-white border-2 border-slate-900 rounded-3xl p-6 space-y-5">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Publication Details</h2>
            <p className="text-xs text-slate-500 mt-1">Enter the required publication metadata, then publish.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">Volume *</label>
              <input value={metaForm.volume} onChange={(e) => { setMetaForm({ ...metaForm, volume: e.target.value }); setMetaDirty(true); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#008751]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">Issue *</label>
              <input value={metaForm.issue} onChange={(e) => { setMetaForm({ ...metaForm, issue: e.target.value }); setMetaDirty(true); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#008751]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">Publication Date *</label>
              <input type="date" value={metaForm.publicationDate} onChange={(e) => { setMetaForm({ ...metaForm, publicationDate: e.target.value }); setMetaDirty(true); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#008751]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">Page Numbers</label>
              <input value={metaForm.pageNumbers} onChange={(e) => { setMetaForm({ ...metaForm, pageNumbers: e.target.value }); setMetaDirty(true); }} placeholder="e.g. 145-160" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#008751]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">DOI *</label>
              <input value={metaForm.doi} onChange={(e) => { setMetaForm({ ...metaForm, doi: e.target.value }); setMetaDirty(true); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#008751]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">Article URL</label>
              <input value={metaForm.articleUrl} onChange={(e) => { setMetaForm({ ...metaForm, articleUrl: e.target.value }); setMetaDirty(true); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#008751]" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={savingMeta || !metaDirty}
              onClick={handleSaveMetadata}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {savingMeta ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              disabled={requiredMissing || metaDirty}
              onClick={() => setShowPublishConfirm(true)}
              title={metaDirty ? 'Save your changes before publishing' : undefined}
              className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Publish Article
            </button>
          </div>
          {requiredMissing && <p className="text-xs text-slate-400">Volume, Issue, DOI, and Publication Date are required before publishing.</p>}
          {metaError && <p className="text-xs font-semibold text-red-600">{metaError}</p>}

          {showPublishConfirm && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-bold text-amber-900">Are you sure you want to publish this article?</p>
              <ul className="text-sm text-amber-800 space-y-1">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Final approved PDF</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Proofreading completed</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Required publication information</li>
              </ul>
              {publishError && <p className="text-xs font-semibold text-red-600">{publishError}</p>}
              <div className="flex items-center gap-2">
                <button disabled={publishing} onClick={handlePublish} className="rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40">
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
                <button onClick={() => setShowPublishConfirm(false)} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task 22: Published -- read-only summary, no further production edits. */}
      {status === 'PUBLISHED' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 space-y-3">
          <p className="text-center text-emerald-700 font-bold">This manuscript has been published.</p>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div><p className="text-[11px] uppercase tracking-wide text-emerald-600">Volume</p><p className="text-emerald-900 font-semibold">{manuscript.volume || '--'}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-emerald-600">Issue</p><p className="text-emerald-900 font-semibold">{manuscript.issue || '--'}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-emerald-600">DOI</p><p className="text-emerald-900 font-semibold">{manuscript.doi || '--'}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-emerald-600">Published Date</p><p className="text-emerald-900 font-semibold">{formatDate(manuscript.published_at)}</p></div>
            {manuscript.article_url && (
              <div className="sm:col-span-2"><p className="text-[11px] uppercase tracking-wide text-emerald-600">Article URL</p><a href={manuscript.article_url} target="_blank" rel="noreferrer" className="text-emerald-900 font-semibold underline">{manuscript.article_url}</a></div>
            )}
            {manuscript.published_pdf_url && (
              <div className="sm:col-span-2">
                <a href={manuscript.published_pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-900 font-semibold underline"><Eye className="w-3.5 h-3.5" /> View Final PDF</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
