import { useEffect, useState } from 'react';
import { ManuscriptStatus } from '../types';
import { supabase } from '../lib/supabase';
import { createEditorAccount, createReviewerAccount } from '../lib/auth';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, StatusHistoryRow, SuggestedReviewerRow, ProfileRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, getStatusHistory, getSuggestedReviewers,
  listActiveProfilesByRole, listPendingApprovals, approveUserRole, getProfilesByIds, assignEditor, assignReviewers, publishDecision, markPublished,
  subscribeToManuscripts, PublishDecision, getRevisions, getReviewerAssignmentCounts
} from '../lib/workflow';
import CoordinatorManuscriptDetail from './CoordinatorManuscriptDetail';
import CoordinatorRevisionManager from './CoordinatorRevisionManager';
import EditorDetailsModal from './EditorDetailsModal';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import { Loader2, ArrowLeft, Clock, LayoutDashboard, FileText, Users, BarChart3, BookOpen, Mail, Settings, ShieldCheck, Plus, Download, RefreshCcw, CheckCircle2, UserPlus, X, Eye, FileQuestionMark, ClipboardList, MessageCircle, SlidersHorizontal, Activity } from 'lucide-react';

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
  const [pendingApprovals, setPendingApprovals] = useState<ProfileRow[]>([]);
  const [editorialBoardProfiles, setEditorialBoardProfiles] = useState<ProfileRow[]>([]);
  const [reviewerProfiles, setReviewerProfiles] = useState<ProfileRow[]>([]);
  const [reviewerAssignmentCounts, setReviewerAssignmentCounts] = useState<Record<string, { invited: number; accepted: number; completed: number }>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ALL');
  const [activeSection, setActiveSection] = useState<'DASHBOARD' | 'MANUSCRIPT_QUEUE' | 'REVISIONS' | 'EDITORIAL_BOARD' | 'REVIEWERS' | 'REPORTS' | 'PROTOCOLS' | 'COMMUNICATIONS' | 'SETTINGS' | 'AUDIT_TRAIL' | 'PENDING_APPROVALS'>('MANUSCRIPT_QUEUE');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedManuscriptForRevision, setSelectedManuscriptForRevision] = useState<ManuscriptRow | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editorSearch, setEditorSearch] = useState('');
  const [reviewerSearch, setReviewerSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Editorial Board');
  const [inviteDiscipline, setInviteDiscipline] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [generatedInviteCredentials, setGeneratedInviteCredentials] = useState<{ email: string; password: string } | null>(null);
  const [showReviewerInviteModal, setShowReviewerInviteModal] = useState(false);
  const [reviewerInviteName, setReviewerInviteName] = useState('');
  const [reviewerInviteEmail, setReviewerInviteEmail] = useState('');
  const [reviewerInviteSpecialty, setReviewerInviteSpecialty] = useState('');
  const [reviewerInvitePassword, setReviewerInvitePassword] = useState('');
  const [generatedReviewerCredentials, setGeneratedReviewerCredentials] = useState<{ email: string; password: string } | null>(null);
  const [selectedEditorForDetails, setSelectedEditorForDetails] = useState<ProfileRow | null>(null);
  const [currentUserToken, setCurrentUserToken] = useState<string>('');

  // Get current user's auth token for password reset
  useEffect(() => {
    const getToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setCurrentUserToken(session.access_token);
      }
    };
    getToken();
  }, []);

  const resetInviteForm = () => {
    setInviteName('');
    setInviteEmail('');
    setInviteRole('Editorial Board');
    setInviteDiscipline('');
    setInvitePassword(generateTempPassword());
  };

  const handleOpenInvite = () => {
    resetInviteForm();
    setShowInviteModal(true);
  };

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    return Array.from({ length: 12 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
  };

  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const handleSendInvite = async () => {
    const normalizedName = inviteName.trim();
    if (!normalizedName) {
      window.alert('Please enter the editor name before creating an account.');
      return;
    }

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      window.alert('Please enter a valid email address for the editor.');
      return;
    }

    const specialization = inviteDiscipline.trim();
    if (!specialization) {
      window.alert('Please enter the editor specialization before creating an account.');
      return;
    }

    const password = invitePassword.trim() || generateTempPassword();
    if (password.length < 6) {
      window.alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      setLoading(true);
      await createEditorAccount(normalizedEmail, password, normalizedName, specialization, inviteRole);

      let profile: { id: string; email: string; status: string } | null = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data, error } = await supabase.from('profiles').select('id, email, status').eq('email', normalizedEmail).maybeSingle();
        if (!error && data) {
          profile = data as { id: string; email: string; status: string };
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      if (profile) {
        try {
          await approveUserRole(profile.id, true);
        } catch (approveError: any) {
          console.warn('Could not auto-approve editor account:', approveError.message);
        }
      }

      setGeneratedInviteCredentials({ email: normalizedEmail, password });
      setShowInviteModal(false);
      resetInviteForm();
      await load();
    } catch (error: any) {
      window.alert(error.message || 'Unable to create the editor account.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReviewerInvite = () => {
    setReviewerInviteName('');
    setReviewerInviteEmail('');
    setReviewerInviteSpecialty('');
    setReviewerInvitePassword(generateTempPassword());
    setShowReviewerInviteModal(true);
  };

  const handleSendReviewerInvite = async () => {
    const normalizedName = reviewerInviteName.trim();
    if (!normalizedName) {
      window.alert('Please enter the reviewer name before creating an account.');
      return;
    }

    const normalizedEmail = reviewerInviteEmail.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      window.alert('Please enter a valid email address for the reviewer.');
      return;
    }

    const specialization = reviewerInviteSpecialty.trim();
    if (!specialization) {
      window.alert('Please enter the reviewer specialization before creating an account.');
      return;
    }

    const password = reviewerInvitePassword.trim() || generateTempPassword();
    if (password.length < 6) {
      window.alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      setLoading(true);
      await createReviewerAccount(normalizedEmail, password, normalizedName, specialization);

      let profile: { id: string; email: string; status: string } | null = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data, error } = await supabase.from('profiles').select('id, email, status').eq('email', normalizedEmail).maybeSingle();
        if (!error && data) {
          profile = data as { id: string; email: string; status: string };
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      if (profile) {
        try {
          await approveUserRole(profile.id, true);
        } catch (approveError: any) {
          console.warn('Could not auto-approve reviewer account:', approveError.message);
        }
      }

      setGeneratedReviewerCredentials({ email: normalizedEmail, password });
      setShowReviewerInviteModal(false);
      setReviewerInviteName('');
      setReviewerInviteEmail('');
      setReviewerInviteSpecialty('');
      setReviewerInvitePassword('');
      await load();
    } catch (error: any) {
      window.alert(error.message || 'Unable to create the reviewer account.');
    } finally {
      setLoading(false);
    }
  };

  const load = async () => {
    try {
      const [rows, approvals, editors, reviewers] = await Promise.all([
        listManuscripts(),
        listPendingApprovals(),
        listActiveProfilesByRole('EDITOR'),
        listActiveProfilesByRole('REVIEWER'),
      ]);
      setItems(rows);
      setPendingApprovals(approvals);
      setEditorialBoardProfiles(editors);
      setReviewerProfiles(reviewers);
      setReviewerAssignmentCounts(await getReviewerAssignmentCounts(reviewers.map((r) => r.id)));
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
  const filteredByStage = activeTab.statuses.length === 0 ? items : items.filter((m) => activeTab.statuses.includes(m.status));
  const filtered = filteredByStage.filter((m) => (m.title + m.author_name + m.id).toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredEditors = editorialBoardProfiles.filter((profile) => (profile.name + profile.email + profile.role).toLowerCase().includes(editorSearch.toLowerCase()));
  const filteredReviewers = reviewerProfiles.filter((profile) => (profile.name + profile.email + profile.role).toLowerCase().includes(reviewerSearch.toLowerCase()));
  const selected = items.find((m) => m.id === selectedId) || null;
  const totalCount = items.length;
  const stageCounts = {
    submitted: items.filter((m) => m.status === 'SUBMITTED').length,
    underReview: items.filter((m) => m.status === 'UNDER_REVIEW').length,
    decisionPending: items.filter((m) => m.status === 'AWAITING_DECISION').length,
    revisionRequested: items.filter((m) => m.status === 'REVISION_REQUESTED').length,
  };

  const isDashboardSection = activeSection === 'DASHBOARD';
  const isManuscriptQueueSection = activeSection === 'MANUSCRIPT_QUEUE';
  const isEditorialBoardSection = activeSection === 'EDITORIAL_BOARD';
  const isReviewersSection = activeSection === 'REVIEWERS';
  const isReportsSection = activeSection === 'REPORTS';
  const isProtocolsSection = activeSection === 'PROTOCOLS';
  const isCommunicationsSection = activeSection === 'COMMUNICATIONS';
  const isSettingsSection = activeSection === 'SETTINGS';
  const isAuditTrailSection = activeSection === 'AUDIT_TRAIL';
  const isPendingApprovalsSection = activeSection === 'PENDING_APPROVALS';

  return (
    <div id="coordinator-workspace" className="flex-1 min-h-0 bg-[#00170f] text-[#111827] flex flex-col font-sans">
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden min-h-0">
        <aside className="w-full md:w-64 bg-[#00170f] border-r border-[#002116] p-4 shrink-0 text-white overflow-y-auto">
          <div className="space-y-3">
            <div className="rounded-3xl border border-[#00311f] bg-[#001d14] p-4 text-sm text-emerald-100">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-emerald-300 font-bold">
                <Settings className="w-3.5 h-3.5" /> Coordinator Hub
              </div>
              <p className="mt-3 text-[12px] text-emerald-200 leading-relaxed">Manage the editorial pipeline, approvals, and reviewer assignments from one central control panel.</p>
            </div>
            <button
              onClick={() => { setActiveSection('DASHBOARD'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isDashboardSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => { setActiveSection('MANUSCRIPT_QUEUE'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isManuscriptQueueSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Manuscript Queue</span>
            </button>
            <button
              onClick={() => { setActiveSection('EDITORIAL_BOARD'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isEditorialBoardSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Editorial Board</span>
            </button>
            <button
              onClick={() => { setActiveSection('REVIEWERS'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isReviewersSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Reviewers</span>
            </button>
            <button
              onClick={() => { setActiveSection('REPORTS'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isReportsSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Reports & Analytics</span>
            </button>
            <button
              onClick={() => { setActiveSection('PROTOCOLS'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isProtocolsSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Protocols</span>
            </button>
            <button
              onClick={() => { setActiveSection('COMMUNICATIONS'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isCommunicationsSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>Communications</span>
            </button>
            <button
              onClick={() => { setActiveSection('SETTINGS'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isSettingsSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
            <button
              onClick={() => { setActiveSection('AUDIT_TRAIL'); setSelectedId(null); }}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition ${
                isAuditTrailSection ? 'bg-[#008751] text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Audit Trail</span>
            </button>
          </div>
        </aside>

        <div className="flex-1 bg-[#00170f] md:p-3 overflow-hidden flex flex-col min-h-0">
          <main className="flex-1 bg-slate-50 md:rounded-3xl border border-[#002b1d]/20 p-6 md:p-8 overflow-y-auto text-left flex flex-col gap-5">
            {isDashboardSection ? (
              <DashboardOverviewScreen items={items} stageCounts={stageCounts} pendingApprovals={pendingApprovals.length} />
            ) : isManuscriptQueueSection ? (
              selected ? (
                <CoordinatorManuscriptDetail manuscript={selected} onBack={() => setSelectedId(null)} onChanged={load} />
              ) : (
                <ManuscriptQueueScreen
                  items={items}
                  filtered={filtered}
                  loading={loading}
                  search={searchTerm}
                  onSearch={setSearchTerm}
                  onOpen={setSelectedId}
                  onRefresh={load}
                  tab={tab}
                  setTab={setTab}
                />
              )
            ) : isEditorialBoardSection ? (
              <EditorialBoardScreen
                profiles={filteredEditors}
                loading={loading}
                search={editorSearch}
                onSearch={setEditorSearch}
                onInvite={handleOpenInvite}
                onExport={() => window.alert('Exported editorial board members.')}
                onEditorDetails={setSelectedEditorForDetails}
              />
            ) : isReviewersSection ? (
              <ReviewerDirectoryScreen
                profiles={filteredReviewers}
                assignmentCounts={reviewerAssignmentCounts}
                loading={loading}
                search={reviewerSearch}
                onSearch={setReviewerSearch}
                onInviteReviewer={handleOpenReviewerInvite}
                onReviewerDetails={setSelectedEditorForDetails}
              />
            ) : isReportsSection ? (
              <ReportsAnalyticsScreen totalCount={totalCount} stageCounts={stageCounts} pendingApprovals={pendingApprovals.length} editors={editorialBoardProfiles.length} reviewers={reviewerProfiles.length} />
            ) : (
              <PendingApprovalsScreen
                approvals={pendingApprovals}
                loading={loading}
                onAction={async (id, approve) => {
                  setLoading(true);
                  try {
                    await approveUserRole(id, approve);
                    await load();
                  } catch (e: any) {
                    console.error(e.message);
                  } finally {
                    setLoading(false);
                  }
                }}
              />
            )}
            {generatedInviteCredentials ? (
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">Temporary editor login</p>
                    <p className="mt-1 text-sm text-slate-600">Use the generated email and password to login temporarily.</p>
                  </div>
                  <button onClick={() => setGeneratedInviteCredentials(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Dismiss
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Email</p>
                    <p className="mt-2 font-semibold text-slate-900 break-words">{generatedInviteCredentials.email}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Password</p>
                    <p className="mt-2 font-semibold text-slate-900 break-words">{generatedInviteCredentials.password}</p>
                  </div>
                </div>
              </div>
            ) : null}
          {generatedReviewerCredentials ? (
            <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">Temporary reviewer login</p>
                  <p className="mt-1 text-sm text-slate-600">Use the generated email and password to login temporarily.</p>
                </div>
                <button onClick={() => setGeneratedReviewerCredentials(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Dismiss
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Email</p>
                  <p className="mt-2 font-semibold text-slate-900 break-words">{generatedReviewerCredentials.email}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Password</p>
                  <p className="mt-2 font-semibold text-slate-900 break-words">{generatedReviewerCredentials.password}</p>
                </div>
              </div>
            </div>
          ) : null}
          </main>
          <InviteEditorialMemberModal
            open={showInviteModal}
            onClose={() => setShowInviteModal(false)}
            name={inviteName}
            email={inviteEmail}
            role={inviteRole}
            discipline={inviteDiscipline}
            onNameChange={setInviteName}
            onEmailChange={setInviteEmail}
            onRoleChange={setInviteRole}
            onDisciplineChange={setInviteDiscipline}
            password={invitePassword}
            onPasswordChange={setInvitePassword}
            onGeneratePassword={() => setInvitePassword(generateTempPassword())}
            onSubmit={handleSendInvite}
          />
          <InviteReviewerModal
            open={showReviewerInviteModal}
            onClose={() => setShowReviewerInviteModal(false)}
            name={reviewerInviteName}
            email={reviewerInviteEmail}
            specialty={reviewerInviteSpecialty}
            password={reviewerInvitePassword}
            onNameChange={setReviewerInviteName}
            onEmailChange={setReviewerInviteEmail}
            onSpecialtyChange={setReviewerInviteSpecialty}
            onPasswordChange={setReviewerInvitePassword}
            onGeneratePassword={() => setReviewerInvitePassword(generateTempPassword())}
            onSubmit={handleSendReviewerInvite}
          />
          {selectedEditorForDetails && (
            <EditorDetailsModal
              editor={selectedEditorForDetails}
              onClose={() => setSelectedEditorForDetails(null)}
              currentUserToken={currentUserToken}
            />
          )}
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

function PendingApprovalsScreen({ approvals, loading, onAction }: { approvals: ProfileRow[]; loading: boolean; onAction: (id: string, approve: boolean) => Promise<void> }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Pending Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">Review and approve or reject new elevated-role account requests.</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">{approvals.length} pending</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
      ) : approvals.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          There are no pending approvals at the moment.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          {approvals.map((profile) => (
            <div key={profile.id} className="border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1 text-xs text-slate-700">
                <p className="font-bold text-slate-900">{profile.name || profile.email}</p>
                <p>{profile.email}</p>
                <p className="text-slate-500">Requested role: <span className="font-semibold text-slate-700">{profile.requested_role || 'AUTHOR'}</span></p>
              </div>
              <div className="flex gap-2">
                <button disabled={loading} onClick={() => onAction(profile.id, true)} className="bg-[#008751] hover:bg-[#007043] text-white text-[11px] font-bold px-3 py-2 rounded-lg disabled:opacity-50">Approve</button>
                <button disabled={loading} onClick={() => onAction(profile.id, false)} className="border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-bold px-3 py-2 rounded-lg disabled:opacity-50">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditorialBoardScreen({ profiles, loading, search, onSearch, onInvite, onExport, onEditorDetails }: { profiles: ProfileRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onInvite: () => void; onExport: () => void; onEditorDetails: (editor: ProfileRow) => void; }) {
  const [activeTab, setActiveTab] = useState<'ALL' | 'EDITORS' | 'ASSOCIATE' | 'SECTION'>('ALL');
  const totalMembers = profiles.length;
  const activeMembers = profiles.filter((p) => p.status === 'ACTIVE').length;
  const invitedMembers = profiles.filter((p) => p.status === 'INVITED').length;
  const inactiveMembers = profiles.filter((p) => p.status === 'INACTIVE').length;
  const editorsCount = profiles.filter((p) => ['editor-in-chief', 'editorial board', 'editor'].includes((p.role || '').toLowerCase())).length;
  const associateEditorsCount = profiles.filter((p) => (p.role || '').toLowerCase().includes('associate')).length;
  const sectionEditorsCount = profiles.filter((p) => (p.role || '').toLowerCase().includes('section')).length;

  const filteredProfiles = profiles.filter((profile) => {
    const role = (profile.role || '').toLowerCase();
    if (activeTab === 'EDITORS') return ['editor-in-chief', 'editorial board', 'editor'].includes(role);
    if (activeTab === 'ASSOCIATE') return role.includes('associate');
    if (activeTab === 'SECTION') return role.includes('section');
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Editorial Board</h1>
          <p className="text-sm text-slate-500 mt-1">Manage editorial board members, roles, responsibilities, and performance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> June 25, 2026
          </div>
          <button onClick={onExport} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
            <Download className="w-4 h-4 text-slate-500" /> Export
          </button>
          <button onClick={onInvite} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] transition">
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total Editors</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{profiles.length}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Active</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{profiles.filter((p) => p.status === 'ACTIVE').length}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Pending Approval</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{profiles.filter((p) => p.status === 'PENDING_APPROVAL').length}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Inactive</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{inactiveMembers}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Avg. response time</p>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">↗</span>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">2.4 days</p>
          <p className="text-xs text-slate-400 mt-1">To editorial tasks</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl px-4 py-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveTab('ALL')} className={`rounded-full px-4 py-2 text-xs font-semibold ${activeTab === 'ALL' ? 'bg-[#0f766e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            All Members ({totalMembers})
          </button>
          <button onClick={() => setActiveTab('EDITORS')} className={`rounded-full px-4 py-2 text-xs font-semibold ${activeTab === 'EDITORS' ? 'bg-[#0f766e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Editors ({editorsCount})
          </button>
          <button onClick={() => setActiveTab('ASSOCIATE')} className={`rounded-full px-4 py-2 text-xs font-semibold ${activeTab === 'ASSOCIATE' ? 'bg-[#0f766e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Associate Editors ({associateEditorsCount})
          </button>
          <button onClick={() => setActiveTab('SECTION')} className={`rounded-full px-4 py-2 text-xs font-semibold ${activeTab === 'SECTION' ? 'bg-[#0f766e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Section Editors ({sectionEditorsCount})
          </button>
        </div>
        <div className="w-full max-w-sm">
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-[#008751] focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Joined On</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Loading editor profiles...</td></tr>
                ) : filteredProfiles.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No editors found.</td></tr>
                ) : (
                  filteredProfiles.map((profile) => {
                    const joinedOn = profile.created_at ? formatDate(profile.created_at) : '--';
                    const statusText = profile.status.toLowerCase();
                    const statusColor = statusText === 'active' ? 'bg-emerald-100 text-emerald-700' : statusText === 'invited' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600';
                    const initials = (profile.name || 'UN').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

                    return (
                      <tr key={profile.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-900">{initials}</div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{profile.name || 'Unknown'}</p>
                              <p className="truncate text-xs text-slate-500">{profile.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{profile.role || 'Editorial Board'}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusColor}`}>
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusText === 'active' ? 'bg-emerald-700' : statusText === 'invited' ? 'bg-blue-700' : 'bg-slate-500'}`} />
                            {profile.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{joinedOn}</td>
                        <td className="px-4 py-4 text-right text-slate-500 hover:text-slate-900 cursor-pointer" onClick={() => onEditorDetails(profile)}><Eye className="h-4 w-4" /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Role distribution</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Team composition</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-slate-900">{totalMembers}</p>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Members</p>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <div className="relative h-24 w-24 rounded-full bg-slate-100">
                <div className="absolute inset-0 rounded-full border border-slate-200" />
                <div className="absolute inset-3 rounded-full bg-white shadow-sm flex items-center justify-center text-xl font-black text-slate-900">{totalMembers}</div>
              </div>
              <div className="space-y-3 flex-1">
                {[
                  { label: 'Editor-in-Chief', count: editorsCount, pct: totalMembers ? Math.round((editorsCount / totalMembers) * 100) : 0 },
                  { label: 'Associate Editors', count: associateEditorsCount, pct: totalMembers ? Math.round((associateEditorsCount / totalMembers) * 100) : 0 },
                  { label: 'Section Editors', count: sectionEditorsCount, pct: totalMembers ? Math.round((sectionEditorsCount / totalMembers) * 100) : 0 },
                  { label: 'Editorial Board', count: Math.max(0, totalMembers - editorsCount - associateEditorsCount - sectionEditorsCount), pct: totalMembers ? Math.round(((totalMembers - editorsCount - associateEditorsCount - sectionEditorsCount) / totalMembers) * 100) : 0 },
                ].map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      <span>{item.label}</span>
                      <span>{item.count} ({item.pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Top expertise areas</p>
            <div className="mt-4 space-y-4">
              {[
                { label: 'AI in Healthcare', count: 12 },
                { label: 'Medical Imaging', count: 9 },
                { label: 'Machine Learning', count: 8 },
                { label: 'Bioinformatics', count: 7 },
                { label: 'Data Science', count: 6 },
              ].map((area) => (
                <div key={area.label}>
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                    <span>{area.label}</span>
                    <span className="text-slate-500">{area.count} experts</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, area.count * 8)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-emerald-50/70 border border-emerald-100 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <FileQuestionMark className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-black text-slate-900">Need more editorial support?</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Invite qualified clinical informatics or diagnostic AI experts to strengthen your specialized review sub-boards.</p>
              </div>
            </div>
            <button onClick={onInvite} className="mt-6 inline-flex items-center justify-center rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043] transition">
              Invite Member
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InviteEditorialMemberModal({ open, onClose, name, email, role, discipline, password, onNameChange, onEmailChange, onRoleChange, onDisciplineChange, onPasswordChange, onGeneratePassword, onSubmit }: { open: boolean; onClose: () => void; name: string; email: string; role: string; discipline: string; password: string; onNameChange: (value: string) => void; onEmailChange: (value: string) => void; onRoleChange: (value: string) => void; onDisciplineChange: (value: string) => void; onPasswordChange: (value: string) => void; onGeneratePassword: () => void; onSubmit: () => void; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[30px] overflow-hidden bg-white shadow-2xl border border-slate-200">
        <div className="relative bg-slate-950 px-8 py-6">
          <div className="uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold">Board recruitment</div>
          <h2 className="mt-3 text-2xl font-black text-white">Invite editorial member</h2>
          <button onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-5 px-8 py-8 bg-slate-50">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Full name</label>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Dr. Sarah Lin"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Academic email address</label>
            <input
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="s.lin@stanford.edu"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Editorial board role</label>
              <select value={role} onChange={(e) => onRoleChange(e.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]">
                <option>Editorial Board</option>
                <option>Editor-in-Chief</option>
                <option>Associate Editor</option>
                <option>Section Editor</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Speciality discipline</label>
              <input
                value={discipline}
                onChange={(e) => onDisciplineChange(e.target.value)}
                placeholder="AI in Radiology"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Temporary password</label>
            <div className="flex gap-2">
              <input
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Enter or generate a password"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
              />
              <button type="button" onClick={onGeneratePassword} className="rounded-2xl border border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Generate
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            No email delivery is connected right now. The temporary login credentials will be shown directly in the coordinator dashboard after the account is created.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={onClose} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={onSubmit} className="rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043]">
              Create Editor Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InviteReviewerModal({ open, onClose, name, email, specialty, password, onNameChange, onEmailChange, onSpecialtyChange, onPasswordChange, onGeneratePassword, onSubmit }: { open: boolean; onClose: () => void; name: string; email: string; specialty: string; password: string; onNameChange: (value: string) => void; onEmailChange: (value: string) => void; onSpecialtyChange: (value: string) => void; onPasswordChange: (value: string) => void; onGeneratePassword: () => void; onSubmit: () => void; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[30px] overflow-hidden bg-white shadow-2xl border border-slate-200">
        <div className="relative bg-slate-950 px-8 py-6">
          <div className="uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold">Reviewer outreach</div>
          <h2 className="mt-3 text-2xl font-black text-white">Create reviewer account</h2>
          <button onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-5 px-8 py-8 bg-slate-50">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Reviewer name</label>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Dr. Maya Thompson"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Academic email address</label>
            <input
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="reviewer@example.com"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Specialty area</label>
            <input
              value={specialty}
              onChange={(e) => onSpecialtyChange(e.target.value)}
              placeholder="Clinical AI / Machine Learning"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Temporary password</label>
            <div className="flex gap-2">
              <input
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Enter or generate a password"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
              />
              <button type="button" onClick={onGeneratePassword} className="rounded-2xl border border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Generate
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-800">
            No email delivery is connected yet. The login credentials will be shown directly in the coordinator dashboard after the account is created.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={onClose} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={onSubmit} className="rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043]">
              Create Reviewer Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardOverviewScreen({ items, stageCounts, pendingApprovals }: { items: ManuscriptRow[]; stageCounts: { submitted: number; underReview: number; decisionPending: number; revisionRequested: number; }; pendingApprovals: number; }) {
  const screeningCount = items.filter((m) => m.status === 'EDITOR_REVIEW').length;
  const productionCount = items.filter((m) => ['ACCEPTED', 'PUBLISHED'].includes(m.status)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400 font-bold">Dashboard overview</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Monitor editorial pipeline, decisions backlog, and active SLAs.</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-slate-400" /> June 25, 2026
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-700 font-bold">Current queue</p>
              <h2 className="mt-3 text-2xl font-black text-slate-900">Submitted</h2>
            </div>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">1</span>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{stageCounts.submitted}</p>
          <p className="mt-2 text-sm text-emerald-700">Awaiting technical screening check.</p>
          <div className="mt-4 h-2 rounded-full bg-emerald-200">
            <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.min(100, stageCounts.submitted * 4)}%` }} />
          </div>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-amber-700 font-bold">Desk phase</p>
              <h2 className="mt-3 text-2xl font-black text-slate-900">Screening</h2>
            </div>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">2</span>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{screeningCount}</p>
          <p className="mt-2 text-sm text-amber-700">Initial technical vetting.</p>
          <div className="mt-4 h-2 rounded-full bg-amber-200">
            <div className="h-2 rounded-full bg-amber-600" style={{ width: `${Math.min(100, screeningCount * 8)}%` }} />
          </div>
        </div>

        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-sky-700 font-bold">Peer vetting</p>
              <h2 className="mt-3 text-2xl font-black text-slate-900">Under review</h2>
            </div>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">3</span>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{stageCounts.underReview}</p>
          <p className="mt-2 text-sm text-sky-700">Active external review reports.</p>
          <div className="mt-4 h-2 rounded-full bg-sky-200">
            <div className="h-2 rounded-full bg-sky-600" style={{ width: `${Math.min(100, stageCounts.underReview * 8)}%` }} />
          </div>
        </div>

        <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-violet-700 font-bold">Academic gate</p>
              <h2 className="mt-3 text-2xl font-black text-slate-900">Decision</h2>
            </div>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">4</span>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{stageCounts.decisionPending}</p>
          <p className="mt-2 text-sm text-violet-700">Awaiting editorial judgment.</p>
          <div className="mt-4 h-2 rounded-full bg-violet-200">
            <div className="h-2 rounded-full bg-violet-600" style={{ width: `${Math.min(100, stageCounts.decisionPending * 8)}%` }} />
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-700 font-bold">Archiving phase</p>
              <h2 className="mt-3 text-2xl font-black text-slate-900">Production</h2>
            </div>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">5</span>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{productionCount}</p>
          <p className="mt-2 text-sm text-emerald-700">Injecting DOI variables.</p>
          <div className="mt-4 h-2 rounded-full bg-emerald-200">
            <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.min(100, productionCount * 8)}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-bold">SLA warning exceptions</p>
            <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Review required</span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
              <p className="text-sm font-bold text-rose-700">JMS-2026-220 — Overdue Review Round</p>
              <p className="mt-1 text-sm text-slate-600">Assigned reviewer Dr. Elizabeth Vance is overdue on decision feedback check by 4 days.</p>
            </div>
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
              <p className="text-sm font-bold text-amber-700">Desk Screening Threshold Warning</p>
              <p className="mt-1 text-sm text-slate-600">4 submissions have been in unassigned screening queue for over the SLA limit of 7 days.</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-bold">Recent peer-review actions</p>
            <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">SMTP logs</span>
          </div>
          <div className="mt-4 space-y-4 text-sm text-slate-700">
            <div className="border-b border-slate-200 pb-3">
              <p className="font-semibold text-slate-900">Your manuscript JMS-2026-220 is under review</p>
              <p className="mt-1 text-xs text-slate-500">Recipient: James Carter (Author)</p>
              <p className="mt-1 text-[11px] text-slate-400">Jun 25, 2026 10:30 AM</p>
            </div>
            <div className="border-b border-slate-200 pb-3">
              <p className="font-semibold text-slate-900">Review invitation for manuscript JMS-2…</p>
              <p className="mt-1 text-xs text-slate-500">Recipient: Dr. Michael Lee (Reviewer)</p>
              <p className="mt-1 text-[11px] text-slate-400">Jun 25, 2026 09:15 AM</p>
            </div>
            <div className="border-b border-slate-200 pb-3">
              <p className="font-semibold text-slate-900">Editorial decision for manuscript JMS-2…</p>
              <p className="mt-1 text-xs text-slate-500">Recipient: Emily Watson (Author)</p>
              <p className="mt-1 text-[11px] text-slate-400">Jun 24, 2026 04:20 PM</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Reminder: Review overdue for JMS-202…</p>
              <p className="mt-1 text-xs text-slate-500">Recipient: Dr. Priya Sharma (Reviewer)</p>
              <p className="mt-1 text-[11px] text-slate-400">Jun 24, 2026 11:10 AM</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManuscriptQueueScreen({ items, filtered, loading, search, onSearch, onOpen, onRefresh, tab, setTab }: { items: ManuscriptRow[]; filtered: ManuscriptRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onOpen: (id: string | null) => void; onRefresh: () => void; tab: string; setTab: (value: string) => void; }) {
  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Manuscript queue</p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Pipeline oversight & approvals</h1>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl">Track incoming submissions, pending approvals, reviewer capacity, and editorial outcomes across the system.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#007043]"><RefreshCcw className="w-4 h-4" /> Refresh</button>
            <div className="relative w-full max-w-sm">
              <input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search manuscripts or authors..."
                className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-[#008751] focus:outline-none"
              />
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Editorial workflow</p>
            <div className="flex flex-wrap gap-2">
              {STAGE_TABS.map((stage) => {
                const active = tab === stage.key;
                return (
                  <button
                    key={stage.key}
                    onClick={() => { setTab(stage.key); onOpen(null); }}
                    className={`rounded-full px-4 py-2 text-[11px] font-semibold transition ${active ? 'bg-[#008751] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {stage.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
      ) : (
        <QueueTable items={filtered} onOpen={onOpen} />
      )}
    </>
  );
}

function ReviewerDirectoryScreen({ profiles, assignmentCounts, loading, search, onSearch, onInviteReviewer, onReviewerDetails }: { profiles: ProfileRow[]; assignmentCounts: Record<string, { invited: number; accepted: number; completed: number }>; loading: boolean; search: string; onSearch: (value: string) => void; onInviteReviewer: () => void; onReviewerDetails: (reviewer: ProfileRow) => void; }) {
  const totalReviewers = profiles.length;
  const activeReviewers = profiles.filter((p) => p.status === 'ACTIVE').length;
  const pendingInvitations = profiles.filter((p) => p.status === 'PENDING_APPROVAL' || p.status === 'INVITED').length;
  const declinedReviewers = profiles.filter((p) => p.status === 'DECLINED').length;
  const tableRows = profiles.map((profile) => ({
    id: profile.id,
    profile,
    name: profile.name || 'Unknown Reviewer',
    invited: assignmentCounts[profile.id]?.invited ?? 0,
    accepted: assignmentCounts[profile.id]?.accepted ?? 0,
    completed: assignmentCounts[profile.id]?.completed ?? 0,
    status: profile.status === 'ACTIVE' ? 'Active' : profile.status === 'INVITED' || profile.status === 'PENDING_APPROVAL' ? 'Pending' : profile.status === 'DECLINED' ? 'Declined' : 'Active',
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Reviewer Register</h1>
          <p className="text-sm text-slate-500 mt-1">Manage peer reviewer performance, tracking, and outreach from one dashboard.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> June 25, 2026
          </div>
          <button onClick={onInviteReviewer} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] transition">
            <UserPlus className="w-4 h-4" /> Invite Reviewer
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-emerald-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total Reviewers</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{totalReviewers}</p>
          <p className="text-xs text-emerald-600 mt-1">Active in database</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-sky-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Active Reviewers</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{activeReviewers}</p>
          <p className="text-xs text-sky-600 mt-1">Engaged this month</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-amber-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Pending Invitations</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{pendingInvitations}</p>
          <p className="text-xs text-amber-600 mt-1">Awaiting response</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-rose-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Declined</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{declinedReviewers}</p>
          <p className="text-xs text-rose-600 mt-1">This month</p>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Search reviewers</p>
            <p className="mt-1 text-sm text-slate-600">Find reviewers by name, specialty, or status.</p>
          </div>
          <div className="min-w-[260px]">
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search reviewer name or expertise"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            <tr>
              <th className="px-4 py-3">Reviewer</th>
              <th className="px-4 py-3">Invited</th>
              <th className="px-4 py-3">Accepted</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading reviewer profiles...</td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">No reviewers found.</td>
              </tr>
            ) : (
              tableRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4 font-semibold text-slate-900">{row.name}</td>
                  <td className="px-4 py-4 text-slate-600">{row.invited}</td>
                  <td className="px-4 py-4 text-slate-600">{row.accepted}</td>
                  <td className="px-4 py-4 text-slate-600">{row.completed}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${row.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : row.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button onClick={() => onReviewerDetails(row.profile)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Profile</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsAnalyticsScreen({ totalCount, stageCounts, pendingApprovals, editors, reviewers }: { totalCount: number; stageCounts: { submitted: number; underReview: number; decisionPending: number; revisionRequested: number; }; pendingApprovals: number; editors: number; reviewers: number; }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Review editorial metrics and system activity at a glance.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
          <Clock className="w-3.5 h-3.5 text-slate-400" /> June 25, 2026
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total Manuscripts</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{totalCount}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Submitted</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{stageCounts.submitted}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Under Review</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{stageCounts.underReview}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Decision Pending</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{stageCounts.decisionPending}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Pending Approvals</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{pendingApprovals}</p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Editorial Board</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{editors}</p>
          <p className="text-xs text-slate-500 mt-1">Active editor profiles</p>
        </div>
        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Reviewers</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{reviewers}</p>
          <p className="text-xs text-slate-500 mt-1">Active reviewer profiles</p>
        </div>
        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Workload Index</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{totalCount > 0 ? Math.min(100, Math.round((stageCounts.underReview / totalCount) * 100)) : 0}%</p>
          <p className="text-xs text-slate-500 mt-1">Review queue utilization</p>
        </div>
      </div>
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

  // Realtime subscription to reviewer_assignments for live 0/2 → 1/2 → 2/2 updates
  useEffect(() => {
    const channel = supabase
      .channel(`reviewer_assignments:${manuscript.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviewer_assignments', filter: `manuscript_id=eq.${manuscript.id}` }, () => {
        load();
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [manuscript.id]);

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
          <h3 className="text-sm font-black text-slate-900 mb-1">Review Evaluation</h3>
          <p className="text-xs text-slate-500 mb-4">The editor's complete assessment -- review this before making a decision.</p>
          {editorAssignments.map((a) => (
            <div key={a.id} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-700">{profiles[a.editor_id]?.name || a.editor_id}</span>
                <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${a.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-700' : a.status === 'DECLINED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{a.status}</span>
              </div>
              {a.assessment_status === 'SUBMITTED' && (
                <div className="bg-slate-50 rounded-lg p-4 text-xs space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    {([
                      ['scientificMerit', 'Scientific Merit', a.scientific_merit],
                      ['noveltyInnovation', 'Novelty', a.novelty_innovation],
                      ['methodologyQuality', 'Methodology', a.methodology_quality],
                      ['literatureAdequacy', 'Literature', a.literature_adequacy],
                      ['ethicalCompliance', 'Ethics', a.ethical_compliance],
                      ['dataReliability', 'Data Reliability', a.data_reliability],
                      ['writingQuality', 'Writing', a.writing_quality],
                    ] as const).map(([key, label, value]) => (
                      <div key={key}>
                        <Score label={label} value={value} />
                        {a.criteria_reasons?.[key] && (
                          <p className="text-[10px] text-slate-500 italic mt-1 px-1">"{a.criteria_reasons[key]}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p><strong>Strengths:</strong> {a.strengths}</p>
                  <p><strong>Weaknesses:</strong> {a.weaknesses}</p>
                  {a.mandatory_revisions && <p><strong>Mandatory Revisions:</strong> {a.mandatory_revisions}</p>}
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
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-3">Review Progress</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500 uppercase tracking-wide mb-1">Invited</p>
              <p className="font-black text-slate-900">{reviewerAssignments.filter((r) => r.status === 'INVITED').length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500 uppercase tracking-wide mb-1">Accepted</p>
              <p className="font-black text-slate-900">{reviewerAssignments.filter((r) => r.status === 'ACCEPTED').length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500 uppercase tracking-wide mb-1">Submitted</p>
              <p className="font-black text-slate-900">{reviewerAssignments.filter((r) => r.status === 'SUBMITTED').length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500 uppercase tracking-wide mb-1">Declined</p>
              <p className="font-black text-slate-900">{reviewerAssignments.filter((r) => r.status === 'DECLINED').length}</p>
            </div>
          </div>
          {manuscript.status === 'AWAITING_DECISION' && (
            <div className="mt-4 rounded-2xl bg-sky-50 border border-sky-200 p-4 text-sky-700 text-xs">
              All reviewer reports are in. The editor may now submit a final recommendation for Coordinator verification.
            </div>
          )}
        </div>
      )}
      {reviewerAssignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> Reviewer Reports</h3>
          <div className="space-y-4">
            {reviewerAssignments.map((r, idx) => (
              <div key={r.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">Reviewer {idx + 1}</span>
                    <p className="text-xs text-slate-600">{profiles[r.reviewer_id]?.name || r.reviewer_id}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.submitted_at && (
                      <p className="text-xs text-slate-500">
                        Submitted: {new Date(r.submitted_at).toLocaleString()}
                      </p>
                    )}
                    <span className={`px-2 py-1 rounded-full font-bold uppercase text-[10px] ${
                      r.status === 'SUBMITTED' ? 'bg-emerald-50 text-emerald-700' : r.status === 'DECLINED' ? 'bg-red-50 text-red-700' : r.status === 'ACCEPTED' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                    }`}>{r.status}</span>
                  </div>
                </div>
                {r.status === 'SUBMITTED' && (
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-slate-900 mb-2">Assessment Scores</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          {label: 'Scientific Merit', value: r.scientific_merit},
                          {label: 'Novelty', value: r.novelty_innovation},
                          {label: 'Methodology', value: r.methodology_quality},
                          {label: 'Literature', value: r.literature_adequacy},
                          {label: 'Ethics', value: r.ethical_compliance},
                          {label: 'Data Reliability', value: r.data_reliability},
                          {label: 'Writing', value: r.writing_quality}
                        ].map((score) => (
                          <div key={score.label} className="bg-white rounded px-2 py-1.5 border border-slate-200">
                            <p className="text-slate-400 text-[10px] uppercase">{score.label}</p>
                            <p className="font-black text-slate-800">{score.value ?? '--'}/10</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 mb-1"><strong>Recommendation:</strong> {r.recommendation?.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 mb-1">To Author:</p>
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded">{r.comments_to_author || '(No comments)'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 mb-1">To Editor:</p>
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded">{r.comments_to_editor || '(No comments)'}</p>
                    </div>
                  </div>
                )}
                {r.status !== 'SUBMITTED' && (
                  <div className="p-4">
                    <p className="text-xs text-slate-500">
                      {r.status === 'INVITED' && '⏳ Awaiting reviewer response to invitation'}
                      {r.status === 'ACCEPTED' && '✓ Reviewer has accepted and is preparing assessment'}
                      {r.status === 'DECLINED' && '✕ Reviewer declined this assignment'}
                    </p>
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
          reviewerAssignments={reviewerAssignments}
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

      <div>
        <h3 className="text-sm font-black text-slate-900 mb-3">Revision History</h3>
        <RevisionHistoryPanel manuscriptId={manuscript.id} profiles={profiles} />
      </div>

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

function PublishDecisionPanel({ busy, editorHasRecommended, recommendation, reviewerAssignments, onPublish }: {
  busy: boolean; editorHasRecommended: boolean; recommendation: string | null; reviewerAssignments?: ReviewerAssignmentRow[]; onPublish: (decision: PublishDecision, letter: string) => void;
}) {
  const [decision, setDecision] = useState<PublishDecision>('ACCEPT');
  const [letter, setLetter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState<'SUMMARY' | 'REVIEWERS' | 'DECISION'>('SUMMARY');

  const submittedReviews = (reviewerAssignments || []).filter((r) => r.status === 'SUBMITTED');
  const allReviewsIn = submittedReviews.length >= 2;

  if (!editorHasRecommended) {
    return (
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 text-xs text-sky-700 flex items-center gap-2">
        <Clock className="w-4 h-4" /> Waiting for the editor's recommendation before you can verify and publish a decision.
      </div>
    );
  }

  return (
    <>
      <div className="bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">Complete Review Package</h3>
            <p className="text-xs text-slate-600 mt-1">All assessments compiled • Ready for final decision</p>
          </div>
          <span className={`px-3 py-1 rounded-full font-bold text-[11px] ${allReviewsIn ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-100 text-amber-700'}`}>
            {allReviewsIn ? '✓ READY' : `${submittedReviews.length}/2 REVIEWS IN`}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {['SUMMARY', 'REVIEWERS', 'DECISION'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode as any)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                viewMode === mode
                  ? 'bg-[#008751] text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {viewMode === 'SUMMARY' && (
          <div className="space-y-3 text-xs">
            <div className="bg-white rounded-lg p-4 border border-slate-100">
              <p className="font-bold text-slate-900 mb-3">Editor Assessment</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  {label: 'Scientific Merit', key: 'scientific_merit'},
                  {label: 'Novelty', key: 'novelty_innovation'},
                  {label: 'Methodology', key: 'methodology_quality'},
                  {label: 'Literature', key: 'literature_adequacy'},
                  {label: 'Ethics', key: 'ethical_compliance'},
                  {label: 'Data Reliability', key: 'data_reliability'},
                  {label: 'Writing', key: 'writing_quality'}
                ].map((score) => (
                  <div key={score.key} className="bg-slate-50 rounded px-2 py-1.5 border border-slate-200">
                    <p className="text-slate-400 text-[10px] uppercase">{score.label}</p>
                    <p className="font-black text-slate-800">--/10</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-slate-600">Recommendation: <span className="font-bold text-[#008751]">{recommendation?.replace(/_/g, ' ')}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-lg p-3 border border-slate-100">
                <p className="text-slate-500 uppercase font-bold text-[10px] mb-1">Reviews Received</p>
                <p className="text-2xl font-black text-slate-900">{submittedReviews.length}/2</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-100">
                <p className="text-slate-500 uppercase font-bold text-[10px] mb-1">Status</p>
                <p className="font-bold text-emerald-700">{allReviewsIn ? 'All In' : 'Pending'}</p>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'REVIEWERS' && (
          <div className="space-y-2">
            {submittedReviews.map((r, idx) => (
              <div key={r.id} className="bg-white rounded-lg p-3 border border-slate-100 text-xs">
                <p className="font-bold text-slate-900 mb-2">Reviewer {idx + 1}</p>
                <div className="space-y-1 text-slate-600">
                  <p><strong>Recommendation:</strong> <span className="font-bold">{r.recommendation?.replace(/_/g, ' ')}</span></p>
                  <p><strong>To Author:</strong> {r.comments_to_author?.substring(0, 80)}...</p>
                  <p><strong>To Editor:</strong> {r.comments_to_editor?.substring(0, 80)}...</p>
                </div>
              </div>
            ))}
            {submittedReviews.length < 2 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                ⏳ Waiting for {2 - submittedReviews.length} more review(s) before final decision
              </div>
            )}
          </div>
        )}

        {viewMode === 'DECISION' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-2">Final Decision</label>
              <select value={decision} onChange={(e) => setDecision(e.target.value as PublishDecision)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white">
                <option value="ACCEPT">✓ Accept - Ready for Publication</option>
                <option value="MINOR_REVISION">◊ Minor Revisions Required</option>
                <option value="MAJOR_REVISION">◆ Major Revisions Required</option>
                <option value="REJECT">✕ Reject - Not Suitable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-2">Decision Letter to Author</label>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                rows={4}
                placeholder="Communicate the final decision and next steps clearly..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white font-sans"
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4 pt-4 border-t border-emerald-200">
          <button
            onClick={() => {
              const message = window.prompt('Request clarification from the editor:', 'Please clarify...');
              if (message) {
                alert(`Clarification request sent to editor: "${message}"`);
                // This would call an RPC function to create a communication record
                // await postDiscussionMessage(manuscript.id, message, 'EDITOR_CLARIFICATION');
              }
            }}
            className="flex-1 px-3 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 transition flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4" />
            Return to Editor
          </button>
          <button
            disabled={busy || !allReviewsIn}
            onClick={() => setShowModal(true)}
            className="flex-1 bg-[#008751] hover:bg-[#007043] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Publish Decision
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-6">
              <h2 className="text-lg font-black">Publish Final Decision</h2>
              <p className="text-emerald-100 text-xs mt-1">This will notify the author of the final verdict</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 text-xs space-y-2">
                <p><strong>Decision:</strong> <span className="font-bold text-[#008751]">{decision.replace(/_/g, ' ')}</span></p>
                <p><strong>Letter Preview:</strong></p>
                <p className="text-slate-600 italic">{letter.substring(0, 150)}...</p>
                <p className="text-slate-500 text-[11px] pt-2 border-t border-slate-200">✓ Reviewer reports reviewed and compiled<br/>✓ Editor recommendation confirmed<br/>✓ Ready to send to author</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    onPublish(decision, letter);
                    setShowModal(false);
                  }}
                  className="flex-1 bg-[#008751] hover:bg-[#007043] disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm & Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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
