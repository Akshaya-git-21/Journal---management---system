import { useEffect, useState } from 'react';
import { Loader2, Eye, Download, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import {
  ProductionRow, ProofRow,
  getProduction, getProofs,
  authorOpenProof, authorApproveProof, authorSubmitCorrections,
  uploadCorrectionAttachment
} from '../../lib/production';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Author-facing proof review panel -- Final Proof Available / View / Download /
 * Request Corrections (mandatory attachment, "Proof Corrections" not "Revised
 * Manuscript") / Approve Final Proof with the required confirmation checkbox.
 * Real Supabase-backed workflow via src/lib/production.ts -- does not enter
 * the normal peer-review revision loop. */
export default function AuthorProductionPanel({ manuscriptId }: { manuscriptId: string }) {
  const [production, setProduction] = useState<ProductionRow | null>(null);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'view' | 'correcting' | 'approving'>('view');
  const [comments, setComments] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const load = async () => {
    try {
      const [prod, pf] = await Promise.all([getProduction(manuscriptId), getProofs(manuscriptId)]);
      setProduction(prod);
      setProofs(pf);
      if (prod?.production_status === 'PROOF_SENT_TO_AUTHOR') {
        await authorOpenProof(manuscriptId);
        const refreshed = await getProduction(manuscriptId);
        setProduction(refreshed);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [manuscriptId]);

  if (loading) return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading production status...</div>;

  const status = production?.production_status;
  const latestProof = proofs[0];
  const awaitingReview = status === 'AUTHOR_PROOF_REVIEW' || status === 'PROOF_SENT_TO_AUTHOR';

  const submitCorrections = async () => {
    if (!attachment) { setError('An attachment is required to submit Proof Corrections.'); return; }
    setBusy(true);
    setError('');
    try {
      const { storagePath, publicUrl } = await uploadCorrectionAttachment(manuscriptId, attachment);
      await authorSubmitCorrections(manuscriptId, comments, storagePath, publicUrl, attachment.name);
      setComments(''); setAttachment(null); setMode('view');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    setError('');
    try {
      await authorApproveProof(manuscriptId);
      setConfirmApprove(false); setMode('view');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
      <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Production &amp; Proofreading</h2>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> {error}</div>}

      {!production || production.production_status === 'NOT_STARTED' ? (
        <p className="text-slate-500">Your manuscript will move into production shortly after acceptance.</p>
      ) : !latestProof || status === 'IN_PRODUCTION' || status === 'COPYEDITING' || status === 'FORMATTING' || status === 'TYPESETTING' ? (
        <p className="text-slate-500">Your manuscript is currently being prepared for production (copyediting, formatting, typesetting). You'll be notified once your proof is ready for review.</p>
      ) : status === 'AUTHOR_APPROVED' || status === 'READY_FOR_PUBLICATION' ? (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> You approved Proof v{latestProof.version}. It is now with the editorial team for final publication.
        </div>
      ) : status === 'PUBLISHED' ? (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Your manuscript has been published.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[#eefcf4] border border-emerald-100 p-4 rounded-xl leading-relaxed text-[#004d2e]">
            <strong className="block text-[#004d2b] font-bold text-xs mb-1">Final Proof Available</strong>
            Your final proof is ready for review. Please carefully check the article before publication.
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
            <div>
              <p className="font-bold text-slate-800">Proof v{latestProof.version}</p>
              <p className="text-slate-400">Sent {formatDate(latestProof.sent_to_author_at)}</p>
              <p className="text-slate-500 mt-1">Please review: author names, affiliations, title, abstract, main text, tables, figures, figure captions, references, formatting, and other publication details.</p>
            </div>
            {latestProof.public_url && (
              <div className="flex items-center gap-2">
                <a href={latestProof.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View Proof</a>
                <a href={latestProof.public_url} download className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> Download Proof</a>
              </div>
            )}
          </div>

          {awaitingReview && mode === 'view' && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setMode('approving')} className="rounded-full bg-[#008751] px-4 py-2 font-bold text-white hover:bg-[#007043]">Approve Final Proof</button>
              <button onClick={() => setMode('correcting')} className="rounded-full border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Request Corrections</button>
            </div>
          )}

          {mode === 'correcting' && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="font-bold text-slate-800">Proof Corrections</p>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Correction Comments"
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[#008751]"
              />
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> {attachment ? attachment.name : 'Upload Proof Corrections (required)'}
                <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
              </label>
              <div className="flex items-center gap-2">
                <button disabled={busy || !comments.trim() || !attachment} onClick={submitCorrections} className="rounded-full bg-[#008751] px-4 py-2 font-bold text-white hover:bg-[#007043] disabled:opacity-40">Submit Corrections</button>
                <button onClick={() => { setMode('view'); setComments(''); setAttachment(null); }} className="rounded-full border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          )}

          {mode === 'approving' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <label className="flex items-start gap-2 text-amber-800">
                <input type="checkbox" checked={confirmApprove} onChange={(e) => setConfirmApprove(e.target.checked)} className="mt-0.5" />
                <span>I confirm that I have reviewed the final proof and approve it for publication.</span>
              </label>
              <div className="flex items-center gap-2">
                <button disabled={busy || !confirmApprove} onClick={approve} className="rounded-full bg-[#008751] px-4 py-2 font-bold text-white hover:bg-[#007043] disabled:opacity-40">Approve &amp; Finish</button>
                <button onClick={() => { setMode('view'); setConfirmApprove(false); }} className="rounded-full border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
