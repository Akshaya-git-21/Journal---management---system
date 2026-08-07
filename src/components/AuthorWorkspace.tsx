import React, { useEffect, useMemo, useState } from 'react';
import { Role, ManuscriptStatus } from '../types';
import {
  ManuscriptRow,
  listManuscripts,
  getManuscript,
  subscribeToManuscripts
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import NewSubmissionFlow from './NewSubmissionFlow';
import OjsSubmissionDetail from './OjsSubmissionDetail';
import ManuscriptDiscussion from './ManuscriptDiscussion';
import { Plus, FileText, Loader2, Inbox, Clock, CheckCircle, Archive, XCircle, AlertCircle, ChevronDown, Settings, Trash2 } from 'lucide-react';

interface AuthorWorkspaceProps {
  manuscripts?: any[];
  currentUser?: { name: string; email: string; role: Role; id?: string } | null;
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

const WORKFLOW_STAGES = ['SUBMITTED', 'EDITOR_REVIEW', 'UNDER_REVIEW', 'AWAITING_DECISION', 'ACCEPTED', 'PUBLISHED'];
const PROGRESS_STEPS = ['Intake', 'Evaluation', 'Revision', 'Production', 'Published'];

function formatDate(iso: string | null) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getProgressTimeline(status: ManuscriptStatus) {
  const stageIndex = WORKFLOW_STAGES.indexOf(status);
  return PROGRESS_STEPS.map((_, idx) => idx <= Math.max(0, stageIndex));
}

export default function AuthorWorkspace({ currentUser, onSignOut }: AuthorWorkspaceProps) {
  const [items, setItems] = useState<ManuscriptRow[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'new' | 'detail' | 'discussion'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({ submissions: true });

  // Load manuscripts for current user
  const load = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        setError('Not authenticated');
        return;
      }

      // Fetch manuscripts for this user
      const { data, error: queryError } = await supabase
        .from('manuscripts')
        .select('*')
        .eq('author_id', userData.user.id)
        .order('submitted_at', { ascending: false });

      if (queryError) throw queryError;
      setItems((data || []) as ManuscriptRow[]);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load manuscripts');
      console.error('Error loading manuscripts:', e);
    } finally {
      setLoading(false);
    }
  };

  // Filter manuscripts by search
  const filteredItems = items.filter((m) => {
    const query = searchTerm.toLowerCase();
    return (
      m.title.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    );
  });

  // Calculate status counts
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

  // Setup subscriptions
  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  // Load manuscript details
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

  // Delete manuscript
  const handleDelete = async (manuscriptId: string, manuscript: ManuscriptRow) => {
    // Only allow delete if editor hasn't started review
    if (['EDITOR_REVIEW', 'UNDER_REVIEW', 'AWAITING_DECISION', 'ACCEPTED', 'PUBLISHED', 'REJECTED'].includes(manuscript.status)) {
      setError('Cannot delete manuscript once editorial review has begun');
      return;
    }

    if (!confirm('Are you sure you want to delete this manuscript?')) return;

    setDeleteLoading(manuscriptId);
    try {
      const { error: deleteError } = await supabase
        .from('manuscripts')
        .delete()
        .eq('id', manuscriptId);

      if (deleteError) throw deleteError;

      setItems(items.filter(m => m.id !== manuscriptId));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to delete manuscript');
    } finally {
      setDeleteLoading(null);
    }
  };

  const selected = selectedDetail || items.find((m) => m.id === selectedId) as any || null;

  if (view === 'new') {
    return (
      <NewSubmissionFlow
        currentUser={currentUser ?? null}
        onCancel={() => { setView('list'); load(); }}
        onSubmit={() => { setView('list'); load(); }}
      />
    );
  }

  if (view === 'discussion' && selectedId) {
    return (
      <ManuscriptDiscussion
        manuscriptId={selectedId}
        onBack={() => { setView('list'); setSelectedId(null); }}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      {/* Dark Green Sidebar */}
      {view === 'list' && (
        <div className="w-full md:w-64 bg-white md:border-r border-slate-200 p-6 md:min-h-screen md:overflow-y-auto">
          {/* Profile Card */}
          <div className="bg-gradient-to-b from-[#1a4038] to-[#0f2e2a] text-white rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/30 flex items-center justify-center border border-emerald-400/50">
                <span className="text-lg">👤</span>
              </div>
              <div className="flex-1">
                <h3 className="font-black text-sm leading-tight">{currentUser?.name || 'Author'}</h3>
                <p className="text-emerald-200/80 text-xs font-bold uppercase tracking-wide">AUTHOR</p>
              </div>
            </div>
            <div className="space-y-3 border-t border-emerald-800/40 pt-3">
              <div>
                <p className="text-emerald-100/70 text-xs uppercase tracking-wider font-semibold mb-1">Active Submissions:</p>
                <p className="text-2xl font-black text-emerald-300">{items.length}</p>
              </div>
            </div>
          </div>

          {/* Menu */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest font-bold text-slate-400 px-2 mb-3">MY SUBMISSIONS</p>
            {[
              { id: 'active', label: 'Active', count: items.filter(m => !['REJECTED', 'PUBLISHED'].includes(m.status)).length, icon: '📤' },
              { id: 'review', label: 'Under Review', count: statusCounts.underReview, icon: '👀' },
              { id: 'revisions', label: 'Revisions', count: statusCounts.revisionRequested, icon: '✏️' },
              { id: 'accepted', label: 'Accepted', count: statusCounts.accepted, icon: '✅' },
              { id: 'rejected', label: 'Rejected', count: statusCounts.rejected, icon: '❌' },
              { id: 'published', label: 'Published', count: statusCounts.published, icon: '📰' },
            ].map((item) => (
              <button
                key={item.id}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all font-semibold text-xs text-slate-700 hover:bg-slate-100"
              >
                <div className="flex items-center gap-2">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.count > 0 && (
                  <span className="bg-slate-100 rounded-full px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.count}</span>
                )}
              </button>
            ))}

            <p className="text-xs uppercase tracking-widest font-bold text-slate-400 px-2 mb-3 mt-4">ACTIONS</p>
            <button
              onClick={() => setView('new')}
              className="w-full rounded-lg bg-[#008751] hover:bg-[#007043] text-white px-3 py-2.5 text-left font-semibold text-sm transition"
            >
              + New Submission
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 md:px-8 py-3 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Manuscripts</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{currentUser?.name} • {currentUser?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {view !== 'new' && (
              <button
                onClick={() => setView('new')}
                className="flex items-center gap-1.5 bg-[#008751] hover:bg-[#007043] text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> New Submission
              </button>
            )}
            <button onClick={onSignOut} className="text-sm font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 cursor-pointer">
              Log Out
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-100">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 m-6 mb-4">
              {error}
            </div>
          )}

          {view === 'detail' && selected && (
            <OjsSubmissionDetail
              paper={selected}
              onBack={() => { setView('list'); setSelectedId(null); }}
              currentUser={currentUser}
            />
          )}

          {view === 'list' && (
            <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
              {/* Stats Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                {[
                  { label: 'Submitted', count: statusCounts.submitted },
                  { label: 'Under Review', count: statusCounts.underReview },
                  { label: 'Awaiting Decision', count: statusCounts.awaitingDecision },
                  { label: 'Revisions', count: statusCounts.revisionRequested }
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-white border border-slate-200 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{item.label}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{item.count}</p>
                  </div>
                ))}
              </div>

              {/* Search & Title */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs uppercase tracking-wide font-semibold text-emerald-700 mb-2">
                      <span>/submissions/queue</span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">Active submissions</h2>
                    <p className="text-sm text-slate-600">Manage your submissions and track their progress through the editorial workflow.</p>
                  </div>
                  <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                    Filters
                  </button>
                </div>
              </div>

              {/* Search Box */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 shadow-sm">
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by manuscript ID or title..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 focus:border-[#008751] focus:outline-none"
                />
              </div>

              {/* Manuscript Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Manuscript Queue</p>
                </div>
                <div className="overflow-x-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-24 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading manuscripts...
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="text-center py-16 px-6">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-bold text-slate-600">No manuscripts found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'Try a different search term' : 'Click "New Submission" to submit your first manuscript.'}
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm min-w-[1000px]">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3">Manuscript ID</th>
                          <th className="px-6 py-3">Title</th>
                          <th className="px-6 py-3">Date Submitted</th>
                          <th className="px-6 py-3">Current Status</th>
                          <th className="px-6 py-3">Progress Timeline</th>
                          <th className="px-6 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredItems.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50 transition">
                            <td className="px-6 py-4 font-mono text-xs text-slate-500 whitespace-nowrap">{m.id}</td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-900 text-sm max-w-xs truncate">{m.title}</div>
                              <div className="mt-0.5 text-xs text-slate-500">Section: {m.section || 'Articles'}</div>
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-sm whitespace-nowrap">{formatDate(m.submitted_at)}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase ${STATUS_STYLES[m.status]}`}>
                                {m.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                {getProgressTimeline(m.status).map((completed, idx) => (
                                  <span
                                    key={idx}
                                    className={`inline-flex h-3 w-3 rounded-full transition ${
                                      completed ? 'bg-[#008751]' : 'bg-slate-300'
                                    }`}
                                    title={PROGRESS_STEPS[idx]}
                                  />
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4 space-x-2 whitespace-nowrap">
                              <button
                                onClick={() => { setSelectedId(m.id); setView('detail'); }}
                                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                              >
                                View
                              </button>
                              <button
                                onClick={() => { setSelectedId(m.id); setView('discussion'); }}
                                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                              >
                                Contact
                              </button>
                              <button
                                onClick={() => handleDelete(m.id, m)}
                                disabled={deleteLoading === m.id || ['EDITOR_REVIEW', 'UNDER_REVIEW', 'AWAITING_DECISION', 'ACCEPTED', 'PUBLISHED', 'REJECTED'].includes(m.status)}
                                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {deleteLoading === m.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
