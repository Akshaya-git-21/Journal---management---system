import { useEffect, useState } from 'react';
import { Eye, Download, Loader2, Send, Check, History } from 'lucide-react';
import {
  ProductionRow, ProofRow, CorrectionRow, ProofReviewRow,
  getProduction, getProofs, getCorrections, getProofReviews, subscribeToProduction, editorReviewProof
} from '../../lib/production';
import { ProfileRow, getProfilesByIds } from '../../lib/workflow';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Module 69 -- Editor's decision on the proof/correction loop. Always
 * exactly two actions (Approve/Publish, Corrections Required) whenever
 * production_status = 'PROOF_SENT_TO_EDITOR' -- that status IS the gate, so
 * a fresh correction round always re-arms this form (no more "permanently
 * read-only once feedback was given" bug, since there's no per-row flag
 * being checked any more, just the current status). See editor_review_proof()
 * in 0069_editor_final_approval_workflow.sql. */
export default function EditorProductionVerification({ manuscriptId }: { manuscriptId: string }) {
  const [production, setProduction] = useState<ProductionRow | null>(null);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [reviews, setReviews] = useState<ProofReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [mode, setMode] = useState<'idle' | 'correcting'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [gdMemberProfile, setGdMemberProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => Promise.all([getProduction(manuscriptId), getProofs(manuscriptId), getCorrections(manuscriptId), getProofReviews(manuscriptId)])
      .then(([p, pr, c, rv]) => {
        if (cancelled) return;
        setProduction(p); setProofs(pr); setCorrections(c); setReviews(rv);
        if (p?.assigned_to) {
          getProfilesByIds([p.assigned_to]).then((map) => { if (!cancelled) setGdMemberProfile(map[p.assigned_to as string] || null); }).catch(() => {});
        } else {
          setGdMemberProfile(null);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    load();
    // A fresh round resets the draft/mode so a stale comment from a prior
    // round never carries over into the new one.
    setFeedbackDraft('');
    setMode('idle');
    const unsubscribe = subscribeToProduction(load);
    return () => { cancelled = true; unsubscribe(); };
  }, [manuscriptId]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading production status...</div>;
  }

  const awaitingReview = production?.production_status === 'PROOF_SENT_TO_EDITOR';
  const awaitingSendToGD = production?.production_status === 'EDITOR_CORRECTIONS_PENDING_SEND';
  const sortedProofs = [...proofs].sort((a, b) => b.version - a.version);
  const sortedCorrections = [...corrections].sort((a, b) => b.proof_version - a.proof_version || new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  const submitFeedback = async (decision: 'APPROVE' | 'CORRECTIONS_REQUIRED') => {
    setBusy(true);
    setError(null);
    try {
      await editorReviewProof(manuscriptId, decision, feedbackDraft);
      setFeedbackDraft('');
      setMode('idle');
    } catch (e: any) {
      setError(e?.message || 'Failed to submit editorial feedback');
    } finally {
      setBusy(false);
    }
  };

  if (!production || (!awaitingReview && !awaitingSendToGD && reviews.length === 0)) {
    return <p className="text-slate-500 text-sm">No proof corrections have been sent for verification yet.</p>;
  }

  return (
    <div className="space-y-4">
      {awaitingReview ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Proof v{production.current_proof_version} is ready for your review.
        </div>
      ) : awaitingSendToGD ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Your corrections on Proof v{production.current_proof_version} are recorded -- send them to {gdMemberProfile?.name || 'the GD Member'} to action.
        </div>
      ) : production.production_status === 'EDITOR_APPROVED' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 shrink-0" /> Approved -- Proof v{production.current_proof_version} awaiting Coordinator to send for Author final review.
        </div>
      ) : production.pending_review_role === 'AUTHOR_FINAL' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 shrink-0" /> Approved -- Proof v{production.current_proof_version} is with the Author for final review.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Nothing is currently awaiting your review. {production.pending_review_role === 'AUTHOR_FIRST' ? 'The Author is reviewing the current proof.' : 'The GD Member is preparing a new version.'}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Proof Versions</p>
        {sortedProofs.length === 0 ? (
          <p className="text-sm text-slate-400">No proof PDF available.</p>
        ) : (
          <div className="space-y-2">
            {sortedProofs.map((p) => {
              const isCurrent = p.version === production?.current_proof_version;
              // Subtle color grading: v1 (blue) is the original proof, v2+
              // (purple) only exists because a correction round produced it
              // -- matches the same convention used in the Coordinator's
              // Proof & Review Status timeline. The current version's
              // emerald highlight always takes priority.
              const cardClasses = isCurrent
                ? 'border-[#008751] bg-emerald-50'
                : p.version <= 1
                ? 'border-blue-200 bg-blue-50'
                : 'border-purple-200 bg-purple-50';
              return (
                <div key={p.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${cardClasses}`}>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Proof v{p.version} {isCurrent && <span className="ml-1 text-[10px] font-bold uppercase text-emerald-700">Current</span>}</p>
                    <p className="text-xs text-slate-400">{p.file_name} • Uploaded {formatDate(p.uploaded_at)}</p>
                  </div>
                  {p.public_url && (
                    <div className="flex items-center gap-2 shrink-0">
                      <a href={p.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View</a>
                      <a href={p.public_url} download className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> Download</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Author Corrections</p>
        {sortedCorrections.length === 0 ? (
          <p className="text-sm text-slate-400">No corrections submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedCorrections.map((c) => (
              <div key={c.id} className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800">v{c.proof_version}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${c.correction_source === 'EDITOR' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                      {c.correction_source === 'EDITOR' ? 'Editor' : 'Author'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">{formatDate(c.submitted_at)}</span>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap">{c.comments || 'No comments provided.'}</p>
                {c.attachment_public_url && (
                  <a href={c.attachment_public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#008751] hover:underline">
                    <Download className="w-3.5 h-3.5" /> {c.attachment_file_name || 'Annotated PDF'}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {awaitingReview && (
        <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Editorial Decision</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {mode === 'correcting' ? (
            <div className="space-y-3">
              <textarea
                value={feedbackDraft}
                onChange={(e) => setFeedbackDraft(e.target.value)}
                placeholder="Add editorial comments on the corrections needed..."
                rows={3}
                autoFocus
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#008751]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={busy || !feedbackDraft.trim()}
                  onClick={() => submitFeedback('CORRECTIONS_REQUIRED')}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Submit
                </button>
                <button
                  disabled={busy}
                  onClick={() => { setMode('idle'); setFeedbackDraft(''); }}
                  className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={busy}
                onClick={() => submitFeedback('APPROVE')}
                className="inline-flex items-center gap-1 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40"
                title="Sends this proof to the Author for Final Review -- does not publish it directly."
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve / Publish
              </button>
              <button
                disabled={busy}
                onClick={() => setMode('correcting')}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Corrections Required
              </button>
            </div>
          )}
          <p className="text-[11px] text-slate-400">"Approve / Publish" sends this proof to the Author for final review -- it does not publish the article directly.</p>
        </div>
      )}

      {awaitingSendToGD && (
        <div className="rounded-2xl border border-slate-200 p-4 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Sent for Correction</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 p-4">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600"
        >
          <History className="w-3.5 h-3.5" /> Review History ({reviews.length})
        </button>
        {showHistory && (
          <div className="mt-3 space-y-2">
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-400">No decisions recorded yet.</p>
            ) : reviews.map((r) => (
              <div key={r.id} className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700">
                    {r.reviewer_role === 'EDITOR' ? 'Editor' : r.reviewer_role === 'AUTHOR_FINAL' ? 'Author (Final Review)' : r.reviewer_role === 'AUTHOR_FIRST' ? 'Author' : 'Coordinator'} — {r.decision === 'CORRECTIONS_REQUESTED' ? 'Corrections Requested' : r.decision === 'APPROVED' ? 'Approved' : 'Override'} on v{r.proof_version}
                  </span>
                  {r.superseded_at && <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">Superseded</span>}
                </div>
                {r.comments && <p className="text-slate-600 whitespace-pre-wrap">{r.comments}</p>}
                <p className="text-slate-400">{formatDate(r.decided_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
