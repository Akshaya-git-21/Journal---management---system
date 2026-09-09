import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, History, Eye } from 'lucide-react';
import { ProofRow, ProofReviewRow, getProofs, getProofReviews, subscribeToProduction } from '../../lib/production';

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function roleLabel(role: ProofReviewRow['reviewer_role']) {
  switch (role) {
    case 'EDITOR': return 'Editor';
    case 'AUTHOR_FINAL': return 'Author (Final Review)';
    case 'AUTHOR_FIRST': return 'Author';
    case 'COORDINATOR_OVERRIDE': return 'Coordinator';
    default: return role;
  }
}

function decisionLabel(decision: ProofReviewRow['decision']) {
  switch (decision) {
    case 'APPROVED': return 'Approved';
    case 'CORRECTIONS_REQUESTED': return 'Corrections Requested';
    case 'OVERRIDE': return 'Override';
    default: return decision;
  }
}

type TimelineEntry =
  | { kind: 'upload'; at: string; proof: ProofRow }
  | { kind: 'review'; at: string; review: ProofReviewRow };

// Subtle, professional color per event type (only used when `colored` is
// passed -- existing callers keep today's plain white/gray cards).
function entryColorClasses(entry: TimelineEntry): string {
  if (entry.kind === 'upload') {
    // v1 is the first proof; any later version only exists because a
    // correction was requested and the GD Member acted on it.
    return entry.proof.version <= 1
      ? 'border-blue-200 bg-blue-50'
      : 'border-purple-200 bg-purple-50';
  }
  const r = entry.review;
  if (r.reviewer_role === 'COORDINATOR_OVERRIDE') return 'border-slate-300 bg-slate-100';
  if (r.decision === 'APPROVED') return 'border-emerald-200 bg-emerald-50';
  if (r.decision === 'CORRECTIONS_REQUESTED') return 'border-orange-200 bg-orange-50';
  return 'border-slate-200 bg-white';
}

/** Module 69, Rule 7 -- full append-only history of every proof upload and
 * every Author/Editor/Coordinator-override decision, merged into one
 * chronological list. Shared across the Coordinator's oversight views and
 * the Editor's/Author's own compact round history.
 *
 * `order` defaults to 'desc' (newest first, today's behavior everywhere).
 * `colored` (default false) applies the subtle per-event-type colors above.
 * `footer`, when given, renders after the last entry -- used by the
 * Coordinator's Decision tab to place the one currently-relevant
 * step-by-step action button directly below the most recent event, instead
 * of in a separate cluster. */
export default function ProofReviewTimeline({
  manuscriptId, variant = 'full', order = 'desc', colored = false, footer,
}: {
  manuscriptId: string;
  variant?: 'full' | 'compact';
  order?: 'asc' | 'desc';
  colored?: boolean;
  footer?: ReactNode;
}) {
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [reviews, setReviews] = useState<ProofReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => Promise.all([getProofs(manuscriptId), getProofReviews(manuscriptId)])
      .then(([pf, rv]) => { if (!cancelled) { setProofs(pf); setReviews(rv); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    load();
    const unsubscribe = subscribeToProduction(load);
    return () => { cancelled = true; unsubscribe(); };
  }, [manuscriptId]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading history...</div>;
  }

  const entries: TimelineEntry[] = [
    ...proofs.map((p): TimelineEntry => ({ kind: 'upload', at: p.uploaded_at, proof: p })),
    ...reviews.map((r): TimelineEntry => ({ kind: 'review', at: r.decided_at, review: r })),
  ].sort((a, b) => order === 'asc'
    ? new Date(a.at).getTime() - new Date(b.at).getTime()
    : new Date(b.at).getTime() - new Date(a.at).getTime());

  if (entries.length === 0) {
    return (
      <>
        <p className="text-sm text-slate-400">No proof activity yet.</p>
        {footer}
      </>
    );
  }

  return (
    <div className={variant === 'compact' ? 'space-y-2' : 'space-y-3'}>
      {variant === 'full' && (
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
          <History className="w-3.5 h-3.5" /> Full Proof &amp; Review History
        </div>
      )}
      {entries.map((entry, i) => {
        if (entry.kind === 'upload') {
          const p = entry.proof;
          return (
            <div key={`upload-${p.id}`} className={`rounded-xl border p-3 text-xs space-y-1 ${colored ? entryColorClasses(entry) : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-800">Proof v{p.version} uploaded</p>
                  <p className="text-slate-500">{p.file_name} • {formatDateTime(p.uploaded_at)}</p>
                </div>
                {p.public_url && (
                  <a href={p.public_url} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50" title="View proof">
                    <Eye className="w-3.5 h-3.5" /> View
                  </a>
                )}
              </div>
              {p.gd_notes && <p className="text-slate-600 whitespace-pre-wrap">{p.gd_notes}</p>}
            </div>
          );
        }
        const r = entry.review;
        return (
          <div key={`review-${r.id ?? i}`} className={`rounded-xl border p-3 text-xs space-y-1 ${r.superseded_at ? 'border-slate-100 bg-slate-50 opacity-70' : colored ? entryColorClasses(entry) : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-slate-800">{roleLabel(r.reviewer_role)} — {decisionLabel(r.decision)} on v{r.proof_version}</p>
              {r.superseded_at && <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">Superseded</span>}
            </div>
            {r.correction_source && <p className="text-slate-500">Requested by {r.correction_source === 'EDITOR' ? 'Editor' : 'Author'}</p>}
            {r.comments && <p className="text-slate-600 whitespace-pre-wrap">{r.comments}</p>}
            <p className="text-slate-400">{formatDateTime(r.decided_at)}</p>
          </div>
        );
      })}
      {footer}
    </div>
  );
}
