import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, ClipboardCheck } from 'lucide-react';
import { ManuscriptRow, ProfileRow, listManuscripts, getProfilesByIds, subscribeToManuscripts } from '../../lib/workflow';
import { ProductionRow, listProduction, subscribeToProduction } from '../../lib/production';
import ProductionWorkspace from './ProductionWorkspace';

export type ProductionView = 'QUEUE' | 'IN_PRODUCTION' | 'PROOFS' | 'CORRECTIONS' | 'READY';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysSince(iso: string | null | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)));
}

const IN_PRODUCTION_STATUSES = ['IN_PRODUCTION', 'COPYEDITING', 'FORMATTING', 'TYPESETTING', 'PROOF_GENERATED', 'PROOF_SUBMITTED_TO_COORDINATOR', 'PROOF_UPDATED'];
const PROOFS_STATUSES = ['PROOF_SENT_TO_AUTHOR', 'AUTHOR_PROOF_REVIEW'];
const CORRECTIONS_STATUSES = ['CORRECTIONS_SUBMITTED', 'CLARIFICATION_REQUESTED', 'PRODUCTION_REVIEW', 'CORRECTIONS_IN_PROGRESS', 'FINAL_PROOF_READY'];

const STAGE_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started', IN_PRODUCTION: 'Accepted', COPYEDITING: 'Copyediting',
  FORMATTING: 'Formatting', TYPESETTING: 'Typesetting', PROOF_GENERATED: 'Proof Generated',
  PROOF_SUBMITTED_TO_COORDINATOR: 'Proof Submitted to Coordinator',
  PROOF_UPDATED: 'Proof Updated', PROOF_SENT_TO_AUTHOR: 'Proof Sent to Author',
  AUTHOR_PROOF_REVIEW: 'Author Proofreading', CORRECTIONS_SUBMITTED: 'Corrections Submitted',
  CLARIFICATION_REQUESTED: 'Clarification Requested', PRODUCTION_REVIEW: 'Production Review',
  AUTHOR_APPROVED: 'Author Approved', READY_FOR_PUBLICATION: 'Ready for Publication', PUBLISHED: 'Published',
  CORRECTIONS_IN_PROGRESS: 'Corrections In Progress', FINAL_PROOF_READY: 'Final Proof Ready',
};

function StageBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-sky-200 bg-sky-50 text-sky-700 text-[10px] font-bold uppercase tracking-wide">
      {STAGE_LABELS[status] || status.replace(/_/g, ' ')}
    </span>
  );
}

export default function ProductionSection({ view }: { view: ProductionView }) {
  const [manuscripts, setManuscripts] = useState<ManuscriptRow[]>([]);
  const [production, setProduction] = useState<ProductionRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [ms, prod] = await Promise.all([listManuscripts(), listProduction()]);
      setManuscripts(ms);
      setProduction(prod);
      const editorIds = ms.map((m) => m.assigned_editor_id).filter((v): v is string => !!v);
      const assignedIds = prod.map((p) => p.assigned_to).filter((v): v is string => !!v);
      const profileMap = await getProfilesByIds([...editorIds, ...assignedIds]);
      setProfiles(profileMap);
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

  const rows = useMemo(() => {
    return manuscripts
      .filter((m) => m.status === 'ACCEPTED')
      .map((m) => ({ manuscript: m, production: productionByManuscript[m.id] || null }))
      .filter(({ production: p }) => {
        if (view === 'QUEUE') return !p || p.production_status === 'NOT_STARTED';
        if (view === 'IN_PRODUCTION') return !!p && IN_PRODUCTION_STATUSES.includes(p.production_status);
        if (view === 'PROOFS') return !!p && PROOFS_STATUSES.includes(p.production_status);
        if (view === 'CORRECTIONS') return !!p && CORRECTIONS_STATUSES.includes(p.production_status);
        if (view === 'READY') return !!p && p.production_status === 'AUTHOR_APPROVED';
        return false;
      });
  }, [manuscripts, productionByManuscript, view]);

  if (selectedId) {
    return <ProductionWorkspace manuscriptId={selectedId} onBack={() => setSelectedId(null)} onChanged={load} />;
  }

  const titles: Record<ProductionView, { title: string; subtitle: string }> = {
    QUEUE: { title: 'Production Queue', subtitle: 'Manuscripts accepted by the Coordinator, not yet started in production.' },
    IN_PRODUCTION: { title: 'In Production', subtitle: 'Manuscripts being copyedited, formatted, typeset, and proofed.' },
    PROOFS: { title: 'Proofs Awaiting Author', subtitle: 'Proofs sent to authors, awaiting their review.' },
    CORRECTIONS: { title: 'Corrections', subtitle: 'Author-submitted proof corrections awaiting production review.' },
    READY: { title: 'Ready for Publication', subtitle: 'Author-approved manuscripts ready for the Coordinator to publish.' },
  };
  const { title, subtitle } = titles[view];

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
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Author</th>
                {view === 'QUEUE' && <><th className="px-4 py-3">Accepted Date</th><th className="px-4 py-3">Editor</th></>}
                {view !== 'QUEUE' && <th className="px-4 py-3">Proof Version</th>}
                {view === 'IN_PRODUCTION' && <><th className="px-4 py-3">Last Updated</th><th className="px-4 py-3">Assigned</th></>}
                {view === 'PROOFS' && <th className="px-4 py-3">Days Awaiting Author</th>}
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ manuscript: m, production: p }) => (
                <tr key={m.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(m.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.id}</td>
                  <td className="px-4 py-3 font-bold text-slate-800 max-w-xs truncate">{m.title}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{m.author_name}</td>
                  {view === 'QUEUE' && (
                    <>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(m.updated_at)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{profiles[m.assigned_editor_id || '']?.name || '--'}</td>
                    </>
                  )}
                  {view !== 'QUEUE' && <td className="px-4 py-3 text-slate-500 text-xs">v{p?.current_proof_version ?? 0}</td>}
                  {view === 'IN_PRODUCTION' && (
                    <>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(p?.updated_at)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{profiles[p?.assigned_to || '']?.name || '--'}</td>
                    </>
                  )}
                  {view === 'PROOFS' && <td className="px-4 py-3 text-slate-500 text-xs">{daysSince(p?.updated_at)}</td>}
                  <td className="px-4 py-3">{p ? <StageBadge status={p.production_status} /> : <StageBadge status="NOT_STARTED" />}</td>
                  <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">Open Production &rarr;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
