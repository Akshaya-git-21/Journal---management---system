import { useEffect, useState } from 'react';
import { ManuscriptStatus } from '../types';
import { supabase } from '../lib/supabase';
import { createEditorAccount, createReviewerAccount, createAndActivatePublisherAccount, createAndActivateGDMemberAccount } from '../lib/auth';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, StatusHistoryRow, SuggestedReviewerRow, ProfileRow, AuditLogRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, getStatusHistory, getSuggestedReviewers,
  listActiveProfilesByRole, listPendingApprovals, approveUserRole, getProfilesByIds, assignEditor, assignReviewers, publishDecision, markPublished, sendToPublisher,
  subscribeToManuscripts, PublishDecision, getRevisions, RevisionRow, getReviewerAssignmentCounts,
  getRecentStatusHistory, getOverdueReviewerAssignments, OverdueReviewRow, getRecentAuditLog,
  notifyExpiredReviewerReplacements
} from '../lib/workflow';
import { getManuscriptStatusLabel, getLatestRevision, getRevisionMeta, STANDARD_STATUS_COLORS } from '../lib/manuscriptStatusLabel';
import CoordinatorManuscriptDetail from './CoordinatorManuscriptDetail';
import CoordinatorRevisionManager from './CoordinatorRevisionManager';
import EditorDetailsModal from './EditorDetailsModal';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import { Loader2, ArrowLeft, Clock, LayoutDashboard, FileText, Users, BarChart3, BookOpen, Mail, Settings, ShieldCheck, Plus, Download, RefreshCcw, CheckCircle2, UserPlus, X, Eye, FileQuestionMark, ClipboardList, MessageCircle, SlidersHorizontal, Activity, Building2, LayoutGrid, Cog, Inbox, Printer, PackageCheck, FileCheck2, MessageSquareWarning, Send } from 'lucide-react';
import { NavGroup, NavItem } from './SidebarNavGroup';
import { AssignmentConfirmationDialog } from './AssignmentConfirmationDialog';
import ProductionSection from './production/ProductionSection';
import JournalTemplateSection from './production/JournalTemplateSection';

interface CoordinatorWorkspaceProps {
  manuscripts?: any[];
  onUpdateManuscript?: (manuscript: any) => void;
}

// Coordinator work-queue tabs -- internal navigation aids (spec explicitly
// permits these to stay Coordinator-specific, e.g. "Decision Pending" as a
// queue of manuscripts needing the Coordinator's own next action), distinct
// from the manuscript's own primary status shown via StatusBadge below.
// "Editor Review"/"Peer Review" are keyed off the standardized display
// status (not the raw UNDER_REVIEW value) so a manuscript with only one
// reviewer accepted doesn't wrongly show up in the Peer Review queue.
const STAGE_TABS: { key: string; label: string; predicate: (m: ManuscriptRow) => boolean }[] = [
  { key: 'ALL', label: 'All Stages', predicate: () => true },
  { key: 'SUBMITTED', label: 'Unassigned Queue', predicate: (m) => m.status === 'SUBMITTED' },
  { key: 'EDITOR_REVIEW', label: 'Editor Review', predicate: (m) => getManuscriptStatusLabel(m) === 'EDITORIAL REVIEW' },
  { key: 'UNDER_REVIEW', label: 'Peer Review', predicate: (m) => getManuscriptStatusLabel(m) === 'PEER REVIEW' },
  { key: 'AWAITING_DECISION', label: 'Decision Pending', predicate: (m) => m.status === 'AWAITING_DECISION' },
  { key: 'DONE', label: 'Resolved', predicate: (m) => ['ACCEPTED', 'PUBLISHED', 'REJECTED', 'REVISION_REQUESTED'].includes(m.status) },
];

function StatusBadge({ manuscript, latestRevision }: { manuscript: ManuscriptRow; latestRevision?: RevisionRow | null }) {
  const label = getManuscriptStatusLabel(manuscript, latestRevision);
  const revisionMeta = getRevisionMeta(latestRevision);
  const style = STANDARD_STATUS_COLORS[label as keyof typeof STANDARD_STATUS_COLORS] || STANDARD_STATUS_COLORS.DRAFT;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${style}`}>
        {label}
      </span>
      {revisionMeta && (
        <span className="inline-flex items-center px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 text-[9px] font-bold uppercase tracking-wide">
          Rev {revisionMeta.revisionNumber}
        </span>
      )}
    </span>
  );
}

export default function CoordinatorWorkspace(_props: CoordinatorWorkspaceProps) {
  const [items, setItems] = useState<ManuscriptRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ProfileRow[]>([]);
  const [editorialBoardProfiles, setEditorialBoardProfiles] = useState<ProfileRow[]>([]);
  const [reviewerProfiles, setReviewerProfiles] = useState<ProfileRow[]>([]);
  const [publisherProfiles, setPublisherProfiles] = useState<ProfileRow[]>([]);
  const [reviewerAssignmentCounts, setReviewerAssignmentCounts] = useState<Record<string, { invited: number; accepted: number; completed: number }>>({});
  const [recentActivity, setRecentActivity] = useState<StatusHistoryRow[]>([]);
  const [overdueReviews, setOverdueReviews] = useState<OverdueReviewRow[]>([]);
  const [activityProfiles, setActivityProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ALL');
  const [activeSection, setActiveSection] = useState<'DASHBOARD' | 'MANUSCRIPT_QUEUE' | 'REVISIONS' | 'EDITORIAL_BOARD' | 'REVIEWERS' | 'PUBLISHERS' | 'GD_MEMBERS' | 'REPORTS' | 'PROTOCOLS' | 'COMMUNICATIONS' | 'SETTINGS' | 'AUDIT_TRAIL' | 'PENDING_APPROVALS' | 'PRODUCTION_QUEUE' | 'IN_PRODUCTION' | 'PROOFS_AWAITING_AUTHOR' | 'CORRECTIONS' | 'READY_FOR_PUBLICATION' | 'PDF_TEMPLATE'>('DASHBOARD');
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>({ workspace: true, people: true, system: true, production: true });
  const toggleNavGroup = (key: string) => setExpandedNavGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedManuscriptForRevision, setSelectedManuscriptForRevision] = useState<ManuscriptRow | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editorSearch, setEditorSearch] = useState('');
  const [reviewerSearch, setReviewerSearch] = useState('');
  const [publisherSearch, setPublisherSearch] = useState('');
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
  const [showPublisherInviteModal, setShowPublisherInviteModal] = useState(false);
  const [publisherInviteName, setPublisherInviteName] = useState('');
  const [publisherInviteEmail, setPublisherInviteEmail] = useState('');
  const [publisherInviteOrganization, setPublisherInviteOrganization] = useState('');
  const [publisherInvitePassword, setPublisherInvitePassword] = useState('');
  const [generatedPublisherCredentials, setGeneratedPublisherCredentials] = useState<{ email: string; password: string } | null>(null);
  const [gdMemberProfiles, setGdMemberProfiles] = useState<ProfileRow[]>([]);
  const [gdMemberSearch, setGdMemberSearch] = useState('');
  const [showGDMemberInviteModal, setShowGDMemberInviteModal] = useState(false);
  const [gdMemberInviteName, setGdMemberInviteName] = useState('');
  const [gdMemberInviteEmail, setGdMemberInviteEmail] = useState('');
  const [gdMemberInvitePassword, setGdMemberInvitePassword] = useState('');
  const [generatedGDMemberCredentials, setGeneratedGDMemberCredentials] = useState<{ email: string; password: string } | null>(null);
  const [selectedEditorForDetails, setSelectedEditorForDetails] = useState<ProfileRow | null>(null);

  // Lazily surface any reviewer-replacement deadline that expired with no
  // Editor action taken -- idempotent (see notify_expired_reviewer_replacements
  // in 0034_reviewer_replacement_round_isolation.sql), safe to call every
  // time the Coordinator lands on their dashboard.
  useEffect(() => {
    notifyExpiredReviewerReplacements().catch(() => {});
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
      const result = await createEditorAccount(normalizedEmail, password, normalizedName, specialization, inviteRole);

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

      setGeneratedInviteCredentials({ email: normalizedEmail, password: result.temporaryPassword });
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
      const result = await createReviewerAccount(normalizedEmail, password, normalizedName, specialization);

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

      setGeneratedReviewerCredentials({ email: normalizedEmail, password: result.temporaryPassword });
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

  const handleOpenPublisherInvite = () => {
    setPublisherInviteName('');
    setPublisherInviteEmail('');
    setPublisherInviteOrganization('');
    setPublisherInvitePassword(generateTempPassword());
    setShowPublisherInviteModal(true);
  };

  const handleSendPublisherInvite = async () => {
    const normalizedName = publisherInviteName.trim();
    if (!normalizedName) {
      window.alert('Please enter the publisher name before creating an account.');
      return;
    }

    const normalizedEmail = publisherInviteEmail.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      window.alert('Please enter a valid email address for the publisher.');
      return;
    }

    const organization = publisherInviteOrganization.trim();
    if (!organization) {
      window.alert('Please enter the publisher organization before creating an account.');
      return;
    }

    const password = publisherInvitePassword.trim() || generateTempPassword();
    if (password.length < 6) {
      window.alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      setLoading(true);
      const profile = await createAndActivatePublisherAccount(normalizedEmail, password, normalizedName, organization);

      setGeneratedPublisherCredentials({ email: normalizedEmail, password });
      setShowPublisherInviteModal(false);
      setPublisherInviteName('');
      setPublisherInviteEmail('');
      setPublisherInviteOrganization('');
      setPublisherInvitePassword('');
      await load();
      return profile;
    } catch (error: any) {
      window.alert(error.message || 'Unable to create the publisher account.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleOpenGDMemberInvite = () => {
    setGdMemberInviteName('');
    setGdMemberInviteEmail('');
    setGdMemberInvitePassword(generateTempPassword());
    setShowGDMemberInviteModal(true);
  };

  const handleSendGDMemberInvite = async () => {
    const normalizedName = gdMemberInviteName.trim();
    if (!normalizedName) {
      window.alert('Please enter the GD Member name before creating an account.');
      return;
    }

    const normalizedEmail = gdMemberInviteEmail.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      window.alert('Please enter a valid email address for the GD Member.');
      return;
    }

    const password = gdMemberInvitePassword.trim() || generateTempPassword();
    if (password.length < 6) {
      window.alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      setLoading(true);
      await createAndActivateGDMemberAccount(normalizedEmail, password, normalizedName);

      setGeneratedGDMemberCredentials({ email: normalizedEmail, password });
      setShowGDMemberInviteModal(false);
      setGdMemberInviteName('');
      setGdMemberInviteEmail('');
      setGdMemberInvitePassword('');
      await load();
    } catch (error: any) {
      window.alert(error.message || 'Unable to create the GD Member account.');
    } finally {
      setLoading(false);
    }
  };

  const load = async () => {
    try {
      const [rows, approvals, editors, reviewers, publishers, gdMembers, activity, overdue] = await Promise.all([
        listManuscripts(),
        listPendingApprovals(),
        listActiveProfilesByRole('EDITOR'),
        listActiveProfilesByRole('REVIEWER'),
        listActiveProfilesByRole('PUBLISHER'),
        listActiveProfilesByRole('GD_MEMBER'),
        getRecentStatusHistory(8),
        getOverdueReviewerAssignments(),
      ]);
      setItems(rows);
      setPendingApprovals(approvals);
      setEditorialBoardProfiles(editors);
      setReviewerProfiles(reviewers);
      setPublisherProfiles(publishers);
      setGdMemberProfiles(gdMembers);
      setReviewerAssignmentCounts(await getReviewerAssignmentCounts(reviewers.map((r) => r.id)));
      setRecentActivity(activity);
      setOverdueReviews(overdue);
      const actorIds = activity.map((a) => a.actor_id).filter((id): id is string => !!id);
      const reviewerIds = overdue.map((o) => o.reviewer_id).filter((id): id is string => !!id);
      const neededIds = Array.from(new Set([...actorIds, ...reviewerIds]));
      if (neededIds.length > 0) {
        setActivityProfiles(await getProfilesByIds(neededIds));
      } else {
        setActivityProfiles({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  // Keep the Editorial Board / Reviewers rosters live -- new accounts (e.g.
  // created from an accepted reviewer suggestion) or role/status changes
  // don't touch the manuscripts table, so they need their own subscription.
  useEffect(() => {
    const channel = supabase
      .channel('coordinator-profiles-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        load();
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  const activeTab = STAGE_TABS.find((t) => t.key === tab) || STAGE_TABS[0];
  const filteredByStage = activeTab.key === 'ALL' ? items : items.filter(activeTab.predicate);
  const filtered = filteredByStage.filter((m) => (m.title + m.author_name + m.id).toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredEditors = editorialBoardProfiles.filter((profile) => (profile.name + profile.email + profile.role).toLowerCase().includes(editorSearch.toLowerCase()));
  const filteredReviewers = reviewerProfiles.filter((profile) => (profile.name + profile.email + profile.role).toLowerCase().includes(reviewerSearch.toLowerCase()));
  const filteredPublishers = publisherProfiles.filter((profile) => (profile.name + profile.email + profile.role).toLowerCase().includes(publisherSearch.toLowerCase()));
  const filteredGDMembers = gdMemberProfiles.filter((profile) => (profile.name + profile.email + profile.role).toLowerCase().includes(gdMemberSearch.toLowerCase()));
  const selected = items.find((m) => m.id === selectedId) || null;
  const totalCount = items.length;
  const stageCounts = {
    all: items.length,
    submitted: items.filter((m) => m.status === 'SUBMITTED').length,
    editorReview: items.filter((m) => getManuscriptStatusLabel(m) === 'EDITORIAL REVIEW').length,
    underReview: items.filter((m) => getManuscriptStatusLabel(m) === 'PEER REVIEW').length,
    awaitingDecision: items.filter((m) => m.status === 'AWAITING_DECISION').length,
    done: items.filter((m) => ['ACCEPTED', 'PUBLISHED', 'REJECTED', 'REVISION_REQUESTED'].includes(m.status)).length,
  };

  const isDashboardSection = activeSection === 'DASHBOARD';
  const isManuscriptQueueSection = activeSection === 'MANUSCRIPT_QUEUE';
  const isEditorialBoardSection = activeSection === 'EDITORIAL_BOARD';
  const isReviewersSection = activeSection === 'REVIEWERS';
  const isPublishersSection = activeSection === 'PUBLISHERS';
  const isGDMembersSection = activeSection === 'GD_MEMBERS';
  const isReportsSection = activeSection === 'REPORTS';
  const isCommunicationsSection = activeSection === 'COMMUNICATIONS';
  const isSettingsSection = activeSection === 'SETTINGS';
  const isAuditTrailSection = activeSection === 'AUDIT_TRAIL';
  const isPendingApprovalsSection = activeSection === 'PENDING_APPROVALS';
  const isProductionQueueSection = activeSection === 'PRODUCTION_QUEUE';
  const isInProductionSection = activeSection === 'IN_PRODUCTION';
  const isProofsAwaitingAuthorSection = activeSection === 'PROOFS_AWAITING_AUTHOR';
  const isCorrectionsSection = activeSection === 'CORRECTIONS';
  const isReadyForPublicationSection = activeSection === 'READY_FOR_PUBLICATION';
  const isPdfTemplateSection = activeSection === 'PDF_TEMPLATE';

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
            <NavGroup title="Workspace" icon={<LayoutGrid className="w-4 h-4" />} expanded={expandedNavGroups.workspace} onToggle={() => toggleNavGroup('workspace')}>
              <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active={isDashboardSection} onClick={() => { setActiveSection('DASHBOARD'); setSelectedId(null); }} />
              <NavItem icon={<ClipboardList className="w-4 h-4" />} label="Manuscript Queue" active={isManuscriptQueueSection} onClick={() => { setActiveSection('MANUSCRIPT_QUEUE'); setSelectedId(null); }} />
              <NavItem icon={<ShieldCheck className="w-4 h-4" />} label="Pending Approvals" active={isPendingApprovalsSection} onClick={() => { setActiveSection('PENDING_APPROVALS'); setSelectedId(null); }} />
            </NavGroup>

            <NavGroup title="People" icon={<Users className="w-4 h-4" />} expanded={expandedNavGroups.people} onToggle={() => toggleNavGroup('people')}>
              <NavItem icon={<BookOpen className="w-4 h-4" />} label="Editorial Board" active={isEditorialBoardSection} onClick={() => { setActiveSection('EDITORIAL_BOARD'); setSelectedId(null); }} />
              <NavItem icon={<Users className="w-4 h-4" />} label="Reviewers" active={isReviewersSection} onClick={() => { setActiveSection('REVIEWERS'); setSelectedId(null); }} />
              <NavItem icon={<Building2 className="w-4 h-4" />} label="Publishers" active={isPublishersSection} onClick={() => { setActiveSection('PUBLISHERS'); setSelectedId(null); }} />
              <NavItem icon={<PackageCheck className="w-4 h-4" />} label="GD Members" active={isGDMembersSection} onClick={() => { setActiveSection('GD_MEMBERS'); setSelectedId(null); }} />
            </NavGroup>

            <NavGroup title="System" icon={<Cog className="w-4 h-4" />} expanded={expandedNavGroups.system} onToggle={() => toggleNavGroup('system')}>
              <NavItem icon={<BarChart3 className="w-4 h-4" />} label="Reports & Analytics" active={isReportsSection} onClick={() => { setActiveSection('REPORTS'); setSelectedId(null); }} />
              <NavItem icon={<MessageCircle className="w-4 h-4" />} label="Communications" active={isCommunicationsSection} onClick={() => { setActiveSection('COMMUNICATIONS'); setSelectedId(null); }} />
              <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" active={isSettingsSection} onClick={() => { setActiveSection('SETTINGS'); setSelectedId(null); }} />
              <NavItem icon={<Activity className="w-4 h-4" />} label="Audit Trail" active={isAuditTrailSection} onClick={() => { setActiveSection('AUDIT_TRAIL'); setSelectedId(null); }} />
            </NavGroup>

            <NavGroup title="Production" icon={<Printer className="w-4 h-4" />} expanded={expandedNavGroups.production} onToggle={() => toggleNavGroup('production')}>
              <NavItem icon={<Inbox className="w-4 h-4" />} label="Production Queue" active={isProductionQueueSection} onClick={() => { setActiveSection('PRODUCTION_QUEUE'); setSelectedId(null); }} />
              <NavItem icon={<PackageCheck className="w-4 h-4" />} label="In Production" active={isInProductionSection} onClick={() => { setActiveSection('IN_PRODUCTION'); setSelectedId(null); }} />
              <NavItem icon={<Send className="w-4 h-4" />} label="Proofs Awaiting Author" active={isProofsAwaitingAuthorSection} onClick={() => { setActiveSection('PROOFS_AWAITING_AUTHOR'); setSelectedId(null); }} />
              <NavItem icon={<MessageSquareWarning className="w-4 h-4" />} label="Corrections" active={isCorrectionsSection} onClick={() => { setActiveSection('CORRECTIONS'); setSelectedId(null); }} />
              <NavItem icon={<FileCheck2 className="w-4 h-4" />} label="Ready for Publication" active={isReadyForPublicationSection} onClick={() => { setActiveSection('READY_FOR_PUBLICATION'); setSelectedId(null); }} />
              <NavItem icon={<FileText className="w-4 h-4" />} label="PDF Template" active={isPdfTemplateSection} onClick={() => { setActiveSection('PDF_TEMPLATE'); setSelectedId(null); }} />
            </NavGroup>
          </div>
        </aside>

        <div className="flex-1 bg-[#00170f] md:p-3 overflow-hidden flex flex-col min-h-0">
          <main className="flex-1 bg-slate-50 md:rounded-3xl border border-[#002b1d]/20 p-6 md:p-8 overflow-y-auto text-left flex flex-col gap-5">
            {isDashboardSection ? (
              <DashboardOverviewScreen
                items={items}
                stageCounts={stageCounts}
                pendingApprovals={pendingApprovals.length}
                recentActivity={recentActivity}
                overdueReviews={overdueReviews}
                profiles={activityProfiles}
                loading={loading}
              />
            ) : isManuscriptQueueSection ? (
              selected ? (
                <CoordinatorManuscriptDetail manuscript={selected} showAllFiles={tab === 'ALL'} onBack={() => setSelectedId(null)} onChanged={load} />
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
                  stageCounts={stageCounts}
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
            ) : isPublishersSection ? (
              <PublishersScreen
                profiles={filteredPublishers}
                loading={loading}
                search={publisherSearch}
                onSearch={setPublisherSearch}
                onInvitePublisher={handleOpenPublisherInvite}
                onPublisherDetails={setSelectedEditorForDetails}
              />
            ) : isGDMembersSection ? (
              <GDMembersScreen
                profiles={filteredGDMembers}
                loading={loading}
                search={gdMemberSearch}
                onSearch={setGdMemberSearch}
                onInviteGDMember={handleOpenGDMemberInvite}
                onGDMemberDetails={setSelectedEditorForDetails}
              />
            ) : isReportsSection ? (
              <ReportsAnalyticsScreen totalCount={totalCount} stageCounts={stageCounts} pendingApprovals={pendingApprovals.length} editors={editorialBoardProfiles.length} reviewers={reviewerProfiles.length} />
            ) : isCommunicationsSection ? (
              <NotAvailableScreen title="Communications" text="Coordinator-wide messaging is not connected to a data source yet." />
            ) : isSettingsSection ? (
              <NotAvailableScreen title="Settings" text="Journal configuration settings are not connected to a data source yet." />
            ) : isAuditTrailSection ? (
              <AuditTrailScreen manuscripts={items} />
            ) : isProductionQueueSection ? (
              <ProductionSection view="QUEUE" />
            ) : isInProductionSection ? (
              <ProductionSection view="IN_PRODUCTION" />
            ) : isProofsAwaitingAuthorSection ? (
              <ProductionSection view="PROOFS" />
            ) : isCorrectionsSection ? (
              <ProductionSection view="CORRECTIONS" />
            ) : isReadyForPublicationSection ? (
              <ProductionSection view="READY" />
            ) : isPdfTemplateSection ? (
              <JournalTemplateSection canUpload />
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
          {generatedPublisherCredentials ? (
            <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">Temporary publisher login</p>
                  <p className="mt-1 text-sm text-slate-600">Use the generated email and password to login temporarily.</p>
                </div>
                <button onClick={() => setGeneratedPublisherCredentials(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Dismiss
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Email</p>
                  <p className="mt-2 font-semibold text-slate-900 break-words">{generatedPublisherCredentials.email}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Password</p>
                  <p className="mt-2 font-semibold text-slate-900 break-words">{generatedPublisherCredentials.password}</p>
                </div>
              </div>
            </div>
          ) : null}
          {generatedGDMemberCredentials ? (
            <div className="rounded-3xl border border-teal-100 bg-teal-50 p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">Temporary GD Member login</p>
                  <p className="mt-1 text-sm text-slate-600">Use the generated email and password to login temporarily.</p>
                </div>
                <button onClick={() => setGeneratedGDMemberCredentials(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Dismiss
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Email</p>
                  <p className="mt-2 font-semibold text-slate-900 break-words">{generatedGDMemberCredentials.email}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Password</p>
                  <p className="mt-2 font-semibold text-slate-900 break-words">{generatedGDMemberCredentials.password}</p>
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
          <InvitePublisherModal
            open={showPublisherInviteModal}
            onClose={() => setShowPublisherInviteModal(false)}
            name={publisherInviteName}
            email={publisherInviteEmail}
            organization={publisherInviteOrganization}
            password={publisherInvitePassword}
            onNameChange={setPublisherInviteName}
            onEmailChange={setPublisherInviteEmail}
            onOrganizationChange={setPublisherInviteOrganization}
            onPasswordChange={setPublisherInvitePassword}
            onGeneratePassword={() => setPublisherInvitePassword(generateTempPassword())}
            onSubmit={handleSendPublisherInvite}
          />
          <InviteGDMemberModal
            open={showGDMemberInviteModal}
            onClose={() => setShowGDMemberInviteModal(false)}
            name={gdMemberInviteName}
            email={gdMemberInviteEmail}
            password={gdMemberInvitePassword}
            onNameChange={setGdMemberInviteName}
            onEmailChange={setGdMemberInviteEmail}
            onPasswordChange={setGdMemberInvitePassword}
            onGeneratePassword={() => setGdMemberInvitePassword(generateTempPassword())}
            onSubmit={handleSendGDMemberInvite}
          />
          {selectedEditorForDetails && (
            <EditorDetailsModal
              editor={selectedEditorForDetails}
              onClose={() => setSelectedEditorForDetails(null)}
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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedItems = items.slice(startIdx, startIdx + itemsPerPage);

  if (items.length === 0) {
    return <div className="text-center py-20 text-sm text-slate-400 bg-white border border-dashed border-slate-300 rounded-2xl">No manuscripts in this stage.</div>;
  }

  return (
    <div className="space-y-4">
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
            {paginatedItems.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(m.id)}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.id}</td>
                <td className="px-4 py-3 font-bold text-slate-800 max-w-xs truncate">{m.title}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{m.author_name}</td>
                <td className="px-4 py-3"><StatusBadge manuscript={m} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(m.submitted_at)}</td>
                <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">Open &rarr;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Showing {startIdx + 1} to {Math.min(startIdx + itemsPerPage, items.length)} of {items.length} manuscripts
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                    page === currentPage
                      ? 'bg-[#008751] text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
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

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

const ACTIVITY_LABELS: Record<ManuscriptStatus, string> = {
  DRAFT: 'moved to draft',
  SUBMITTED: 'was submitted',
  EDITOR_REVIEW: 'entered desk screening',
  UNDER_REVIEW: 'entered peer review',
  REVISION_REQUESTED: 'was sent back for revision',
  AWAITING_DECISION: 'reached the decision gate',
  ACCEPTED: 'was accepted',
  PUBLISHED: 'was published',
  REJECTED: 'was rejected',
};

function DashboardOverviewScreen({ items, stageCounts, pendingApprovals, recentActivity, overdueReviews, profiles, loading }: {
  items: ManuscriptRow[];
  stageCounts: { submitted: number; underReview: number; awaitingDecision: number; done: number };
  pendingApprovals: number;
  recentActivity: StatusHistoryRow[];
  overdueReviews: OverdueReviewRow[];
  profiles: Record<string, ProfileRow>;
  loading: boolean;
}) {
  const now = useLiveClock();
  const screeningCount = items.filter((m) => m.status === 'EDITOR_REVIEW').length;
  const productionCount = items.filter((m) => ['ACCEPTED', 'PUBLISHED'].includes(m.status)).length;
  const SLA_SCREENING_DAYS = 7;
  const overdueSubmissions = items.filter((m) => m.status === 'SUBMITTED' && m.submitted_at && (Date.now() - new Date(m.submitted_at).getTime()) / 86400000 > SLA_SCREENING_DAYS);
  const manuscriptsById = Object.fromEntries(items.map((m) => [m.id, m]));
  const hasSlaWarnings = overdueReviews.length > 0 || overdueSubmissions.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400 font-bold">Dashboard overview</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Monitor editorial pipeline, decisions backlog, and active SLAs.</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-slate-400" /> {now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
          <p className="mt-3 text-3xl font-black text-slate-900">{stageCounts.awaitingDecision}</p>
          <p className="mt-2 text-sm text-violet-700">Awaiting editorial judgment.</p>
          <div className="mt-4 h-2 rounded-full bg-violet-200">
            <div className="h-2 rounded-full bg-violet-600" style={{ width: `${Math.min(100, stageCounts.awaitingDecision * 8)}%` }} />
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
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
            ) : !hasSlaWarnings ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No active SLA exceptions right now.</div>
            ) : (
              <>
                {overdueReviews.map((review) => {
                  const manuscript = manuscriptsById[review.manuscript_id];
                  const reviewer = profiles[review.reviewer_id];
                  const daysOverdue = Math.max(1, Math.floor((Date.now() - new Date(review.due_date).getTime()) / 86400000));
                  return (
                    <div key={review.id} className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
                      <p className="text-sm font-bold text-rose-700">{manuscript ? manuscript.title : review.manuscript_id} — Overdue Review Round</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Assigned reviewer {reviewer?.name || 'Unknown reviewer'} is overdue on decision feedback by {daysOverdue} day{daysOverdue === 1 ? '' : 's'}.
                      </p>
                    </div>
                  );
                })}
                {overdueSubmissions.length > 0 && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                    <p className="text-sm font-bold text-amber-700">Desk Screening Threshold Warning</p>
                    <p className="mt-1 text-sm text-slate-600">{overdueSubmissions.length} submission{overdueSubmissions.length === 1 ? '' : 's'} have been in unassigned screening queue for over the SLA limit of {SLA_SCREENING_DAYS} days.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-bold">Recent pipeline activity</p>
            <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Live</span>
          </div>
          <div className="mt-4 space-y-4 text-sm text-slate-700">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
            ) : recentActivity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No pipeline activity yet.</div>
            ) : (
              recentActivity.map((event, idx) => {
                const manuscript = manuscriptsById[event.manuscript_id];
                const actor = event.actor_id ? profiles[event.actor_id] : null;
                return (
                  <div key={event.id} className={idx < recentActivity.length - 1 ? 'border-b border-slate-200 pb-3' : ''}>
                    <p className="font-semibold text-slate-900">
                      {manuscript ? manuscript.title : event.manuscript_id} {ACTIVITY_LABELS[event.to_status] || 'was updated'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">By: {actor?.name || 'System'}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{formatRelativeTime(event.created_at)}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ManuscriptQueueScreen({ items, filtered, loading, search, onSearch, onOpen, onRefresh, tab, setTab, stageCounts }: { items: ManuscriptRow[]; filtered: ManuscriptRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onOpen: (id: string | null) => void; onRefresh: () => void; tab: string; setTab: (value: string) => void; stageCounts?: { all: number; submitted: number; editorReview: number; underReview: number; awaitingDecision: number; done: number }; }) {
  const getStageCount = (stageKey: string) => {
    if (!stageCounts) return 0;
    switch (stageKey) {
      case 'ALL': return stageCounts.all;
      case 'SUBMITTED': return stageCounts.submitted;
      case 'EDITOR_REVIEW': return stageCounts.editorReview;
      case 'UNDER_REVIEW': return stageCounts.underReview;
      case 'AWAITING_DECISION': return stageCounts.awaitingDecision;
      case 'DONE': return stageCounts.done;
      default: return 0;
    }
  };

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
                const count = getStageCount(stage.key);
                return (
                  <button
                    key={stage.key}
                    onClick={() => { setTab(stage.key); onOpen(null); }}
                    className={`rounded-full px-4 py-2 text-[11px] font-semibold transition ${active ? 'bg-[#008751] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {stage.label}
                    {count > 0 && <span className={`ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${active ? 'bg-white/20' : 'bg-slate-200'}`}>{count}</span>}
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

function PublishersScreen({ profiles, loading, search, onSearch, onInvitePublisher, onPublisherDetails }: { profiles: ProfileRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onInvitePublisher: () => void; onPublisherDetails: (publisher: ProfileRow) => void; }) {
  const totalPublishers = profiles.length;
  const activePublishers = profiles.filter((p) => p.status === 'ACTIVE').length;
  const pendingInvitations = profiles.filter((p) => p.status === 'PENDING_APPROVAL' || p.status === 'INVITED').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Publishers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage publisher accounts for accepted manuscripts moving into production.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onInvitePublisher} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] transition">
            <UserPlus className="w-4 h-4" /> Invite Publisher
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-violet-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total Publishers</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{totalPublishers}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-emerald-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Active</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{activePublishers}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-amber-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Pending</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{pendingInvitations}</p>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Search publishers</p>
            <p className="mt-1 text-sm text-slate-600">Find publishers by name, email, or status.</p>
          </div>
          <div className="min-w-[260px]">
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search publisher name or email"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            <tr>
              <th className="px-4 py-3">Publisher</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">Loading publisher profiles...</td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">No publishers found. Invite one to get started.</td>
              </tr>
            ) : (
              profiles.map((profile) => {
                const status = profile.status === 'ACTIVE' ? 'Active' : profile.status === 'INVITED' || profile.status === 'PENDING_APPROVAL' ? 'Pending' : profile.status === 'DECLINED' ? 'Declined' : 'Active';
                return (
                  <tr key={profile.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 font-semibold text-slate-900">{profile.name || 'Unknown Publisher'}</td>
                    <td className="px-4 py-4 text-slate-600">{profile.email}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button onClick={() => onPublisherDetails(profile)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Profile</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvitePublisherModal({ open, onClose, name, email, organization, password, onNameChange, onEmailChange, onOrganizationChange, onPasswordChange, onGeneratePassword, onSubmit }: { open: boolean; onClose: () => void; name: string; email: string; organization: string; password: string; onNameChange: (value: string) => void; onEmailChange: (value: string) => void; onOrganizationChange: (value: string) => void; onPasswordChange: (value: string) => void; onGeneratePassword: () => void; onSubmit: () => void; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[30px] overflow-hidden bg-white shadow-2xl border border-slate-200">
        <div className="relative bg-slate-950 px-8 py-6">
          <div className="uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold">Publisher outreach</div>
          <h2 className="mt-3 text-2xl font-black text-white">Create publisher account</h2>
          <button onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-5 px-8 py-8 bg-slate-50">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Publisher name</label>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Jordan Lee"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Email address</label>
            <input
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="publisher@example.com"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Organization</label>
            <input
              value={organization}
              onChange={(e) => onOrganizationChange(e.target.value)}
              placeholder="Springer Nature"
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
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-xs text-violet-800">
            No email delivery is connected yet. The login credentials will be shown directly in the coordinator dashboard after the account is created.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={onClose} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={onSubmit} className="rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043]">
              Create Publisher Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GDMembersScreen({ profiles, loading, search, onSearch, onInviteGDMember, onGDMemberDetails }: { profiles: ProfileRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onInviteGDMember: () => void; onGDMemberDetails: (member: ProfileRow) => void; }) {
  const totalMembers = profiles.length;
  const activeMembers = profiles.filter((p) => p.status === 'ACTIVE').length;
  const pendingInvitations = profiles.filter((p) => p.status === 'PENDING_APPROVAL' || p.status === 'INVITED').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">GD Members</h1>
          <p className="text-sm text-slate-500 mt-1">Manage internal production/copyediting staff accounts, distinct from Publisher accounts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onInviteGDMember} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] transition">
            <UserPlus className="w-4 h-4" /> Create GD Member
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-teal-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total GD Members</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{totalMembers}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-emerald-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Active</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{activeMembers}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 border-l-4 border-amber-500">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Pending</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{pendingInvitations}</p>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Search GD Members</p>
            <p className="mt-1 text-sm text-slate-600">Find GD Members by name, email, or status.</p>
          </div>
          <div className="min-w-[260px]">
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search GD Member name or email"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            <tr>
              <th className="px-4 py-3">GD Member</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">Loading GD Member profiles...</td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">No GD Members found. Create one to get started.</td>
              </tr>
            ) : (
              profiles.map((profile) => {
                const status = profile.status === 'ACTIVE' ? 'Active' : profile.status === 'INVITED' || profile.status === 'PENDING_APPROVAL' ? 'Pending' : profile.status === 'DECLINED' ? 'Declined' : 'Active';
                return (
                  <tr key={profile.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 font-semibold text-slate-900">{profile.name || 'Unknown GD Member'}</td>
                    <td className="px-4 py-4 text-slate-600">{profile.email}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button onClick={() => onGDMemberDetails(profile)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Profile</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InviteGDMemberModal({ open, onClose, name, email, password, onNameChange, onEmailChange, onPasswordChange, onGeneratePassword, onSubmit }: { open: boolean; onClose: () => void; name: string; email: string; password: string; onNameChange: (value: string) => void; onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void; onGeneratePassword: () => void; onSubmit: () => void; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[30px] overflow-hidden bg-white shadow-2xl border border-slate-200">
        <div className="relative bg-slate-950 px-8 py-6">
          <div className="uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold">Production team</div>
          <h2 className="mt-3 text-2xl font-black text-white">Create GD Member account</h2>
          <button onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-5 px-8 py-8 bg-slate-50">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Name</label>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Jordan Lee"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Username / Email</label>
            <input
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="gdmember@example.com"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold">Generate Password</label>
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
          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-xs text-teal-800">
            No email delivery is connected yet. The login credentials will be shown directly in the coordinator dashboard after the account is created.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={onClose} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={onSubmit} className="rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043]">
              Create Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotAvailableScreen({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">{title}</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">{title}</h1>
      </div>
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
        <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-700">Not available yet</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{text}</p>
      </div>
    </div>
  );
}

function AuditTrailScreen({ manuscripts }: { manuscripts: ManuscriptRow[] }) {
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [actors, setActors] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getRecentAuditLog(100);
        if (cancelled) return;
        setEntries(rows);
        const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id)));
        setActors(actorIds.length > 0 ? await getProfilesByIds(actorIds) : {});
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load the audit log');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const manuscriptsById = Object.fromEntries(manuscripts.map((m) => [m.id, m]));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">Audit Trail</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Audit Trail</h1>
        <p className="text-sm text-slate-500 mt-1">Every workflow transition recorded by the system, most recent first.</p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
      ) : error ? (
        <div className="bg-white border border-dashed border-red-200 rounded-2xl p-12 text-center text-sm text-red-500">{error}</div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <Activity className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">No audit events yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {entries.map((e) => {
            const manuscript = e.manuscript_id ? manuscriptsById[e.manuscript_id] : null;
            const actor = e.actor_id ? actors[e.actor_id] : null;
            return (
              <div key={e.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{e.action}{manuscript ? ` — ${manuscript.title}` : e.manuscript_id ? ` — ${e.manuscript_id}` : ''}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    By: {actor?.name || 'System'}
                    {e.before_status && e.after_status && e.before_status !== e.after_status ? ` • ${e.before_status} → ${e.after_status}` : ''}
                  </p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{formatDate(e.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportsAnalyticsScreen({ totalCount, stageCounts, pendingApprovals, editors, reviewers }: { totalCount: number; stageCounts: { submitted: number; underReview: number; awaitingDecision: number; done: number; }; pendingApprovals: number; editors: number; reviewers: number; }) {
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
          <p className="mt-3 text-3xl font-black text-slate-900">{stageCounts.awaitingDecision}</p>
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
