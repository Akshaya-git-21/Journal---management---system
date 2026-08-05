import { useEffect, useState } from 'react';
import { ManuscriptStatus } from '../types';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, StatusHistoryRow, SuggestedReviewerRow, ProfileRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, getStatusHistory, getSuggestedReviewers,
  listActiveProfilesByRole, getProfilesByIds, assignEditor, assignReviewers, publishDecision, markPublished,
  subscribeToManuscripts, PublishDecision
} from '../lib/workflow';
import { Loader2, ArrowLeft, Clock, CheckCircle2, Users } from 'lucide-react';

interface CoordinatorWorkspaceProps {
  manuscripts?: any[];
  onUpdateManuscript?: (manuscript: any) => void;
}

const STATUS_STYLES: Record<ManuscriptStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-200',
  EDITOR_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-purple-50 text-purple-700 border-purple-200',
  REVISION_REQUESTED: 'bg-orange-50 text-orange-700 border-orange-200',
  AWAITING_DECISION: 'bg-sky-50 text-sky-700 border-sky-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
};

const STAGE_TABS: { key: string; label: string; statuses: ManuscriptStatus[] }[] = [
  { key: 'ALL', label: 'All Stages', statuses: [] },
  { key: 'SUBMITTED', label: 'Unassigned Queue', statuses: ['SUBMITTED'] },
  { key: 'EDITOR_REVIEW', label: 'Editor Review', statuses: ['EDITOR_REVIEW'] },
  { key: 'UNDER_REVIEW', label: 'Peer Review', statuses: ['UNDER_REVIEW'] },
  { key: 'AWAITING_DECISION', label: 'Decision Pending', statuses: ['AWAITING_DECISION'] },
  { key: 'DONE', label: 'Resolved', statuses: ['ACCEPTED', 'PUBLISHED', 'REJECTED', 'REVISION_REQUESTED'] },
];

function StatusBadge({ status }: { status: ManuscriptStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function CoordinatorWorkspace(_props: CoordinatorWorkspaceProps) {
  const [items, setItems] = useState<ManuscriptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const rows = await listManuscripts();
      setItems(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  const activeTab = STAGE_TABS.find((t) => t.key === tab) || STAGE_TABS[0];
  const filtered = activeTab.statuses.length === 0 ? items : items.filter((m) => activeTab.statuses.includes(m.status));
  const selected = items.find((m) => m.id === selectedId) || null;

  return (
    <div id="coordinator-workspace" className="flex-1 min-h-0 bg-[#00170f] text-[#111827] flex flex-col font-sans">
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden min-h-0">
        <aside className="w-full md:w-60 bg-[#00170f] border-r border-[#002116] p-4 shrink-0 text-white overflow-y-auto">
          <div className="space-y-1">
            {STAGE_TABS.map((t) => {
              const count = t.statuses.length === 0 ? items.length : items.filter((m) => t.statuses.includes(m.status)).length;
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setSelectedId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                    isActive ? 'bg-[#008751] text-white font-black' : 'text-emerald-100/60 hover:bg-white/5 hover:text-white font-semibold'
                  }`}
                >
                  <span>{t.label}</span>
                  <span className={`text-[10px] font-mono px-1.5 rounded-full ${isActive ? 'bg-[#004d2e]' : 'bg-white/10'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 bg-[#00170f] md:p-3 overflow-hidden flex flex-col min-h-0">
          <main className="flex-1 bg-slate-50 md:rounded-3xl border border-[#002b1d]/20 p-6 md:p-8 overflow-y-auto text-left flex flex-col gap-5">
            {selected ? (
              <ManuscriptDetail manuscript={selected} onBack={() => setSelectedId(null)} onChanged={load} />
            ) : (
              <>
                <div>
                  <h1 className="text-2xl font-black text-slate-900">Manuscript Queue</h1>
                  <p className="text-xs text-slate-500 mt-1">Assign editors and reviewers, track progress, and publish decisions.</p>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
                ) : (
                  <QueueTable items={filtered} onOpen={setSelectedId} />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function QueueTable({ items, onOpen }: { items: ManuscriptRow[]; onOpen: (id: string) => void }) {
  if (items.length === 0) {
    return <div className="text-center py-20 text-sm text-slate-400 bg-white border border-dashed border-slate-300 rounded-2xl">No manuscripts in this stage.</div>;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
          <tr>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Author</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(m.id)}>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.id}</td>
              <td className="px-4 py-3 font-bold text-slate-800 max-w-xs truncate">{m.title}</td>
              <td className="px-4 py-3 text-slate-600 text-xs">{m.author_name}</td>
              <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
              <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(m.submitted_at)}</td>
              <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">Open &rarr;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManuscriptDetail({ manuscript, onBack, onChanged }: { manuscript: ManuscriptRow; onBack: () => void; onChanged: () => void }) {
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);
  const [editorAssignments, setEditorAssignments] = useState<EditorAssignmentRow[]>([]);
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>([]);
  const [suggested, setSuggested] = useState<SuggestedReviewerRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [h, ea, ra, sr] = await Promise.all([
      getStatusHistory(manuscript.id), getEditorAssignments(manuscript.id), getReviewerAssignments(manuscript.id), getSuggestedReviewers(manuscript.id)
    ]);
    setHistory(h);
    setEditorAssignments(ea);
    setReviewerAssignments(ra);
    setSuggested(sr);
    const ids = [manuscript.author_id, manuscript.assigned_editor_id, ...ea.map((a) => a.editor_id), ...ra.map((a) => a.reviewer_id)].filter(Boolean) as string[];
    setProfiles(await getProfilesByIds(ids));
  };

  useEffect(() => { load(); }, [manuscript.id]);

  const activeEditorAssignment = editorAssignments.find((a) => a.status === 'ACCEPTED') || editorAssignments[0];
  const editorHasRecommended = !!activeEditorAssignment?.recommendation;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to queue
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-slate-400">{manuscript.id}</p>
            <h2 className="text-lg font-black text-slate-900 mt-1">{manuscript.title}</h2>
            <p className="text-xs text-slate-500 mt-1">by {manuscript.author_name} &middot; {manuscript.author_email}</p>
          </div>
          <StatusBadge status={manuscript.status} />
        </div>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{manuscript.abstract}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {manuscript.status === 'SUBMITTED' && (
        <AssignEditorPanel
          busy={busy}
          onAssign={async (editorId) => {
            setBusy(true); setError('');
            try { await assignEditor(manuscript.id, editorId); await load(); onChanged(); }
            catch (e: any) { setError(e.message); }
            finally { setBusy(false); }
          }}
        />
      )}

      {editorAssignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Editor Assignment</h3>
          {editorAssignments.map((a) => (
            <div key={a.id} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-700">{profiles[a.editor_id]?.name || a.editor_id}</span>
                <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${a.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-700' : a.status === 'DECLINED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{a.status}</span>
              </div>
              {a.assessment_status === 'SUBMITTED' && (
                <div className="bg-slate-50 rounded-lg p-4 text-xs space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-[11px]">
                    <Score label="Scientific Merit" value={a.scientific_merit} />
                    <Score label="Novelty" value={a.novelty_innovation} />
                    <Score label="Methodology" value={a.methodology_quality} />
                    <Score label="Writing" value={a.writing_quality} />
                  </div>
                  <p><strong>Strengths:</strong> {a.strengths}</p>
                  <p><strong>Weaknesses:</strong> {a.weaknesses}</p>
                  <p><strong>Comments to Coordinator:</strong> {a.comments_to_coordinator}</p>
                </div>
              )}
              {a.recommendation && (
                <p className="text-xs mt-2"><strong>Editor recommendation:</strong> <span className="font-bold text-[#008751]">{a.recommendation.replace(/_/g, ' ')}</span></p>
              )}
            </div>
          ))}

          {suggested.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-600 mb-2">Suggested Reviewers</p>
              <ul className="space-y-1">
                {suggested.map((s) => (
                  <li key={s.id} className="text-xs text-slate-600">
                    <span className="font-bold">{s.name}</span> ({s.email}) &mdash; suggested by {s.suggested_by.toLowerCase()}{s.note ? `: ${s.note}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {manuscript.status === 'EDITOR_REVIEW' && activeEditorAssignment?.assessment_status === 'SUBMITTED' && (
        <AssignReviewersPanel
          busy={busy}
          onAssign={async (r1, r2) => {
            setBusy(true); setError('');
            try { await assignReviewers(manuscript.id, [r1, r2]); await load(); onChanged(); }
            catch (e: any) { setError(e.message); }
            finally { setBusy(false); }
          }}
        />
      )}

      {reviewerAssignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> Reviewers</h3>
          <div className="space-y-3">
            {reviewerAssignments.map((r) => (
              <div key={r.id} className="border border-slate-100 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700">{profiles[r.reviewer_id]?.name || r.reviewer_id}</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                    r.status === 'SUBMITTED' ? 'bg-emerald-50 text-emerald-700' : r.status === 'DECLINED' ? 'bg-red-50 text-red-700' : r.status === 'ACCEPTED' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                  }`}>{r.status}</span>
                </div>
                {r.status === 'SUBMITTED' && (
                  <div className="mt-2 space-y-1 text-slate-600">
                    <p><strong>Recommendation:</strong> {r.recommendation?.replace(/_/g, ' ')}</p>
                    <p><strong>To Author:</strong> {r.comments_to_author}</p>
                    <p><strong>To Editor:</strong> {r.comments_to_editor}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {manuscript.status === 'AWAITING_DECISION' && (
        <PublishDecisionPanel
          busy={busy}
          editorHasRecommended={editorHasRecommended}
          recommendation={activeEditorAssignment?.recommendation ?? null}
          onPublish={async (decision, letter) => {
            setBusy(true); setError('');
            try { await publishDecision(manuscript.id, decision, letter); await load(); onChanged(); }
            catch (e: any) { setError(e.message); }
            finally { setBusy(false); }
          }}
        />
      )}

      {manuscript.status === 'ACCEPTED' && (
        <PublishProductionPanel
          busy={busy}
          onPublish={async (doi, volume, issue) => {
            setBusy(true); setError('');
            try { await markPublished(manuscript.id, doi, volume, issue); await load(); onChanged(); }
            catch (e: any) { setError(e.message); }
            finally { setBusy(false); }
          }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Clock className="w-4 h-4" /> Timeline</h3>
        <div className="space-y-3">
          {history.map((h) => (
            <div key={h.id} className="flex items-center gap-3 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#008751] shrink-0" />
              <span className="text-slate-400 font-mono w-40 shrink-0">{new Date(h.created_at).toLocaleString()}</span>
              <span className="font-bold text-slate-700">{h.to_status.replace(/_/g, ' ')}</span>
              {h.note && <span className="text-slate-500">&mdash; {h.note}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-white rounded px-2 py-1.5 border border-slate-200">
      <p className="text-slate-400 text-[10px] uppercase">{label}</p>
      <p className="font-black text-slate-800">{value ?? '--'}/10</p>
    </div>
  );
}

function AssignEditorPanel({ busy, onAssign }: { busy: boolean; onAssign: (editorId: string) => void }) {
  const [editors, setEditors] = useState<ProfileRow[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => { listActiveProfilesByRole('EDITOR').then(setEditors); }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-black text-slate-900 mb-3">Assign an Editor</h3>
      {editors.length === 0 ? (
        <p className="text-xs text-slate-400">No active editor accounts yet.</p>
      ) : (
        <div className="flex items-center gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs">
            <option value="">-- Select Editor --</option>
            {editors.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.email})</option>)}
          </select>
          <button disabled={!selected || busy} onClick={() => onAssign(selected)} className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Assign'}
          </button>
        </div>
      )}
    </div>
  );
}

function AssignReviewersPanel({ busy, onAssign }: { busy: boolean; onAssign: (r1: string, r2: string) => void }) {
  const [reviewers, setReviewers] = useState<ProfileRow[]>([]);
  const [r1, setR1] = useState('');
  const [r2, setR2] = useState('');

  useEffect(() => { listActiveProfilesByRole('REVIEWER').then(setReviewers); }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-black text-slate-900 mb-3">Assign 2 Reviewers</h3>
      {reviewers.length < 2 ? (
        <p className="text-xs text-slate-400">Need at least 2 active reviewer accounts.</p>
      ) : (
        <div className="space-y-2">
          <select value={r1} onChange={(e) => setR1(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs">
            <option value="">-- Reviewer 1 --</option>
            {reviewers.map((r) => <option key={r.id} value={r.id} disabled={r.id === r2}>{r.name} ({r.email})</option>)}
          </select>
          <select value={r2} onChange={(e) => setR2(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs">
            <option value="">-- Reviewer 2 --</option>
            {reviewers.map((r) => <option key={r.id} value={r.id} disabled={r.id === r1}>{r.name} ({r.email})</option>)}
          </select>
          <button disabled={!r1 || !r2 || busy} onClick={() => onAssign(r1, r2)} className="w-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Assign & Send Invitations'}
          </button>
        </div>
      )}
    </div>
  );
}

function PublishDecisionPanel({ busy, editorHasRecommended, recommendation, onPublish }: {
  busy: boolean; editorHasRecommended: boolean; recommendation: string | null; onPublish: (decision: PublishDecision, letter: string) => void;
}) {
  const [decision, setDecision] = useState<PublishDecision>('ACCEPT');
  const [letter, setLetter] = useState('');

  if (!editorHasRecommended) {
    return (
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 text-xs text-sky-700 flex items-center gap-2">
        <Clock className="w-4 h-4" /> Waiting for the editor's recommendation before you can verify and publish a decision.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-black text-slate-900 mb-1">Verify & Publish Decision</h3>
      <p className="text-xs text-slate-500 mb-3">Editor recommended: <strong>{recommendation?.replace(/_/g, ' ')}</strong></p>
      <select value={decision} onChange={(e) => setDecision(e.target.value as PublishDecision)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs mb-2">
        <option value="ACCEPT">Accept</option>
        <option value="MINOR_REVISION">Minor Revision</option>
        <option value="MAJOR_REVISION">Major Revision</option>
        <option value="REJECT">Reject</option>
      </select>
      <textarea value={letter} onChange={(e) => setLetter(e.target.value)} rows={3} placeholder="Decision letter to the author" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs mb-3" />
      <button disabled={busy} onClick={() => onPublish(decision, letter)} className="flex items-center gap-1.5 bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Publish Decision to Author
      </button>
    </div>
  );
}

function PublishProductionPanel({ busy, onPublish }: { busy: boolean; onPublish: (doi: string, volume: string, issue: string) => void }) {
  const [doi, setDoi] = useState('');
  const [volume, setVolume] = useState('');
  const [issue, setIssue] = useState('');
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-black text-slate-900 mb-3">Publish to Production</h3>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <input value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="DOI" className="border border-slate-300 rounded-lg px-3 py-2 text-xs" />
        <input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="Volume" className="border border-slate-300 rounded-lg px-3 py-2 text-xs" />
        <input value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Issue" className="border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      </div>
      <button disabled={busy} onClick={() => onPublish(doi, volume, issue)} className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Publish'}
      </button>
    </div>
  );
}
