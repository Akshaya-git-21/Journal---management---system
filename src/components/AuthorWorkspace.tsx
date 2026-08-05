import React, { useEffect, useState } from 'react';
import { Role, ManuscriptStatus } from '../types';
import {
  ManuscriptRow, StatusHistoryRow, DiscussionRow, RevisionRow,
  listManuscripts, getStatusHistory, getDiscussions, postDiscussionMessage, getRevisions,
  createDraftManuscript, submitManuscript, submitRevision, subscribeToManuscripts
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import NewSubmissionFlow from './NewSubmissionFlow';
import { Plus, FileText, Clock, Loader2, ArrowLeft, MessageSquare, UploadCloud } from 'lucide-react';

interface AuthorWorkspaceProps {
  manuscripts?: any[];
  onSaveManuscript?: (manuscript: any) => void;
  onSubmitManuscript?: (manuscriptId: string) => void;
  onDeleteManuscript?: (manuscriptId: string) => void;
  currentUser?: { name: string; email: string; role: Role } | null;
  onSignOut?: () => void;
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

function StatusBadge({ status }: { status: ManuscriptStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AuthorWorkspace({ currentUser, onSignOut }: AuthorWorkspaceProps) {
  const [items, setItems] = useState<ManuscriptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const rows = await listManuscripts();
      setItems(rows);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  const selected = items.find((m) => m.id === selectedId) || null;

  if (view === 'new') {
    return (
      <NewSubmissionFlow
        currentUser={currentUser ?? null}
        onCancel={() => { setView('list'); load(); }}
        onSubmit={(paperObj) => {
          submitFromWizard(paperObj).catch((e: any) => setError(e.message || 'Could not submit manuscript.'));
        }}
      />
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div>
          <h1 className="text-lg font-black text-slate-900">My Manuscripts</h1>
          <p className="text-xs text-slate-500 font-semibold">{currentUser?.name} &middot; {currentUser?.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {view !== 'new' && (
            <button
              onClick={() => { setView('new'); setSelectedId(null); }}
              className="flex items-center gap-1.5 bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New Submission
            </button>
          )}
          <button onClick={onSignOut} className="text-xs font-bold text-red-600 hover:text-red-700 px-3 py-2 cursor-pointer">
            Log Out
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-8">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

        {view === 'list' && (
          <ManuscriptList
            items={items}
            loading={loading}
            onOpen={(id) => { setSelectedId(id); setView('detail'); }}
          />
        )}

        {view === 'detail' && selected && (
          <ManuscriptDetail manuscript={selected} onBack={() => setView('list')} onChanged={load} />
        )}
      </main>
    </div>
  );
}

function ManuscriptList({ items, loading, onOpen }: { items: ManuscriptRow[]; loading: boolean; onOpen: (id: string) => void }) {
  if (loading) {
    return <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>;
  }
  if (items.length === 0) {
    return (
      <div className="text-center py-24 bg-white border border-dashed border-slate-300 rounded-2xl">
        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-600">No manuscripts yet</p>
        <p className="text-xs text-slate-400 mt-1">Click "New Submission" to submit your first manuscript.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
          <tr>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(m.id)}>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.id}</td>
              <td className="px-4 py-3 font-bold text-slate-800">{m.title}</td>
              <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
              <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(m.submitted_at)}</td>
              <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">View &rarr;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Maps the submission wizard's completed-paper shape onto a real DRAFT
 * manuscript + contributors + suggested reviewers, then submits it for real. */
async function submitFromWizard(paperObj: any): Promise<void> {
  const contributors = (paperObj.contributors || []).map((c: any) => ({
    name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
    email: c.email || '',
    affiliation: c.affiliation || '',
    role: c.role || (c.isPrincipalContact ? 'Primary Author' : 'Co-Author')
  }));
  const suggestedReviewers = (paperObj.reviewerSuggestions || []).map((r: any) => ({
    name: r.name, email: r.email, note: r.reason || ''
  }));
  const id = await createDraftManuscript({
    title: paperObj.title || 'Untitled Manuscript',
    abstract: paperObj.abstract || '',
    references: '',
    isDoubleBlind: true,
    coverLetter: paperObj.coverLetter || '',
    language: paperObj.language || 'en',
    contributors,
    suggestedReviewers
  });
  await submitManuscript(id);
}

function ManuscriptDetail({ manuscript, onBack, onChanged }: { manuscript: ManuscriptRow; onBack: () => void; onChanged: () => void }) {
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionRow[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [h, d, r] = await Promise.all([getStatusHistory(manuscript.id), getDiscussions(manuscript.id), getRevisions(manuscript.id)]);
    setHistory(h);
    setDiscussions(d);
    setRevisions(r);
  };

  useEffect(() => { load(); }, [manuscript.id]);

  const pendingRevision = revisions.find((r) => r.status === 'AWAITING_AUTHOR_UPLOAD');

  const handlePost = async () => {
    if (!message.trim()) return;
    setPosting(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) await postDiscussionMessage(manuscript.id, data.user.id, message);
      setMessage('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  };

  const handleSubmitRevision = async () => {
    setSubmittingRevision(true);
    setError('');
    try {
      await submitRevision(manuscript.id);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmittingRevision(false);
    }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to manuscripts
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-slate-400">{manuscript.id}</p>
            <h2 className="text-lg font-black text-slate-900 mt-1">{manuscript.title}</h2>
          </div>
          <StatusBadge status={manuscript.status} />
        </div>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{manuscript.abstract}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {pendingRevision && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
          <h3 className="text-sm font-black text-orange-800 mb-1">Revision Requested</h3>
          <p className="text-xs text-orange-700 whitespace-pre-wrap mb-3">{pendingRevision.decision_letter}</p>
          <button
            disabled={submittingRevision}
            onClick={handleSubmitRevision}
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-60"
          >
            {submittingRevision ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />} Submit Revision
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Clock className="w-4 h-4" /> Timeline</h3>
        <div className="space-y-3">
          {history.map((h) => (
            <div key={h.id} className="flex items-center gap-3 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#008751] shrink-0" />
              <span className="text-slate-400 font-mono w-32 shrink-0">{new Date(h.created_at).toLocaleString()}</span>
              <span className="font-bold text-slate-700">{h.to_status.replace(/_/g, ' ')}</span>
              {h.note && <span className="text-slate-500">&mdash; {h.note}</span>}
            </div>
          ))}
          {history.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Discussion</h3>
        <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
          {discussions.map((d) => (
            <div key={d.id} className="text-xs bg-slate-50 rounded-lg p-3">
              <p className="text-slate-400 font-mono mb-1">{new Date(d.created_at).toLocaleString()}</p>
              <p className="text-slate-700">{d.message}</p>
            </div>
          ))}
          {discussions.length === 0 && <p className="text-xs text-slate-400">No messages yet.</p>}
        </div>
        <div className="flex gap-2">
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a message..." className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#008751]" />
          <button disabled={posting} onClick={handlePost} className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-60">Send</button>
        </div>
      </div>
    </div>
  );
}
