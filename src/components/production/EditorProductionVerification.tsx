import { useEffect, useState } from 'react';
import { Eye, Download, Loader2, Send, Check } from 'lucide-react';
import {
  ProductionRow, ProofRow, CorrectionRow,
  getProduction, getProofs, getCorrections, subscribeToProduction, submitEditorProductionFeedback
} from '../../lib/production';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Task 12 -- read-only Editor verification view. Shown once the
 * Coordinator has sent the Author's proof corrections over (see
 * coordinator_send_corrections_to_editor() in
 * 0061_send_corrections_to_editor.sql). Entirely separate from the
 * Editor's evaluation/decision workflow -- no writes, no shared state. */
export default function EditorProductionVerification({ manuscriptId }: { manuscriptId: string }) {
  const [production, setProduction] = useState<ProductionRow | null>(null);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [verifiedDraft, setVerifiedDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => Promise.all([getProduction(manuscriptId), getProofs(manuscriptId), getCorrections(manuscriptId)])
      .then(([p, pr, c]) => { if (!cancelled) { setProduction(p); setProofs(pr); setCorrections(c); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    load();
    const unsubscribe = subscribeToProduction(load);
    return () => { cancelled = true; unsubscribe(); };
  }, [manuscriptId]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading production status...</div>;
  }

  if (!production?.sent_to_editor_at) {
    return <p className="text-slate-500 text-sm">No proof corrections have been sent for verification yet.</p>;
  }

  const currentProof = proofs.find((p) => p.version === production.current_proof_version) || proofs[0];
  const correction = corrections.find((c) => c.id === production.sent_to_editor_correction_id) || corrections[0];

  const submitFeedback = async () => {
    if (!correction) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await submitEditorProductionFeedback(manuscriptId, correction.id, feedbackDraft, verifiedDraft);
      setCorrections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setFeedbackDraft('');
    } catch (e: any) {
      setError(e?.message || 'Failed to submit editorial feedback');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Sent by the Coordinator for verification on {formatDate(production.sent_to_editor_at)}.
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Current Proof PDF</p>
        {currentProof?.public_url ? (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">Proof v{currentProof.version}</p>
              <p className="text-xs text-slate-400">{currentProof.file_name} • Uploaded {formatDate(currentProof.uploaded_at)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a href={currentProof.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View</a>
              <a href={currentProof.public_url} download className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> Download</a>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No proof PDF available.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Author Comments</p>
        {correction ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{correction.comments || 'No comments provided.'}</p>
        ) : (
          <p className="text-sm text-slate-400">No corrections found.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Annotated PDF</p>
        {correction?.attachment_public_url ? (
          <a href={correction.attachment_public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#008751] hover:underline">
            <Download className="w-3.5 h-3.5" /> {correction.attachment_file_name || 'Annotated PDF'}
          </a>
        ) : (
          <p className="text-sm text-slate-400">No annotated PDF was uploaded.</p>
        )}
      </div>

      {/* Task 13: editorial comments + approve/verify, submitted back to the Coordinator. */}
      <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Editorial Feedback</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {correction?.editor_feedback_at ? (
          <div className="space-y-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-full ${correction.editor_verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {correction.editor_verified ? <Check className="w-3 h-3" /> : null} {correction.editor_verified ? 'Corrections Verified' : 'Not Verified'}
            </span>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{correction.editor_comments || 'No editorial comments.'}</p>
            <p className="text-[11px] text-slate-400">Submitted {formatDate(correction.editor_feedback_at)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              placeholder="Add editorial comments on the author's corrections..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#008751]"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={verifiedDraft} onChange={(e) => setVerifiedDraft(e.target.checked)} />
              Approve / verify these corrections
            </label>
            <button
              disabled={busy || !correction}
              onClick={submitFeedback}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Submit Editorial Feedback
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
