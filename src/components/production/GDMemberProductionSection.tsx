import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, ClipboardCheck } from 'lucide-react';
import { ManuscriptRow, listManuscripts, subscribeToManuscripts } from '../../lib/workflow';
import { ProductionRow, listProduction, subscribeToProduction } from '../../lib/production';
import { getManuscriptStatusLabel, STANDARD_STATUS_COLORS } from '../../lib/manuscriptStatusLabel';

const JOURNAL_NAME = 'Journal of Molecular Sciences';

export type GDMemberProductionView = 'QUEUE' | 'FORMATTING' | 'PROOF_PREPARATION' | 'CORRECTIONS' | 'FINAL_PROOF' | 'READY' | 'PUBLISHED';

/**
 * GD Member sidebar buckets over the same production_status values the
 * Coordinator's ProductionSection/ProductionWorkspace use (see
 * lib/production.ts) -- the spec's 7-item sidebar (Task 3) is coarser than
 * the 15 raw statuses, so each nav item groups several of them:
 *  - Production Queue: EVERY manuscript assigned to this GD Member,
 *    regardless of stage (Task 5) -- the master list; the other 6 items are
 *    stage-scoped drill-downs of the same underlying rows
 *  - Formatting: copyediting/formatting work
 *  - Proof Preparation (Task 9): TYPESETTING (proof drafting hasn't started
 *    yet but the GD Member's proof-prep UI is where they'd start it) through
 *    a proof being drafted/replaced/submitted (PROOF_GENERATED,
 *    PROOF_SUBMITTED_TO_COORDINATOR) -- everything the GD Member owns before
 *    it's with the Coordinator/author
 *  - Corrections: author submitted corrections / clarification loop
 *  - Final Proof: proof is with the author for review, through approval
 *  - Ready for Publication: approved and queued to publish (production_publish()
 *    sets this and PUBLISHED in the same transaction, so this bucket is
 *    normally near-empty -- kept for completeness)
 *  - Published: done
 */
const VIEW_STATUSES: Record<GDMemberProductionView, string[] | null> = {
  QUEUE: null, // null = every status, no filter (see comment above)
  FORMATTING: ['IN_PRODUCTION', 'COPYEDITING', 'FORMATTING'],
  PROOF_PREPARATION: ['TYPESETTING', 'PROOF_GENERATED', 'PROOF_SUBMITTED_TO_COORDINATOR', 'PROOF_UPDATED'],
  CORRECTIONS: ['CORRECTIONS_SUBMITTED', 'CLARIFICATION_REQUESTED', 'PRODUCTION_REVIEW', 'CORRECTIONS_IN_PROGRESS', 'FINAL_PROOF_READY'],
  FINAL_PROOF: ['PROOF_SENT_TO_AUTHOR', 'AUTHOR_PROOF_REVIEW', 'AUTHOR_APPROVED'],
  READY: ['READY_FOR_PUBLICATION'],
  PUBLISHED: ['PUBLISHED'],
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const TITLES: Record<GDMemberProductionView, { title: string; subtitle: string }> = {
  QUEUE: { title: 'Production Queue', subtitle: 'Every manuscript assigned to you, across all production stages.' },
  FORMATTING: { title: 'Formatting', subtitle: 'Manuscripts being copyedited, formatted, and typeset.' },
  PROOF_PREPARATION: { title: 'Proof Preparation', subtitle: 'Upload the proof PDF, add notes, complete the proof checklist, and submit it to the Coordinator.' },
  CORRECTIONS: { title: 'Corrections', subtitle: 'Author-submitted proof corrections in the clarification loop.' },
  FINAL_PROOF: { title: 'Final Proof', subtitle: 'Proofs with the author for final review and approval.' },
  READY: { title: 'Ready for Publication', subtitle: 'Author-approved manuscripts queued for the Coordinator to publish.' },
  PUBLISHED: { title: 'Published', subtitle: 'Manuscripts that have completed production and been published.' },
};

/** Read-only: GD Member has SELECT access to Production data (see
 * 0050_gd_member_production_read_access.sql) but no write access -- every
 * production_* RPC still hard-checks is_active_coordinator() server-side.
 * This view intentionally has no action buttons. */
export default function GDMemberProductionSection({ view, onOpen }: { view: GDMemberProductionView; onOpen: (manuscriptId: string) => void }) {
  const [manuscripts, setManuscripts] = useState<ManuscriptRow[]>([]);
  const [production, setProduction] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [ms, prod] = await Promise.all([listManuscripts(), listProduction()]);
      setManuscripts(ms);
      setProduction(prod);
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsubA = subscribeToManuscripts(load);
    const unsubB = subscribeToProduction(load);
    return () => { unsubA(); unsubB(); };
  }, []);

  const productionByManuscript = useMemo(() => {
    const map: Record<string, ProductionRow> = {};
    production.forEach((p) => { map[p.manuscript_id] = p; });
    return map;
  }, [production]);

  const statuses = VIEW_STATUSES[view];
  const rows = useMemo(() => {
    return manuscripts
      .filter((m) => m.status === 'ACCEPTED' || m.status === 'PUBLISHED')
      .map((m) => ({ manuscript: m, production: productionByManuscript[m.id] || null }))
      .filter(({ production: p }) => !statuses || statuses.includes(p?.production_status || 'NOT_STARTED'));
  }, [manuscripts, productionByManuscript, statuses]);

  const { title, subtitle } = TITLES[view];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold flex items-center gap-2">
            <ClipboardCheck className="w-3.5 h-3.5" /> Production
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl">{subtitle}</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#007043] self-start">
          <RefreshCcw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-sm text-slate-400 bg-white border border-dashed border-slate-300 rounded-2xl">Nothing here right now.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              <tr>
                <th className="px-4 py-3">Manuscript ID</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Journal</th>
                <th className="px-4 py-3">Current Status</th>
                <th className="px-4 py-3">Assigned Date</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ manuscript: m, production: p }) => {
                const statusLabel = getManuscriptStatusLabel(m, undefined, p?.production_status ?? null);
                const statusStyle = STANDARD_STATUS_COLORS[statusLabel as keyof typeof STANDARD_STATUS_COLORS] || STANDARD_STATUS_COLORS.DRAFT;
                return (
                  <tr key={m.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(m.id)}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.id}</td>
                    <td className="px-4 py-3 font-bold text-slate-800 max-w-xs truncate">{m.title}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{m.author_name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{JOURNAL_NAME}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${statusStyle}`}>{statusLabel}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(p?.assigned_at)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(p?.updated_at || m.updated_at)}</td>
                    <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">Open Production &rarr;</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
