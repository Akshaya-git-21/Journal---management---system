import React, { useEffect, useMemo, useState } from 'react';
import { Role, ManuscriptStatus } from '../types';
import {
  ManuscriptRow,
  listManuscripts,
  getManuscript,
  createDraftManuscript,
  submitManuscript,
  subscribeToManuscripts
} from '../lib/workflow';
import NewSubmissionFlow from './NewSubmissionFlow';
import OjsSubmissionDetail from './OjsSubmissionDetail';
import { Plus, FileText, Loader2, Inbox, Clock, CheckCircle, Archive, XCircle, BookOpen, Globe, Settings, BarChart, AlertCircle } from 'lucide-react';

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
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredItems = items.filter((m) => {
    const query = searchTerm.toLowerCase();
    return (
      m.title.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query) ||
      m.author_name.toLowerCase().includes(query)
    );
  });

  const statusCounts = {
    submitted: items.filter((m) => m.status === 'SUBMITTED').length,
    underReview: items.filter((m) => m.status === 'UNDER_REVIEW').length,
    revisionRequested: items.filter((m) => m.status === 'REVISION_REQUESTED').length,
    awaitingDecision: items.filter((m) => m.status === 'AWAITING_DECISION').length,
    accepted: items.filter((m) => m.status === 'ACCEPTED').length,
    published: items.filter((m) => m.status === 'PUBLISHED').length,
    rejected: items.filter((m) => m.status === 'REJECTED').length,
    revisionProcessing: items.filter((m) => ['UNDER_REVIEW', 'AWAITING_DECISION', 'EDITOR_REVIEW'].includes(m.status)).length
  };

  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedId || view !== 'detail') {
      setSelectedDetail(null);
      return;
    }

    setDetailLoading(true);
    getManuscript(selectedId)
      .then((row) => {
        if (row) setSelectedDetail(row);
      })
      .catch((e: any) => setError(e.message || 'Unable to load manuscript details.'))
      .finally(() => setDetailLoading(false));
  }, [selectedId, view]);

  const selected = selectedDetail || items.find((m) => m.id === selectedId) as any || null;
  const detailPaper = useMemo(() => {
    if (!selected) return null;
    return {
      ...selected,
      author: selected.author_name || selected.authorName || currentUser?.name || 'Author',
      receivedAt: selected.submitted_at || selected.uploaded_at || selected.uploadedAt || '08 June 2026',
      fileName: selected.file_name || selected.fileName,
      fileSize: selected.file_size || selected.fileSize,
      uploadedFiles: selected.uploaded_files || selected.uploadedFiles || [],
      discussions: selected.discussions || selected.discussion_threads || [],
      reviewers: selected.reviewers || [],
      stage: selected.stage || '',
      raw: selected
    };
  }, [selected, currentUser?.name]);

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
<div className="flex items-center gap-2 flex-wrap">
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

        <div className="bg-white border-b border-slate-200 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Submission Dashboard</p>
              <h2 className="text-xl font-black text-slate-900 mt-2">Your manuscripts at a glance</h2>
            </div>
            <div className="relative w-full max-w-md">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title, ID, or author"
                className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 focus:border-[#008751] focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Submitted</p>
              <p className="mt-3 text-2xl font-black text-slate-900">{statusCounts.submitted}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Under Review</p>
              <p className="mt-3 text-2xl font-black text-slate-900">{statusCounts.underReview}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Awaiting Decision</p>
              <p className="mt-3 text-2xl font-black text-slate-900">{statusCounts.awaitingDecision}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Revisions</p>
              <p className="mt-3 text-2xl font-black text-slate-900">{statusCounts.revisionRequested}</p>
            </div>
          </div>
        </div>

      <main className={`flex-1 w-full ${view === 'detail' ? 'max-w-full px-0' : 'max-w-5xl mx-auto px-6'} py-8`}>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

        {view === 'list' && (
          <div className="grid grid-cols-12 gap-6">
            <aside className="col-span-12 xl:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">My Submissions as Author</p>
                  <h2 className="text-xl font-black text-slate-900 mt-2">Dashboard</h2>
                </div>
                <span className="inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{items.length}</span>
              </div>
              <nav className="space-y-2">
                {[
                  { label: 'Active submissions', count: items.length, icon: Inbox },
                  { label: 'Revisions requested', count: statusCounts.revisionRequested, icon: AlertCircle },
                  { label: 'Revisions submitted', count: statusCounts.awaitingDecision, icon: Archive },
                  { label: 'Incomplete submissions', count: items.filter((m) => m.status === 'DRAFT').length, icon: XCircle },
                  { label: 'Scheduled for publication', count: statusCounts.accepted, icon: Clock },
                  { label: 'Published', count: statusCounts.published, icon: CheckCircle },
                  { label: 'Declined', count: statusCounts.rejected, icon: XCircle }
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="w-full flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 transition"
                  >
                    <span className="flex items-center gap-3">
                      <item.icon className="w-4 h-4 text-emerald-600" />
                      <span>{item.label}</span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">{item.count}</span>
                  </button>
                ))}
              </nav>
              <div className="mt-6 border-t border-slate-200 pt-5 space-y-3 text-sm text-slate-600">
                <div className="font-bold text-slate-900">Quick actions</div>
                <button onClick={() => setView('new')} className="w-full rounded-2xl bg-emerald-50 px-4 py-3 text-left font-semibold text-emerald-800 hover:bg-emerald-100 transition">New submission</button>
                <button onClick={() => alert('Open issues panel placeholder')} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-700 hover:bg-slate-50 transition">Issues</button>
                <button onClick={() => alert('Open announcement panel placeholder')} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-700 hover:bg-slate-50 transition">Announcements</button>
              </div>
            </aside>

            <div className="col-span-12 xl:col-span-9 space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] uppercase tracking-[0.22em] font-bold text-emerald-800">
                    <span>/queue/submitted</span>
                  </div>
                  <h2 className="text-2xl font-black text-slate-900">Active submissions</h2>
                  <p className="text-sm text-slate-500">Manage your active tasks, review stages, and submission progress.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => alert('Open filter options')}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Filters
                  </button>
                  <button
                    onClick={() => setView('new')}
                    className="rounded-2xl bg-[#008751] px-4 py-2 text-sm font-bold text-white hover:bg-[#007043] transition"
                  >
                    + New Submission
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'SUBMITTED', count: statusCounts.submitted },
                  { label: 'UNDER REVIEW', count: statusCounts.underReview },
                  { label: 'REVISION REQUIRED', count: statusCounts.revisionRequested },
                  { label: 'REVISION PROCESSING', count: statusCounts.revisionProcessing }
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                    <p className="mt-3 text-2xl font-black text-slate-900">{item.count}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-sm font-semibold text-slate-600">Search papers, authors...</div>
                  <div className="relative w-full max-w-md">
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search papers, authors..."
                      className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 focus:border-[#008751] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50 p-4 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Manuscript queue</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-4">MANUSCRIPT ID</th>
                        <th className="px-4 py-4">TITLE</th>
                        <th className="px-4 py-4">DATE SUBMITTED</th>
                        <th className="px-4 py-4">CURRENT STATUS</th>
                        <th className="px-4 py-4">PROGRESS TIMELINE</th>
                        <th className="px-4 py-4">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-4 font-mono text-xs text-slate-500">{m.id}</td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-900">{m.title}</div>
                            <div className="mt-1 text-xs text-slate-500">By {m.author_name} • Section: Articles • Doc: {m.file_name || 'test.pdf'}</div>
                          </td>
                          <td className="px-4 py-4 text-slate-500 text-xs">{formatDate(m.submitted_at)}</td>
                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase text-emerald-700">{m.status.replace(/_/g, ' ')}</span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              {['Intake', 'Evaluation', 'Revision', 'Production', 'Published'].map((step, idx) => {
                                const activeSteps = ['SUBMITTED', 'EDITOR_REVIEW', 'UNDER_REVIEW', 'AWAITING_DECISION', 'ACCEPTED', 'PUBLISHED'].indexOf(m.status);
                                const isCompleted = idx <= Math.max(0, activeSteps);
                                return (
                                  <span key={step} className={`inline-flex h-3.5 w-3.5 rounded-full ${isCompleted ? 'bg-emerald-600' : 'bg-slate-200'}`} />
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-4 space-x-2">
                            <button
                              onClick={() => { setSelectedId(m.id); setView('detail'); }}
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                            >
                              View
                            </button>
                            <button className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition">
                              Contact
                            </button>
                            <button className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition">
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'detail' && detailPaper && (
          <OjsSubmissionDetail
            paper={detailPaper}
            onBack={() => { setView('list'); setSelectedId(null); }}
            currentUser={currentUser}
          />
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


