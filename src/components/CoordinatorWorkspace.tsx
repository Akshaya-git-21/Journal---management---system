import { useEffect, useRef, useState, type FC, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ManuscriptStatus } from '../types';
import { supabase } from '../lib/supabase';
import { createEditorAccount, createReviewerAccount, createAndActivatePublisherAccount, createAndActivateGDMemberAccount } from '../lib/auth';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, StatusHistoryRow, SuggestedReviewerRow, ProfileRow, AuditLogRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, getStatusHistory, getSuggestedReviewers,
  listManagedProfilesByRole, listPendingApprovals, approveUserRole, getProfilesByIds, assignEditor, assignReviewers, publishDecision, markPublished, sendToPublisher,
  subscribeToManuscripts, PublishDecision, getRevisions, RevisionRow, getReviewerAssignmentCounts,
  getRecentStatusHistory, getOverdueReviewerAssignments, OverdueReviewRow, getRecentAuditLog,
  notifyExpiredReviewerReplacements, deleteManuscripts
} from '../lib/workflow';
import { getManuscriptStatusLabel, getRoleAwareStatusLabel, getLatestRevision, getRevisionMeta, STANDARD_STATUS_COLORS } from '../lib/manuscriptStatusLabel';
import { listProduction, subscribeToProduction } from '../lib/production';
import CoordinatorManuscriptDetail from './CoordinatorManuscriptDetail';
import CoordinatorRevisionManager from './CoordinatorRevisionManager';
import EditorDetailsModal from './EditorDetailsModal';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import { Loader2, ArrowLeft, Clock, LayoutDashboard, FileText, Users, BarChart3, BookOpen, Mail, Settings, ShieldCheck, Plus, Download, RefreshCcw, CheckCircle2, UserPlus, X, Eye, FileQuestionMark, ClipboardList, MessageCircle, SlidersHorizontal, Activity, Building2, LayoutGrid, Cog, Inbox, Printer, PackageCheck, FileCheck2, MessageSquareWarning, Send, Monitor, GraduationCap, CloudUpload, CalendarDays, Bell, Trash2 } from 'lucide-react';
import { SidebarBrand, SidebarDecoration, TopBar } from './RoleChrome';
import { StatusStatCard } from './StatusStatCard';
import { SidebarThemeContext } from './sidebarTheme';
import { NavGroup, NavItem } from './SidebarNavGroup';
import { AssignmentConfirmationDialog } from './AssignmentConfirmationDialog';
import { JMS_OPEN_MANUSCRIPT_EVENT, JmsOpenManuscriptDetail } from './NotificationBell';
import { MemberRowActions, EditMemberModal, DeleteMemberModal } from "./MemberManagement";
import ReportsAnalyticsDashboard from './ReportsAnalyticsDashboard';
import SettingsScreen from './SettingsScreen';
import { loadSettings, useJournalSettings } from '../lib/settings';
import { SLA_DISMISSED_KEY, formatDisplayDate, getDisplayPrefs, zoneOptions } from '../lib/displayPrefs';
import ProductionSection from './production/ProductionSection';
import JournalTemplateSection from './production/JournalTemplateSection';

interface CoordinatorWorkspaceProps {
  manuscripts?: any[];
  onUpdateManuscript?: (manuscript: any) => void;
  currentUser?: { name: string; email: string; role: string } | null;
  onSignOut?: () => void;
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

function StatusBadge({ manuscript, latestRevision, productionStatus }: { manuscript: ManuscriptRow; latestRevision?: RevisionRow | null; productionStatus?: string | null }) {
  const label = getRoleAwareStatusLabel(manuscript, 'COORDINATOR', latestRevision, productionStatus);
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

export default function CoordinatorWorkspace({ currentUser, onSignOut }: CoordinatorWorkspaceProps) {
  const [items, setItems] = useState<ManuscriptRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ProfileRow[]>([]);
  const [editorialBoardProfiles, setEditorialBoardProfiles] = useState<ProfileRow[]>([]);
  const [reviewerProfiles, setReviewerProfiles] = useState<ProfileRow[]>([]);
  const [publisherProfiles, setPublisherProfiles] = useState<ProfileRow[]>([]);
  const [reviewerAssignmentCounts, setReviewerAssignmentCounts] = useState<Record<string, { invited: number; accepted: number; completed: number }>>({});
  const [recentActivity, setRecentActivity] = useState<StatusHistoryRow[]>([]);
  const [overdueReviews, setOverdueReviews] = useState<OverdueReviewRow[]>([]);
  const [activityProfiles, setActivityProfiles] = useState<Record<string, ProfileRow>>({});
  // manuscript_id -> production_status, so the Manuscript Queue's status
  // badge reflects the actual proof/review sub-stage (PROOFREADING vs
  // PRODUCTION PREPARATION vs IN PUBLISH) instead of the coarse legacy
  // production_stage field alone -- same overlay getManuscriptStatusLabel()
  // already applies everywhere else (Author/Editor/GD queues).
  const [productionByManuscript, setProductionByManuscript] = useState<Record<string, string>>({});
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
  const [memberToEdit, setMemberToEdit] = useState<ProfileRow | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<ProfileRow | null>(null);

  // Journal-wide settings (SLA days, default review deadline, password rules...) and the
  // journal name shown in the browser tab.
  const journalSettings = useJournalSettings();
  useEffect(() => { loadSettings().catch(() => {}); }, []);
  useEffect(() => {
    document.title = journalSettings.profile.name || 'Journal Management System';
  }, [journalSettings.profile.name]);

  // Lazily surface any reviewer-replacement deadline that expired with no
  // Editor action taken -- idempotent (see notify_expired_reviewer_replacements
  // in 0034_reviewer_replacement_round_isolation.sql), safe to call every
  // time the Coordinator lands on their dashboard.
  useEffect(() => {
    notifyExpiredReviewerReplacements().catch(() => {});
  }, []);

  // Clicking a manuscript-linked notification jumps straight to that
  // manuscript, same pattern as EditorWorkspace.
  useEffect(() => {
    const onOpenManuscript = (e: Event) => {
      const detail = (e as CustomEvent<JmsOpenManuscriptDetail>).detail;
      if (!detail) return;
      setActiveSection('MANUSCRIPT_QUEUE');
      setSelectedId(detail.manuscriptId);
    };
    window.addEventListener(JMS_OPEN_MANUSCRIPT_EVENT, onOpenManuscript);
    return () => window.removeEventListener(JMS_OPEN_MANUSCRIPT_EVENT, onOpenManuscript);
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
      const [rows, approvals, editors, reviewers, publishers, gdMembers, activity, overdue, production] = await Promise.all([
        listManuscripts(),
        listPendingApprovals(),
        listManagedProfilesByRole('EDITOR'),
        listManagedProfilesByRole('REVIEWER'),
        listManagedProfilesByRole('PUBLISHER'),
        listManagedProfilesByRole('GD_MEMBER'),
        getRecentStatusHistory(8),
        getOverdueReviewerAssignments(),
        listProduction(),
      ]);
      setProductionByManuscript(Object.fromEntries(production.map((p) => [p.manuscript_id, p.production_status])));
      // A manuscript stays DRAFT until the author actually clicks Submit
      // (Save Draft alone creates one) -- Coordinators should never see it
      // before then. RLS also enforces this server-side (see
      // 0085_hide_draft_manuscripts_from_coordinator.sql); this filter is
      // just defense-in-depth on the client.
      setItems(rows.filter((m) => m.status !== 'DRAFT'));
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

  // production_status lives in a separate table (manuscript_production) --
  // subscribeToManuscripts() above only fires on the manuscripts table
  // itself, so without this the queue's status badge would go stale the
  // moment a manuscript moves through the proof/review loop without also
  // touching manuscripts.
  useEffect(() => {
    const unsubscribe = subscribeToProduction(load);
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
    <div id="coordinator-workspace" className="flex-1 min-h-0 bg-[#f6fbf9] text-[#111827] flex flex-col font-sans">
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden min-h-0">
        <aside className="w-full md:w-[220px] xl:w-[270px] bg-gradient-to-b from-[#def2ec] via-[#f4f3e8] to-[#e4eedd] border-r border-[#d9dccb] shrink-0 text-[#1f3b30] overflow-y-auto overflow-x-hidden flex flex-col">
          <SidebarThemeContext.Provider value="light">
          <SidebarBrand />
          <div className="px-5 pb-6">
            <NavGroup title="Workspace" icon={<LayoutGrid className="w-4 h-4" />} hasActive={isDashboardSection || isManuscriptQueueSection || isPendingApprovalsSection} expanded={expandedNavGroups.workspace} onToggle={() => toggleNavGroup('workspace')}>
              <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active={isDashboardSection} onClick={() => { setActiveSection('DASHBOARD'); setSelectedId(null); }} />
              <NavItem icon={<ClipboardList className="w-4 h-4" />} label="Manuscript Queue" active={isManuscriptQueueSection} onClick={() => { setActiveSection('MANUSCRIPT_QUEUE'); setSelectedId(null); }} />
              <NavItem icon={<ShieldCheck className="w-4 h-4" />} label="Pending Approvals" active={isPendingApprovalsSection} onClick={() => { setActiveSection('PENDING_APPROVALS'); setSelectedId(null); }} />
            </NavGroup>

            <NavGroup title="People" icon={<Users className="w-4 h-4" />} hasActive={isEditorialBoardSection || isReviewersSection || isPublishersSection || isGDMembersSection} expanded={expandedNavGroups.people} onToggle={() => toggleNavGroup('people')}>
              <NavItem icon={<BookOpen className="w-4 h-4" />} label="Editorial Board" active={isEditorialBoardSection} onClick={() => { setActiveSection('EDITORIAL_BOARD'); setSelectedId(null); }} />
              <NavItem icon={<Users className="w-4 h-4" />} label="Reviewers" active={isReviewersSection} onClick={() => { setActiveSection('REVIEWERS'); setSelectedId(null); }} />
              <NavItem icon={<Building2 className="w-4 h-4" />} label="Publishers" active={isPublishersSection} onClick={() => { setActiveSection('PUBLISHERS'); setSelectedId(null); }} />
              <NavItem icon={<PackageCheck className="w-4 h-4" />} label="GD Members" active={isGDMembersSection} onClick={() => { setActiveSection('GD_MEMBERS'); setSelectedId(null); }} />
            </NavGroup>

            <NavGroup title="System" icon={<Cog className="w-4 h-4" />} hasActive={isReportsSection || isCommunicationsSection || isSettingsSection || isAuditTrailSection} expanded={expandedNavGroups.system} onToggle={() => toggleNavGroup('system')}>
              <NavItem icon={<BarChart3 className="w-4 h-4" />} label="Reports & Analytics" active={isReportsSection} onClick={() => { setActiveSection('REPORTS'); setSelectedId(null); }} />
              <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" active={isSettingsSection} onClick={() => { setActiveSection('SETTINGS'); setSelectedId(null); }} />
              <NavItem icon={<Activity className="w-4 h-4" />} label="Audit Trail" active={isAuditTrailSection} onClick={() => { setActiveSection('AUDIT_TRAIL'); setSelectedId(null); }} />
            </NavGroup>
          </div>
          <SidebarDecoration />
          </SidebarThemeContext.Provider>
        </aside>

        <div className="flex-1 min-w-0 bg-gradient-to-b from-[#eaf6f1] via-[#f7f6ec] to-[#eaf2e3] overflow-hidden flex flex-col min-h-0">
          <TopBar user={currentUser} onSignOut={onSignOut} tinted />
          <main className="role-tint flex-1 p-6 md:p-8 overflow-y-auto text-left flex flex-col gap-5">
            {isDashboardSection ? (
              <DashboardOverviewScreen
                items={items}
                stageCounts={stageCounts}
                pendingApprovals={pendingApprovals.length}
                recentActivity={recentActivity}
                overdueReviews={overdueReviews}
                profiles={activityProfiles}
                loading={loading}
                onOpenManuscript={(id) => { setActiveSection('MANUSCRIPT_QUEUE'); setSelectedId(id); }}
                onOpenUnassigned={() => { setActiveSection('MANUSCRIPT_QUEUE'); setSelectedId(null); setTab('SUBMITTED'); }}
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
                  productionByManuscript={productionByManuscript}
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
                onEdit={setMemberToEdit}
                onDelete={setMemberToDelete}
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
                onEdit={setMemberToEdit}
                onDelete={setMemberToDelete}
              />
            ) : isPublishersSection ? (
              <PublishersScreen
                profiles={filteredPublishers}
                loading={loading}
                search={publisherSearch}
                onSearch={setPublisherSearch}
                onInvitePublisher={handleOpenPublisherInvite}
                onPublisherDetails={setSelectedEditorForDetails}
                onEdit={setMemberToEdit}
                onDelete={setMemberToDelete}
              />
            ) : isGDMembersSection ? (
              <GDMembersScreen
                profiles={filteredGDMembers}
                loading={loading}
                search={gdMemberSearch}
                onSearch={setGdMemberSearch}
                onInviteGDMember={handleOpenGDMemberInvite}
                onGDMemberDetails={setSelectedEditorForDetails}
                onEdit={setMemberToEdit}
                onDelete={setMemberToDelete}
              />
            ) : isReportsSection ? (
              <ReportsAnalyticsDashboard items={items} editors={editorialBoardProfiles.filter((p) => p.status === 'ACTIVE')} reviewers={reviewerProfiles.filter((p) => p.status === 'ACTIVE')} pendingApprovals={pendingApprovals.length} overdueReviews={overdueReviews.length} productionByManuscript={productionByManuscript} />
            ) : isCommunicationsSection ? (
              <NotAvailableScreen title="Communications" text="Coordinator-wide messaging is not connected to a data source yet." />
            ) : isSettingsSection ? (
              <SettingsScreen items={items} editors={editorialBoardProfiles} reviewers={reviewerProfiles} publishers={publisherProfiles} gdMembers={gdMemberProfiles} />
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
          {memberToEdit && (
            <EditMemberModal member={memberToEdit} onClose={() => setMemberToEdit(null)} onSaved={load} />
          )}
          {memberToDelete && (
            <DeleteMemberModal
              member={memberToDelete}
              onClose={() => setMemberToDelete(null)}
              onDeleted={async (mode) => {
                await load();
                if (mode === "deactivated") window.alert(`${memberToDelete.name || memberToDelete.email} has workflow history, so the account was closed (it can no longer sign in) instead of erased.`);
              }}
            />
          )}
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
  return formatDisplayDate(iso);
}

function QueueTable({ items, onOpen, onDeleted, selectMode, onExitSelectMode, productionByManuscript }: { items: ManuscriptRow[]; onOpen: (id: string) => void; onDeleted: () => void | Promise<void>; selectMode: boolean; onExitSelectMode: () => void; productionByManuscript?: Record<string, string> }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<ManuscriptRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Leaving delete mode drops any selection.
  useEffect(() => { if (!selectMode) setSelected(new Set()); }, [selectMode]);
  const itemsPerPage = getDisplayPrefs().rowsPerPage;
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const activePage = Math.min(currentPage, Math.max(1, totalPages));
  const startIdx = (activePage - 1) * itemsPerPage;
  const paginatedItems = items.slice(startIdx, startIdx + itemsPerPage);

  // Selection only ever counts manuscripts that are still in the (filtered) list.
  const selectedItems = items.filter((m) => selected.has(m.id));
  const pageIds = paginatedItems.map((m) => m.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleOne = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const togglePage = () => setSelected((prev) => { const next = new Set(prev); pageIds.forEach((id) => (allPageSelected ? next.delete(id) : next.add(id))); return next; });
  const closeDeleteDialog = () => { if (deleting) return; setPendingDelete(null); setDeleteError(null); };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteManuscripts(pendingDelete.map((m) => m.id));
      setSelected((prev) => { const next = new Set(prev); pendingDelete.forEach((m) => next.delete(m.id)); return next; });
      setPendingDelete(null);
      onExitSelectMode();
      await onDeleted();
    } catch (err: any) {
      setDeleteError(err.message || "Unable to delete the selected manuscripts.");
    } finally {
      setDeleting(false);
    }
  };

  if (items.length === 0) {
    return <div className="text-center py-20 text-sm text-slate-400 bg-white border border-dashed border-slate-300 rounded-2xl">No manuscripts in this stage.</div>;
  }

  return (
    <div className="space-y-4">
      {selectMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-900">{selectedItems.length === 0 ? "Select the manuscripts you want to delete" : `${selectedItems.length} manuscript${selectedItems.length === 1 ? "" : "s"} selected`}</p>
          <div className="flex items-center gap-2">
            {selectedItems.length < items.length && (
              <button onClick={() => setSelected(new Set(items.map((m) => m.id)))} className="rounded-full border border-rose-200 bg-white px-4 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100">Select all {items.length}</button>
            )}
            <button onClick={onExitSelectMode} className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={() => setPendingDelete(selectedItems)} disabled={selectedItems.length === 0} className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 className="w-3.5 h-3.5" /> Delete selected</button>
          </div>
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            <tr>
              {selectMode && <th className="px-4 py-3 w-10"><input type="checkbox" aria-label="Select all manuscripts on this page" checked={allPageSelected} onChange={togglePage} className="h-4 w-4 rounded border-slate-300 accent-rose-600 cursor-pointer" /></th>}
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
              <tr key={m.id} className={`hover:bg-slate-50 cursor-pointer ${selected.has(m.id) ? "bg-rose-50/70" : ""}`} onClick={() => (selectMode ? toggleOne(m.id) : onOpen(m.id))}>
                {selectMode && <td className="px-4 py-3 w-10"><input type="checkbox" aria-label={`Select ${m.title}`} checked={selected.has(m.id)} onChange={() => toggleOne(m.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-slate-300 accent-rose-600 cursor-pointer" /></td>}
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.id}</td>
                <td className="px-4 py-3 font-bold text-slate-800 max-w-xs truncate">{m.title}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{m.author_name}</td>
                <td className="px-4 py-3"><StatusBadge manuscript={m} productionStatus={productionByManuscript?.[m.id]} /></td>
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
              onClick={() => setCurrentPage(Math.max(1, activePage - 1))}
              disabled={activePage === 1}
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
                    page === activePage
                      ? 'bg-[#008751] text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))}
              disabled={activePage === totalPages}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={closeDeleteDialog}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900">Delete {pendingDelete.length === 1 ? "manuscript" : `${pendingDelete.length} manuscripts`}?</h2>
            <p className="mt-2 text-sm text-slate-600">This permanently removes {pendingDelete.length === 1 ? "this manuscript" : "these manuscripts"} together with all reviews, assignments, revisions, discussions and production records. This cannot be undone.</p>
            <ul className="mt-3 max-h-40 overflow-y-auto rounded-2xl bg-slate-50 border border-slate-200 divide-y divide-slate-100 text-xs">
              {pendingDelete.slice(0, 8).map((m) => (
                <li key={m.id} className="px-3 py-2"><span className="font-mono text-slate-400">{m.id}</span> <span className="font-semibold text-slate-800">{m.title}</span></li>
              ))}
              {pendingDelete.length > 8 && <li className="px-3 py-2 text-slate-500">…and {pendingDelete.length - 8} more</li>}
            </ul>
            {deleteError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{deleteError}</div>}
            <div className="mt-5 flex gap-2">
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
              </button>
              <button onClick={closeDeleteDialog} disabled={deleting} className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
            </div>
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

type EditorialCategory = 'CHIEF' | 'BOARD' | 'ASSOCIATE' | 'SECTION';

/** The member's "Editorial board role" (stored in metadata.editorial_role when the
 * account is created or edited) -- anything unset counts as plain Editorial Board. */
function editorialCategoryOf(profile: ProfileRow): EditorialCategory {
  const role = String(profile.metadata?.editorial_role || '').toLowerCase();
  if (role.includes('chief')) return 'CHIEF';
  if (role.includes('associate')) return 'ASSOCIATE';
  if (role.includes('section')) return 'SECTION';
  return 'BOARD';
}

const EDITORIAL_CATEGORY_LABELS: Record<EditorialCategory, string> = {
  CHIEF: 'Editor-in-Chief',
  BOARD: 'Editorial Board',
  ASSOCIATE: 'Associate Editor',
  SECTION: 'Section Editor',
};

function EditorialBoardScreen({ profiles, loading, search, onSearch, onInvite, onExport, onEditorDetails, onEdit, onDelete }: { profiles: ProfileRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onInvite: () => void; onExport: () => void; onEditorDetails: (editor: ProfileRow) => void; onEdit: (member: ProfileRow) => void; onDelete: (member: ProfileRow) => void; }) {
  const [activeTab, setActiveTab] = useState<'ALL' | EditorialCategory>('ALL');
  const totalMembers = profiles.length;
  const activeMembers = profiles.filter((p) => p.status === 'ACTIVE').length;
  const invitedMembers = profiles.filter((p) => p.status === 'INVITED').length;
  const inactiveMembers = profiles.filter((p) => p.status === 'INACTIVE').length;
  const categoryCounts: Record<EditorialCategory, number> = { CHIEF: 0, BOARD: 0, ASSOCIATE: 0, SECTION: 0 };
  profiles.forEach((p) => { categoryCounts[editorialCategoryOf(p)] += 1; });
  const categoryTabs: { key: EditorialCategory; label: string }[] = [
    { key: 'CHIEF', label: 'Editor-in-Chief' },
    { key: 'BOARD', label: 'Editorial Board' },
    { key: 'ASSOCIATE', label: 'Associate Editors' },
    { key: 'SECTION', label: 'Section Editors' },
  ];

  const filteredProfiles = profiles.filter((profile) => activeTab === 'ALL' || editorialCategoryOf(profile) === activeTab);

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
          {categoryTabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`rounded-full px-4 py-2 text-xs font-semibold ${activeTab === tab.key ? 'bg-[#0f766e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {tab.label} ({categoryCounts[tab.key]})
            </button>
          ))}
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
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{activeTab === 'ALL' ? 'No editors found.' : 'No members with this editorial board role.'}</td></tr>
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
                          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{EDITORIAL_CATEGORY_LABELS[editorialCategoryOf(profile)]}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusColor}`}>
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusText === 'active' ? 'bg-emerald-700' : statusText === 'invited' ? 'bg-blue-700' : 'bg-slate-500'}`} />
                            {profile.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{joinedOn}</td>
                        <td className="px-4 py-4 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1"><button type="button" title="View" aria-label={`View ${profile.name}`} onClick={() => onEditorDetails(profile)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"><Eye className="h-4 w-4" /></button><MemberRowActions profile={profile} onEdit={onEdit} onDelete={onDelete} /></span></td>
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
                  { label: 'Editor-in-Chief', count: categoryCounts.CHIEF, pct: totalMembers ? Math.round((categoryCounts.CHIEF / totalMembers) * 100) : 0 },
                  { label: 'Associate Editors', count: categoryCounts.ASSOCIATE, pct: totalMembers ? Math.round((categoryCounts.ASSOCIATE / totalMembers) * 100) : 0 },
                  { label: 'Section Editors', count: categoryCounts.SECTION, pct: totalMembers ? Math.round((categoryCounts.SECTION / totalMembers) * 100) : 0 },
                  { label: 'Editorial Board', count: categoryCounts.BOARD, pct: totalMembers ? Math.round((categoryCounts.BOARD / totalMembers) * 100) : 0 },
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

const SWIPE_DISTANCE = 110;

/** Alerts the Coordinator has swiped away after reading them (remembered per browser). */
function useDismissedAlerts() {
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(SLA_DISMISSED_KEY) || "[]"); } catch { return []; }
  });
  const save = (next: string[]) => {
    setDismissed(next);
    try { localStorage.setItem(SLA_DISMISSED_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  return {
    dismissed,
    dismiss: (key: string) => save(dismissed.includes(key) ? dismissed : [...dismissed, key]),
    restoreAll: () => save([]),
  };
}

/** Card that can be swiped left or right (touch or mouse) to dismiss it. A tap
 * still activates it, but a drag never does. */
const SwipeableAlert: FC<{ onDismiss: () => void; onOpen: () => void; title: string; className: string; children: ReactNode }> = ({ onDismiss, onOpen, title, className, children }) => {
  const dragged = useRef(false);
  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      title={title}
      className={className + " touch-pan-y select-none"}
      drag="x"
      dragDirectionLock
      dragSnapToOrigin
      dragElastic={0.6}
      onDragStart={() => { dragged.current = true; }}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > SWIPE_DISTANCE || Math.abs(info.velocity.x) > 600) onDismiss();
        setTimeout(() => { dragged.current = false; }, 0);
      }}
      onClick={() => { if (!dragged.current) onOpen(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDismiss(); }
      }}
      exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
};

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

function DashboardOverviewScreen({ items, stageCounts, pendingApprovals, recentActivity, overdueReviews, profiles, loading, onOpenManuscript, onOpenUnassigned }: {
  items: ManuscriptRow[];
  stageCounts: { submitted: number; underReview: number; awaitingDecision: number; done: number };
  pendingApprovals: number;
  recentActivity: StatusHistoryRow[];
  overdueReviews: OverdueReviewRow[];
  profiles: Record<string, ProfileRow>;
  loading: boolean;
  /** Open this manuscript's detail page. */
  onOpenManuscript: (manuscriptId: string) => void;
  /** Open the Manuscript Queue on its Unassigned tab. */
  onOpenUnassigned: () => void;
}) {
  const now = useLiveClock();
  // Make a card behave like a button (mouse + keyboard) without changing its markup.
  const clickable = (onActivate: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); } },
  });
  const screeningCount = items.filter((m) => m.status === 'EDITOR_REVIEW').length;
  const productionCount = items.filter((m) => ['ACCEPTED', 'PUBLISHED'].includes(m.status)).length;
  const SLA_SCREENING_DAYS = useJournalSettings().workflow.screeningSlaDays;
  const overdueSubmissions = items.filter((m) => m.status === 'SUBMITTED' && m.submitted_at && (Date.now() - new Date(m.submitted_at).getTime()) / 86400000 > SLA_SCREENING_DAYS);
  const manuscriptsById = Object.fromEntries(items.map((m) => [m.id, m]));
  const { dismissed, dismiss, restoreAll } = useDismissedAlerts();
  // The desk-screening alert comes back on its own if a different set of submissions goes overdue.
  const screeningKey = "screening:" + overdueSubmissions.map((m) => m.id).sort().join(",");
  const visibleReviews = overdueReviews.filter((r) => !dismissed.includes("review:" + r.id));
  const showScreening = overdueSubmissions.length > 0 && !dismissed.includes(screeningKey);
  const dismissedCount = (overdueReviews.length - visibleReviews.length) + (overdueSubmissions.length > 0 && !showScreening ? 1 : 0);
  const hasSlaWarnings = overdueReviews.length > 0 || overdueSubmissions.length > 0;
  const hasVisibleWarnings = visibleReviews.length > 0 || showScreening;

  const stageCards = [
    { key: 'submitted', title: 'Submitted', value: stageCounts.submitted, note: 'Awaiting technical screening check.', factor: 4, icon: <FileText className="w-5 h-5" />, tone: 'emerald' as const },
    { key: 'screening', title: 'Screening', value: screeningCount, note: 'Initial technical vetting.', factor: 8, icon: <Monitor className="w-5 h-5" />, tone: 'amber' as const },
    { key: 'peer', title: 'Under review', value: stageCounts.underReview, note: 'Active external review reports.', factor: 8, icon: <Users className="w-5 h-5" />, tone: 'sky' as const },
    { key: 'decision', title: 'Decision', value: stageCounts.awaitingDecision, note: 'Awaiting editorial judgment.', factor: 8, icon: <GraduationCap className="w-5 h-5" />, tone: 'violet' as const },
    { key: 'production', title: 'Production', value: productionCount, note: 'Injecting DOI variables.', factor: 8, icon: <CloudUpload className="w-5 h-5" />, tone: 'emerald' as const },
  ];

  // Icon tile per pipeline event -- purely presentational.
  const activityIcon = (status: ManuscriptStatus) => {
    switch (status) {
      case 'SUBMITTED': return { icon: <FileText className="w-4 h-4" />, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'EDITOR_REVIEW': return { icon: <ClipboardList className="w-4 h-4" />, tone: 'bg-violet-50 text-violet-700 border-violet-200' };
      case 'UNDER_REVIEW': return { icon: <Users className="w-4 h-4" />, tone: 'bg-sky-50 text-sky-700 border-sky-200' };
      case 'AWAITING_DECISION': return { icon: <ClipboardList className="w-4 h-4" />, tone: 'bg-violet-50 text-violet-700 border-violet-200' };
      default: return { icon: <RefreshCcw className="w-4 h-4" />, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-900 font-bold">Dashboard overview</p>
          <h1 className="mt-3 text-3xl font-black text-[#0a2e22]">Monitor editorial pipeline, decisions backlog, and active SLAs.</h1>
          <p className="mt-2 text-sm text-slate-500">Track manuscript progress, reviewer activities, and key actions across the journal workflow.</p>
        </div>
        <div className="inline-flex items-center gap-2.5 rounded-xl border border-[#d8e8e7] bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm shrink-0">
          <CalendarDays className="w-4 h-4 text-emerald-800" /> {now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', ...zoneOptions() })} · {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', ...zoneOptions() })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {stageCards.map((c) => (
          <StatusStatCard key={c.key} title={c.title} value={c.value} note={c.note} icon={c.icon} tone={c.tone} progress={c.value * c.factor} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2 items-start">
        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-3 text-lg font-bold text-[#0a2e22]"><Bell className="w-5 h-5 text-emerald-800" /> SLA Warning Exceptions</p>
            <span className="text-xs text-slate-400">{hasVisibleWarnings ? "Swipe a card away once read" : "Review required"}</span>
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
            ) : !hasSlaWarnings ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No active SLA exceptions right now.</div>
            ) : (
              <>
                {!hasVisibleWarnings && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">All caught up — every exception has been dismissed.</div>}
                <AnimatePresence initial={false}>
                {visibleReviews.map((review) => {
                  const manuscript = manuscriptsById[review.manuscript_id];
                  const reviewer = profiles[review.reviewer_id];
                  const daysOverdue = Math.max(1, Math.floor((Date.now() - new Date(review.due_date).getTime()) / 86400000));
                  return (
                    <SwipeableAlert key={review.id} onDismiss={() => dismiss("review:" + review.id)} onOpen={() => onOpenManuscript(review.manuscript_id)} title="Open this manuscript — or swipe to dismiss" className="flex gap-3 rounded-xl bg-rose-50 p-4 cursor-grab active:cursor-grabbing transition-colors hover:bg-rose-100 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-black text-white">!</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-rose-700">{manuscript ? manuscript.title : review.manuscript_id} — Overdue Review Round</p>
                        <p className="mt-1.5 text-sm text-slate-600">
                          Assigned reviewer {reviewer?.name || 'Unknown reviewer'} is overdue on decision feedback by {daysOverdue} day{daysOverdue === 1 ? '' : 's'}.
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{daysOverdue} day{daysOverdue === 1 ? '' : 's'} ago</span>
                    </SwipeableAlert>
                  );
                })}
                {showScreening && (
                  <SwipeableAlert key="screening" onDismiss={() => dismiss(screeningKey)} onOpen={onOpenUnassigned} title="Open the unassigned queue — or swipe to dismiss" className="flex gap-3 rounded-xl bg-amber-50 p-4 cursor-grab active:cursor-grabbing transition-colors hover:bg-amber-100 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-black text-white">!</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-amber-700">Desk Screening Threshold Warning</p>
                      <p className="mt-1.5 text-sm text-slate-600">{overdueSubmissions.length} submission{overdueSubmissions.length === 1 ? '' : 's'} have been in unassigned screening queue for over the SLA limit of {SLA_SCREENING_DAYS} days.</p>
                    </div>
                  </SwipeableAlert>
                )}
                </AnimatePresence>
                {dismissedCount > 0 && (
                  <button type="button" onClick={restoreAll} className="w-full rounded-xl border border-dashed border-slate-200 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">{dismissedCount} dismissed · Show again</button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-3 text-lg font-bold text-[#0a2e22]"><Activity className="w-5 h-5 text-emerald-800" /> Recent Pipeline Activity</p>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Live</span>
          </div>
          <div className="mt-4 text-sm text-slate-700">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
            ) : recentActivity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No pipeline activity yet.</div>
            ) : (
              recentActivity.map((event, idx) => {
                const manuscript = manuscriptsById[event.manuscript_id];
                const actor = event.actor_id ? profiles[event.actor_id] : null;
                const visual = activityIcon(event.to_status);
                return (
                  <div key={event.id} {...clickable(() => onOpenManuscript(event.manuscript_id))} title="Open this manuscript" className={`flex items-start gap-3 py-3.5 px-2 -mx-2 rounded-lg cursor-pointer transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${visual.tone}`}>{visual.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-900">
                        <span className="font-bold">{manuscript ? manuscript.title : event.manuscript_id}</span> {ACTIVITY_LABELS[event.to_status] || 'was updated'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">By: {actor?.name || 'System'}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatRelativeTime(event.created_at)}</span>
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

function ManuscriptQueueScreen({ items, filtered, loading, search, onSearch, onOpen, onRefresh, tab, setTab, stageCounts, productionByManuscript }: { items: ManuscriptRow[]; filtered: ManuscriptRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onOpen: (id: string | null) => void; onRefresh: () => void; tab: string; setTab: (value: string) => void; stageCounts?: { all: number; submitted: number; editorReview: number; underReview: number; awaitingDecision: number; done: number }; productionByManuscript?: Record<string, string>; }) {
  const [selectMode, setSelectMode] = useState(false);
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
            <button onClick={() => setSelectMode((v) => !v)} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold shadow-sm transition ${selectMode ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700" : "border-rose-200 bg-white text-rose-600 hover:bg-rose-50"}`}><Trash2 className="w-4 h-4" /> {selectMode ? "Cancel" : "Delete"}</button>
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
        <QueueTable items={filtered} onOpen={onOpen} onDeleted={onRefresh} selectMode={selectMode} onExitSelectMode={() => setSelectMode(false)} productionByManuscript={productionByManuscript} />
      )}
    </>
  );
}

function ReviewerDirectoryScreen({ profiles, assignmentCounts, loading, search, onSearch, onInviteReviewer, onReviewerDetails, onEdit, onDelete }: { profiles: ProfileRow[]; assignmentCounts: Record<string, { invited: number; accepted: number; completed: number }>; loading: boolean; search: string; onSearch: (value: string) => void; onInviteReviewer: () => void; onReviewerDetails: (reviewer: ProfileRow) => void; onEdit: (member: ProfileRow) => void; onDelete: (member: ProfileRow) => void; }) {
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
    status: profile.status === 'ACTIVE' ? 'Active' : profile.status === 'INVITED' || profile.status === 'PENDING_APPROVAL' ? 'Pending' : profile.status === 'DECLINED' ? 'Declined' : profile.status === 'INACTIVE' ? 'Inactive' : 'Active',
    specialty: profile.metadata?.specialization || profile.metadata?.expertise || '—',
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

      <div className="bg-white border border-slate-200 rounded-3xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            <tr>
              <th className="px-4 py-3">Reviewer</th>
              <th className="px-4 py-3">Specialty Area</th>
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
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">No reviewers found.</td>
              </tr>
            ) : (
              tableRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4 font-semibold text-slate-900">{row.name}</td>
                  <td className="px-4 py-4 text-slate-600">{row.specialty}</td>
                  <td className="px-4 py-4 text-slate-600">{row.invited}</td>
                  <td className="px-4 py-4 text-slate-600">{row.accepted}</td>
                  <td className="px-4 py-4 text-slate-600">{row.completed}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${row.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : row.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => onReviewerDetails(row.profile)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Profile</button>
                      <MemberRowActions profile={row.profile} onEdit={onEdit} onDelete={onDelete} />
                    </div>
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

function PublishersScreen({ profiles, loading, search, onSearch, onInvitePublisher, onPublisherDetails, onEdit, onDelete }: { profiles: ProfileRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onInvitePublisher: () => void; onPublisherDetails: (publisher: ProfileRow) => void; onEdit: (member: ProfileRow) => void; onDelete: (member: ProfileRow) => void; }) {
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

      <div className="bg-white border border-slate-200 rounded-3xl overflow-x-auto shadow-sm">
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
                const status = profile.status === 'ACTIVE' ? 'Active' : profile.status === 'INVITED' || profile.status === 'PENDING_APPROVAL' ? 'Pending' : profile.status === 'DECLINED' ? 'Declined' : profile.status === 'INACTIVE' ? 'Inactive' : 'Active';
                return (
                  <tr key={profile.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 font-semibold text-slate-900">{profile.name || 'Unknown Publisher'}</td>
                    <td className="px-4 py-4 text-slate-600">{profile.email}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => onPublisherDetails(profile)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Profile</button>
                        <MemberRowActions profile={profile} onEdit={onEdit} onDelete={onDelete} />
                      </div>
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

function GDMembersScreen({ profiles, loading, search, onSearch, onInviteGDMember, onGDMemberDetails, onEdit, onDelete }: { profiles: ProfileRow[]; loading: boolean; search: string; onSearch: (value: string) => void; onInviteGDMember: () => void; onGDMemberDetails: (member: ProfileRow) => void; onEdit: (member: ProfileRow) => void; onDelete: (member: ProfileRow) => void; }) {
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

      <div className="bg-white border border-slate-200 rounded-3xl overflow-x-auto shadow-sm">
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
                const status = profile.status === 'ACTIVE' ? 'Active' : profile.status === 'INVITED' || profile.status === 'PENDING_APPROVAL' ? 'Pending' : profile.status === 'DECLINED' ? 'Declined' : profile.status === 'INACTIVE' ? 'Inactive' : 'Active';
                return (
                  <tr key={profile.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 font-semibold text-slate-900">{profile.name || 'Unknown GD Member'}</td>
                    <td className="px-4 py-4 text-slate-600">{profile.email}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => onGDMemberDetails(profile)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Profile</button>
                        <MemberRowActions profile={profile} onEdit={onEdit} onDelete={onDelete} />
                      </div>
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
