import React, { useEffect, useMemo, useState } from 'react';
import { Role, ManuscriptStatus, Manuscript } from '../types';
import {
  ManuscriptRow,
  listManuscripts,
  getManuscript,
  subscribeToManuscripts,
  getManuscriptFiles,
  submitManuscript
} from '../lib/workflow';
import { supabase, upsertManuscriptToDb, ensureAuthorProfile } from '../lib/supabase';
import { getManuscriptStatusLabel } from '../lib/manuscriptStatusLabel';
import NewSubmissionFlow from './NewSubmissionFlow';
import OjsSubmissionDetail from './OjsSubmissionDetail';
import ManuscriptDiscussion from './ManuscriptDiscussion';
import AuthorRevisionRequest from './AuthorRevisionRequest';
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
  const [view, setView] = useState<'list' | 'new' | 'detail' | 'discussion' | 'revision'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({ submissions: true });
  const [statusFilter, setStatusFilter] = useState<'active' | 'review' | 'revisions' | 'accepted' | 'rejected' | 'published'>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Load manuscripts for current user
  const load = async () => {
    try {
      console.log('[LOAD] Starting to fetch manuscripts...');
      const { data: userData } = await supabase.auth.getUser();
      console.log('[LOAD] Current user ID:', userData.user?.id);

      if (!userData.user?.id) {
        setError('Not authenticated');
        console.log('[LOAD] ERROR: Not authenticated');
        return;
      }

      // Fetch manuscripts for this user
      console.log('[LOAD] Querying manuscripts table where author_id =', userData.user.id);
      const { data, error: queryError } = await supabase
        .from('manuscripts')
        .select('*')
        .eq('author_id', userData.user.id)
        .order('submitted_at', { ascending: false });

      console.log('[LOAD] Query result - error:', queryError, 'data count:', data?.length);
      if (queryError) throw queryError;

      console.log('[LOAD] Fetched manuscripts:', data?.map((m: any) => ({ id: m.id, title: m.title, author_id: m.author_id, submitted_at: m.submitted_at })));

      // Fetch files for each manuscript
      const manuscriptsWithFiles = await Promise.all(
        (data || []).map(async (manuscript) => {
          const files = await getManuscriptFiles(manuscript.id);
          return { ...manuscript, files };
        })
      );

      console.log('[LOAD] Setting items with', manuscriptsWithFiles.length, 'manuscripts');
      setItems((manuscriptsWithFiles || []) as ManuscriptRow[]);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load manuscripts');
      console.error('[LOAD] Error loading manuscripts:', e);
    } finally {
      setLoading(false);
    }
  };

  // Filter manuscripts by sidebar category, then by search
  const STATUS_FILTER_PREDICATES: Record<typeof statusFilter, (m: ManuscriptRow) => boolean> = {
    active: (m) => !['REJECTED', 'PUBLISHED'].includes(m.status),
    review: (m) => m.status === 'UNDER_REVIEW',
    revisions: (m) => m.status === 'REVISION_REQUESTED',
    accepted: (m) => m.status === 'ACCEPTED',
    rejected: (m) => m.status === 'REJECTED',
    published: (m) => m.status === 'PUBLISHED',
  };

  const filteredItems = items.filter((m) => {
    if (!STATUS_FILTER_PREDICATES[statusFilter](m)) return false;
    const query = searchTerm.toLowerCase();
    return (
      m.title.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    );
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  // Reset to page 1 when search/filter changes
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

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

  // Handle manuscript submission from NewSubmissionFlow
  const handleNewSubmission = async (paperDetails: any) => {
    try {
      console.log('[SUBMIT] Starting new manuscript submission...');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        console.log('[SUBMIT] ERROR: User not authenticated');
        return;
      }

      console.log('[SUBMIT] Current authenticated user ID:', user.id);

      // Ensure author profile exists (SECURITY DEFINER RPC bypasses RLS)
      console.log('[SUBMIT] Ensuring author profile exists...');
      await ensureAuthorProfile();
      console.log('[SUBMIT] Author profile ready');

      // Use manuscript ID from paperDetails (generated in NewSubmissionFlow)
      // This ensures consistency across the entire flow
      const manuscriptId = paperDetails.id;
      if (!manuscriptId) {
        throw new Error('Manuscript ID not provided from submission');
      }
      console.log('[SUBMIT] Using manuscript ID:', manuscriptId);

      // Create Manuscript object from submission data
      const newManuscript: Manuscript = {
        id: manuscriptId,
        title: paperDetails.title || 'Untitled Manuscript',
        abstract: paperDetails.abstract || '',
        references: '',
        isDoubleBlind: paperDetails.isDoubleBlind || false,
        coverLetter: paperDetails.coverLetter || '',
        fileName: paperDetails.fileName || null,
        fileSize: paperDetails.fileSize || null,
        uploadedAt: new Date().toISOString(),
        storagePath: paperDetails.storagePath || null,
        publicUrl: paperDetails.publicUrl || null,
        uploadedFiles: paperDetails.additionalFiles || [],
        contributors: paperDetails.contributors || [],
        status: 'SUBMITTED' as ManuscriptStatus,
        submittedAt: new Date().toISOString(),
        reviewers: [],
        suggestedReviewers: paperDetails.reviewerSuggestions || [],
        discussions: [],
        doi: null,
        volume: null,
        issue: null,
        publishedAt: null,
        authorId: user.id,
        authorName: currentUser?.name || 'Unknown Author',
        authorEmail: currentUser?.email || user.email || '',
        submissionStep: 9,
        editorsNotes: '',
        language: paperDetails.language || 'English'
      };

      console.log('[SUBMIT] Manuscript object created:', { id: newManuscript.id, title: newManuscript.title, authorId: newManuscript.authorId, submittedAt: newManuscript.submittedAt });

      // Create the manuscript as a DRAFT first, then transition it through
      // the real submit_manuscript() RPC below -- this is the same
      // server-enforced state machine every other workflow step goes
      // through (writes manuscript_status_history, notifies Coordinators),
      // instead of a direct insert with status='SUBMITTED' that silently
      // skipped both. A manuscript ID is generated exactly once by
      // NewSubmissionFlow's triggerSubmitFinal(), which is itself guarded
      // against double-invocation (hasSubmitted/isSubmitting), so this insert
      // + RPC pair runs at most once per real submission.
      console.log('[SUBMIT] Inserting manuscript record as DRAFT...');
      const { error: insertError } = await supabase
        .from('manuscripts')
        .insert([{
          id: newManuscript.id,
          title: newManuscript.title,
          abstract: newManuscript.abstract,
          references: newManuscript.references,
          is_double_blind: newManuscript.isDoubleBlind,
          cover_letter: newManuscript.coverLetter,
          status: 'DRAFT',
          author_id: user.id,
          author_name: newManuscript.authorName,
          author_email: newManuscript.authorEmail,
          language: newManuscript.language
        }]);

      if (insertError) {
        throw new Error(`Failed to insert manuscript: ${insertError.message}`);
      }

      console.log('[SUBMIT] Manuscript record inserted successfully as DRAFT');

      // Persist contributors (co-authors) -- previously captured in the
      // wizard but never written to manuscript_contributors.
      if (paperDetails.contributors && paperDetails.contributors.length > 0) {
        const { error: contributorsError } = await supabase.from('manuscript_contributors').insert(
          paperDetails.contributors.map((c: any, i: number) => ({
            manuscript_id: manuscriptId,
            name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '',
            email: c.email || '',
            affiliation: c.affiliation || '',
            contributor_role: c.role || (c.isPrincipalContact ? 'Primary Author' : 'Co-Author'),
            position: i
          }))
        );
        if (contributorsError) {
          throw new Error(`Failed to save contributors: ${contributorsError.message}`);
        }
      }

      // Persist author-suggested reviewers -- same table the Editor's later
      // suggestions land in, discriminated by suggested_by='AUTHOR'.
      if (paperDetails.reviewerSuggestions && paperDetails.reviewerSuggestions.length > 0) {
        const { error: reviewersError } = await supabase.from('manuscript_suggested_reviewers').insert(
          paperDetails.reviewerSuggestions.map((r: any) => ({
            manuscript_id: manuscriptId,
            suggested_by: 'AUTHOR' as const,
            suggested_by_user: user.id,
            name: r.name || '',
            email: r.email || '',
            note: r.reason || r.note || ''
          }))
        );
        if (reviewersError) {
          throw new Error(`Failed to save suggested reviewers: ${reviewersError.message}`);
        }
      }

      // Now sync uploaded files to manuscript_files table via server-side RPC
      if (paperDetails.uploadedFiles && paperDetails.uploadedFiles.length > 0) {
        console.log('[SUBMIT] Syncing files to manuscript_files table:', paperDetails.uploadedFiles);

        // Transform files to match the RPC parameter format
        const filesForSync = paperDetails.uploadedFiles.map((file: any) => {
          console.log('[SUBMIT] Transforming file:', {
            fileName: file.fileName,
            componentType: file.componentType,
            storagePath: file.storagePath,
            publicUrl: file.publicUrl
          });
          return {
            file_name: file.fileName,
            file_type: file.componentType,
            file_size: file.fileSize,
            storage_path: file.storagePath,
            public_url: file.publicUrl
          };
        });

        console.log('[SUBMIT] Transformed files for sync:', filesForSync);

        try {
          const { data: syncResult, error: syncError } = await supabase.rpc(
            'sync_manuscript_files',
            {
              p_manuscript_id: manuscriptId,
              p_files: filesForSync
            }
          );

          if (syncError) {
            console.error('[SUBMIT] File sync RPC error:', syncError.message, syncError);
            throw new Error(`File sync failed: ${syncError.message}`);
          } else {
            console.log('[SUBMIT] Files synced successfully:', syncResult);
          }
        } catch (fileError) {
          console.error('[SUBMIT] Failed to sync files:', fileError);
          throw fileError;
        }
      } else {
        console.warn('[SUBMIT] No files to sync. uploadedFiles:', paperDetails.uploadedFiles);
      }

      // Transition DRAFT -> SUBMITTED through the real workflow RPC. This is
      // the single point where the manuscript actually becomes visible to
      // Coordinators (submit_manuscript() writes manuscript_status_history
      // and notifies every ACTIVE Coordinator) -- everything above this line
      // only populated a DRAFT row the author already owns exclusively.
      console.log('[SUBMIT] Calling submit_manuscript RPC to finalize submission...');
      await submitManuscript(manuscriptId);
      console.log('[SUBMIT] Manuscript submitted (DRAFT -> SUBMITTED)');

      // Refresh the list to show the new manuscript
      console.log('[SUBMIT] Calling load() to refresh manuscript list...');
      await load();
      console.log('[SUBMIT] Manuscript list refreshed, setting view to list');
      setView('list');
      console.log('[SUBMIT] Submission complete!');
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to submit manuscript';
      setError(errorMsg);
      console.error('[SUBMIT] Submission error:', errorMsg, err);
    }
  };

  if (view === 'new') {
    return (
      <NewSubmissionFlow
        currentUser={currentUser ?? null}
        onCancel={() => { setView('list'); load(); }}
        onSubmit={handleNewSubmission}
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

  if (view === 'revision' && selectedId) {
    return (
      <div className="w-full min-h-screen bg-slate-100 p-6 md:p-8">
        <div className="max-w-3xl mx-auto space-y-5">
          <button
            onClick={() => { setView('list'); setSelectedId(null); load(); }}
            className="text-xs font-bold text-slate-500 hover:text-slate-700"
          >
            &larr; Back to My Manuscripts
          </button>
          <AuthorRevisionRequest
            manuscriptId={selectedId}
            onRevisionSubmitted={() => { load(); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      {/* Dark Green Sidebar */}
      {view === 'list' && (
        <div className="w-full md:w-64 bg-[#00170f] md:border-r border-[#002116] p-4 md:min-h-screen md:sticky md:top-0 md:max-h-screen md:overflow-y-auto shrink-0">
          {/* Profile Card */}
          <div className="rounded-3xl border border-[#00311f] bg-[#001d14] p-5 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#008751]/15 border border-[#008751]/30 flex items-center justify-center">
                <span className="text-lg">👤</span>
              </div>
              <div className="flex-1">
                <h3 className="font-black text-sm leading-tight text-white">{currentUser?.name || 'Author'}</h3>
                <p className="text-emerald-300 text-xs font-bold uppercase tracking-wide">AUTHOR</p>
              </div>
            </div>
            <div className="space-y-3 border-t border-white/10 pt-3">
              <div>
                <p className="text-emerald-100/60 text-[11px] uppercase tracking-wider font-semibold mb-1">Active Submissions:</p>
                <p className="text-2xl font-black text-emerald-300">{items.length}</p>
              </div>
            </div>
          </div>

          {/* Menu */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.24em] font-bold text-emerald-300/60 px-2 mb-3">My Submissions</p>
            {([
              { id: 'active', label: 'Active', count: items.filter(m => !['REJECTED', 'PUBLISHED'].includes(m.status)).length, icon: '📤' },
              { id: 'review', label: 'Under Review', count: statusCounts.underReview, icon: '👀' },
              { id: 'revisions', label: 'Revisions', count: statusCounts.revisionRequested, icon: '✏️' },
              { id: 'accepted', label: 'Accepted', count: statusCounts.accepted, icon: '✅' },
              { id: 'rejected', label: 'Rejected', count: statusCounts.rejected, icon: '❌' },
              { id: 'published', label: 'Published', count: statusCounts.published, icon: '📰' },
            ] as const).map((item) => (
              <button
                key={item.id}
                onClick={() => { setStatusFilter(item.id); setView('list'); }}
                className={`group w-full flex items-center justify-between px-4 py-3 rounded-2xl transition text-sm ${
                  statusFilter === item.id
                    ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                    : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.count > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusFilter === item.id ? 'bg-white/20 text-white' : 'bg-white/10 text-emerald-200'}`}>{item.count}</span>
                )}
              </button>
            ))}

            <p className="text-[11px] uppercase tracking-[0.24em] font-bold text-emerald-300/60 px-2 mb-3 mt-4">Actions</p>
            <button
              type="button"
              onClick={() => setView('new')}
              className="w-full rounded-2xl bg-[#008751] hover:bg-[#007043] text-white px-4 py-3 text-left font-black text-sm transition cursor-pointer"
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
                    <h2 className="text-lg font-semibold text-slate-900">
                      {{ active: 'Active submissions', review: 'Under review', revisions: 'Revisions requested', accepted: 'Accepted submissions', rejected: 'Rejected submissions', published: 'Published submissions' }[statusFilter]}
                    </h2>
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
                          <th className="px-6 py-3">Files</th>
                          <th className="px-6 py-3">Progress Timeline</th>
                          <th className="px-6 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedItems.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50 transition">
                            <td className="px-6 py-4 font-mono text-xs text-slate-500 whitespace-nowrap">{m.id}</td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-900 text-sm max-w-xs truncate">{m.title}</div>
                              <div className="mt-0.5 text-xs text-slate-500">Section: {m.section || 'Articles'}</div>
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-sm whitespace-nowrap">{formatDate(m.submitted_at)}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase ${STATUS_STYLES[m.status]}`}>
                                {getManuscriptStatusLabel(m.status)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                {m.files && m.files.length > 0 ? (
                                  <div className="flex items-center gap-1.5">
                                    <FileText className="w-4 h-4 text-emerald-600" />
                                    <span className="text-xs">{m.files.length} file{m.files.length !== 1 ? 's' : ''}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">No files</span>
                                )}
                              </div>
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
                              {m.status === 'REVISION_REQUESTED' && (
                                <button
                                  onClick={() => { setSelectedId(m.id); setView('revision'); }}
                                  className="rounded border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-100 transition"
                                >
                                  Submit Revision
                                </button>
                              )}
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

                {/* Pagination Controls */}
                {filteredItems.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
                    <div className="text-xs text-slate-600 font-medium">
                      Showing {startIndex + 1} to {Math.min(endIndex, filteredItems.length)} of {filteredItems.length} manuscripts
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ← Previous
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`w-8 h-8 rounded text-xs font-semibold transition ${
                              currentPage === page
                                ? 'bg-[#008751] text-white'
                                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
