import React, { useState, useEffect } from 'react';
import { Manuscript, Role } from '../types';
import TuliticsLogo from './TuliticsLogo';
import {
  Bell,
  User,
  LogOut,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  FileText,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BookOpen,
  Settings,
  BarChart,
  Briefcase,
  Layers,
  Sliders,
  DollarSign,
  Award,
  Circle,
  Globe,
  PlusCircle,
  Filter
} from 'lucide-react';

import NewSubmissionFlow from './NewSubmissionFlow';
import OjsSubmissionDetail from './OjsSubmissionDetail';

interface AuthorWorkspaceProps {
  manuscripts: Manuscript[];
  onSaveManuscript: (manuscript: Manuscript) => void;
  onSubmitManuscript: (manuscriptId: string) => void;
  currentUser?: { name: string; email: string; role: Role } | null;
  onSignOut?: () => void;
  onRoleChange?: (role: Role) => void;
}

// Exact OJS initial papers matching user's screenshots
const DEFAULT_OJS_MANUSCRIPTS = [
  {
    id: "990",
    author: "Пестерніков",
    title: "test",
    stage: "Submission",
    language: "English",
    section: "Articles",
    abstract: "Validation test submission of the OJS system pipeline parameters.",
    receivedAt: "2026-06-08"
  },
  {
    id: "986",
    author: "Testdrive et al.",
    title: "Uji Lari OJS",
    stage: "Submission",
    language: "English",
    section: "Articles",
    abstract: "Test drive sequence evaluating system stability under concurrent loads.",
    receivedAt: "2026-06-07"
  },
  {
    id: "985",
    author: "Testdrive",
    title: "Test",
    stage: "Submission",
    language: "English",
    section: "Articles",
    abstract: "Initial template structure verification and submission routing tests.",
    receivedAt: "2026-06-07"
  }
];

export default function AuthorWorkspace({
  manuscripts,
  onSaveManuscript,
  onSubmitManuscript,
  currentUser,
  onSignOut,
  onRoleChange
}: AuthorWorkspaceProps) {
  
  // Tab states matching OJS categories
  const [activeTab, setActiveTab] = useState<string>('ACTIVE_SUBMISSIONS');
  const [submissionsExpanded, setSubmissionsExpanded] = useState<boolean>(true);
  const [settingsExpanded, setSettingsExpanded] = useState<boolean>(false);
  const [statisticsExpanded, setStatisticsExpanded] = useState<boolean>(false);
  
  // Search query
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Dropdown states for Top bar elements
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);

  // New Submission Form controlled fields
  const [isCreatingSubmission, setIsCreatingSubmission] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newLanguage, setNewLanguage] = useState<string>('English');
  const [newSection, setNewSection] = useState<string>('Articles');

  // Selected paper detail modal / view
  const [selectedPaper, setSelectedPaper] = useState<any | null>(null);

  // In-memory submissions list synced or populated
  const [papers, setPapers] = useState<any[]>(() => {
    const saved = localStorage.getItem('ojs_author_papers_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Local parse error", e);
      }
    }
    return DEFAULT_OJS_MANUSCRIPTS;
  });

  // Keep papers state persistent
  useEffect(() => {
    localStorage.setItem('ojs_author_papers_state', JSON.stringify(papers));
  }, [papers]);

  // Synchronize with centralized parent manuscripts state for database-level live updates
  useEffect(() => {
    setPapers((prevPapers) => {
      // Create a map of existing papers in local state to preserve key custom OJS properties
      const paperMap = new Map<string, any>();
      
      // Seed with DEFAULT_OJS_MANUSCRIPTS first, then overwrite with any local state
      DEFAULT_OJS_MANUSCRIPTS.forEach((p) => {
        paperMap.set(p.id, p);
      });
      prevPapers.forEach((p) => {
        paperMap.set(p.id, p);
      });

      // Map/synchronize centralized manuscripts into the OJS list
      manuscripts.forEach((m) => {
        const cleanId = m.id.replace('JMS-', '').replace('OJS-', '');
        
        // Find if this manuscript is already represented
        const existing = paperMap.get(cleanId) || paperMap.get(m.id);

        let stage = 'Submission';
        if (m.status === 'DRAFT') {
          stage = 'Incomplete';
        } else if (m.status === 'SUBMITTED') {
          stage = 'Submission';
        } else if (m.status === 'UNDER_REVIEW') {
          if ((m.editorsNotes || '').includes('[Editorial Decision - REVISE]') || (m.editorsNotes || '').includes('[Editorial Decision - MINOR_REVISIONS]')) {
            // Check if user uploaded a revision (detected via discussions thread posts or notes update)
            const hasAuthorRevision = m.discussions.some(d =>
              (d.senderName || d.senderEmail || '').includes(m.authorName || 'Author') &&
              ((d.text || '').toLowerCase().includes('revision') || (d.text || '').toLowerCase().includes('reconciled'))
            );
            stage = hasAuthorRevision ? 'Revisions Submitted' : 'Revisions Requested';
          } else {
            stage = 'Submission';
          }
        } else if (m.status === 'AWAITING_DECISION') {
          stage = 'Submission';
        } else if (m.status === 'ACCEPTED') {
          stage = 'Scheduled';
        } else if (m.status === 'PUBLISHED') {
          stage = 'Published';
        } else if (m.status === 'REJECTED') {
          stage = 'Declined';
        }

        const primaryAuthor = m.authorName || m.contributors?.[0]?.name || 'Unknown';
        const authorString = m.contributors && m.contributors.length > 1 ? `${primaryAuthor} et al.` : primaryAuthor;

        // Maintain and map back discussions to OJS format if they aren't parsed
        const ojsDiscussions = m.discussions && m.discussions.length > 0 ? m.discussions.map((d: any) => ({
          id: d.id,
          subject: d.senderRole === 'AUTHOR' ? "Author Communication" : "Editorial Inquiry",
          initiator: d.senderName,
          participants: [m.authorName, "Kellye Milhorn (Editor)"],
          messages: [{
            id: d.id + "-msg",
            sender: d.senderName,
            senderRole: d.senderRole === 'AUTHOR' ? 'Author' : 'Editor',
            text: d.text,
            timestamp: d.timestamp,
            files: d.fileName ? [{ name: d.fileName, size: d.fileSize || "2.0 MB" }] : []
          }],
          createdAt: d.timestamp,
          isClosed: false
        })) : (existing?.discussions || []);

        const mergedPaper = {
          id: cleanId,
          author: authorString,
          title: m.title,
          stage: stage,
          language: m.language || 'English',
          section: 'Articles',
          abstract: m.abstract,
          receivedAt: m.submittedAt ? m.submittedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
          coverLetter: m.coverLetter,
          fileName: m.fileName || (existing?.fileName),
          discussions: ojsDiscussions,
          raw: m
        };

        paperMap.set(cleanId, mergedPaper);
      });

      return Array.from(paperMap.values());
    });
  }, [manuscripts]);

  const authorName = currentUser?.name || "Dr. Ada Lovelace";
  const authorEmail = currentUser?.email || "ada@computing.org";

  // Counts tracking
  const countActive = papers.filter(p => p.stage === 'Submission').length;
  const countRevisionsReq = papers.filter(p => p.stage === 'Revisions Requested').length;
  const countRevisionsSub = papers.filter(p => p.stage === 'Revisions Submitted').length;
  const countIncomplete = papers.filter(p => p.stage === 'Incomplete').length;
  const countScheduled = papers.filter(p => p.stage === 'Scheduled').length;
  const countPublished = papers.filter(p => p.stage === 'Published').length;
  const countDeclined = papers.filter(p => p.stage === 'Declined').length;

  // Handle new submission creation from the premium NewSubmissionFlow wizard
  const handleCreateSubmissionFromWizard = (paperObj: any) => {
    const updatedPapers = [paperObj, ...papers];
    setPapers(updatedPapers);

    // Sync to parent backend state for full-stack compatibility
    const parentManuscript: Manuscript = {
      id: `OJS-${paperObj.id}`,
      title: paperObj.title,
      abstract: paperObj.abstract,
      references: "",
      isDoubleBlind: true,
      coverLetter: paperObj.coverLetter || "Confidential Cover Letter.",
      fileName: paperObj.fileName || paperObj.uploadedFileNames?.[0] || 'manuscript_submission.pdf',
      fileSize: paperObj.fileSize || "2.4 MB",
      uploadedAt: new Date().toISOString(),
      storagePath: paperObj.storagePath || null,
      publicUrl: paperObj.publicUrl || null,
      contributors: paperObj.contributors.map((c: any) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        affiliation: c.affiliation,
        role: c.role
      })),
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
      reviewers: [],
      suggestedReviewers: (paperObj.reviewerSuggestions || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        approved: false
      })),
      discussions: [],
      doi: null,
      volume: null,
      issue: null,
      publishedAt: null,
      authorId: (currentUser as any)?.id || "auth_ada",
      authorName: authorName,
      authorEmail: authorEmail,
      submissionStep: 9,
      editorsNotes: ""
    };

    onSaveManuscript(parentManuscript);
    onSubmitManuscript(`OJS-${paperObj.id}`);
  };

  // Switch tabs helper
  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setIsCreatingSubmission(false);
    setSelectedPaper(null);
  };

  // Filter papers for active tab
  const getFilteredPapers = () => {
    let targetStage = 'Submission';
    switch (activeTab) {
      case 'ACTIVE_SUBMISSIONS':
        targetStage = 'Submission';
        break;
      case 'REVISIONS_REQUESTED':
        targetStage = 'Revisions Requested';
        break;
      case 'REVISIONS_SUBMITTED':
        targetStage = 'Revisions Submitted';
        break;
      case 'INCOMPLETE_SUBMISSIONS':
        targetStage = 'Incomplete';
        break;
      case 'SCHEDULED':
        targetStage = 'Scheduled';
        break;
      case 'PUBLISHED':
        targetStage = 'Published';
        break;
      case 'DECLINED':
        targetStage = 'Declined';
        break;
      default:
        return [];
    }

    return papers.filter(p => {
      if (p.stage !== targetStage) return false;
      if (searchQuery.trim() === '') return true;
      const term = searchQuery.toLowerCase();
      return (
        p.id.toLowerCase().includes(term) ||
        p.author.toLowerCase().includes(term) ||
        p.title.toLowerCase().includes(term)
      );
    });
  };

  const filteredList = getFilteredPapers();

  return (
    <div id="ojs-author-workspace-root" className="min-h-screen bg-[#f8fafc] flex flex-col font-sans antialiased text-[#2c3e50]">
      
      {/* ----------------- 1. TOP HEADER (NOTIFICATION BAR & PROFILE BAR ONLY) ----------------- */}
      <header className="bg-white text-slate-850 border-b border-[#e2e8f0] px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-xs">
        
        {/* Left identity logo */}
        <div className="shrink-0">
          <TuliticsLogo iconSize={36} showText={true} textColorClass="text-[#155e42]" subTitle="AUTHOR WORKSPACE • PKP PORTAL" usePng={true} />
        </div>

        {/* Right tools (Bell notification bar & Profile bar) */}
        <div className="flex items-center gap-5">
          
          {/* A. NOTIFICATION BAR */}
          <div className="relative">
            <button
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setProfileOpen(false);
              }}
              className="relative p-2 rounded-full hover:bg-slate-100 transition duration-150 focus:outline-none cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-5 h-5 text-[#008751] hover:text-[#007043]" />
              <span className="absolute top-0.5 right-0.5 bg-[#008751] text-white font-mono text-[9px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-white">
                3
              </span>
            </button>

            {/* Notifications Dropdown Panel */}
            {notificationsOpen && (
              <div className="absolute right-0 mt-3 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 text-left text-xs text-slate-800 py-2 animate-in fade-in-95 duration-100">
                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                  <strong className="text-slate-900 font-bold">In-App Task Alerts</strong>
                  <span className="text-[10px] font-mono tracking-wide bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded-md">
                    OJS Portal
                  </span>
                </div>
                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  <div className="px-4 py-2.5 hover:bg-slate-50 transition">
                    <p className="text-slate-700 font-normal leading-relaxed">
                      Submission <span className="font-semibold text-slate-900">#990</span> was assigned to the Editorial review panel.
                    </p>
                    <span className="text-[9px] text-gray-400 block mt-1 font-mono">Today, 11:24 AM</span>
                  </div>
                  <div className="px-4 py-2.5 hover:bg-slate-50 transition">
                    <p className="text-slate-700 font-normal leading-relaxed">
                      Submission <span className="font-semibold text-slate-900">#986</span> passed double-blind structure validations.
                    </p>
                    <span className="text-[9px] text-gray-400 block mt-1 font-mono">Yesterday, 04:15 PM</span>
                  </div>
                  <div className="px-4 py-2.5 hover:bg-slate-50 transition">
                    <p className="text-slate-700 font-normal leading-relaxed">
                      Submission <span className="font-semibold text-slate-900">#985</span> initialized successfully in state <span className="text-[#008751] font-bold">Submission</span>.
                    </p>
                    <span className="text-[9px] text-gray-400 block mt-1 font-mono">June 07, 2026</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* B. PROFILE BAR */}
          <div className="relative">
            <button
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 transition duration-150 focus:outline-none cursor-pointer"
            >
              <div className="w-7 h-7 bg-emerald-50 text-[#008751] rounded-full flex items-center justify-center font-bold text-xs font-sans shadow-xs border border-emerald-100">
                {authorName.charAt(0)}
              </div>
              <span className="text-slate-750 text-xs font-semibold hidden sm:inline max-w-[120px] truncate">
                {authorName}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
            </button>

            {/* Profile Dropdown Panel */}
            {profileOpen && (
              <div className="absolute right-0 mt-3 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 text-left text-xs text-slate-800 py-2 animate-in fade-in-95 duration-100">
                <div className="px-4 py-2 border-b border-gray-100 bg-slate-50/50">
                  <strong className="block text-slate-900 font-bold">{authorName}</strong>
                  <span className="block text-[10px] text-slate-400 font-mono mt-0.5">{authorEmail}</span>
                  <span className="inline-block mt-1.5 px-2 py-0.5 bg-emerald-50 text-[#008751] text-[10px] uppercase font-mono font-bold rounded-md">
                    Author Account
                  </span>
                </div>
                <div className="py-1">
                  
                  {/* Multi-role quick simulation helper to prevent getting stuck */}
                  {onRoleChange && (
                    <div className="px-3 py-1.5 border-b border-gray-100">
                      <span className="text-[9px] font-mono font-bold text-slate-400 uppercase block mb-1">
                        Developer Persona Switch
                      </span>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            onRoleChange(e.target.value as any);
                            setProfileOpen(false);
                          }
                        }}
                        defaultValue=""
                        className="w-full text-[11px] bg-slate-100 border rounded p-1 text-slate-700 outline-none"
                      >
                        <option value="" disabled>Switch portal perspective...</option>
                        <option value="AUTHOR">Author Portal</option>
                        <option value="EDITOR">Editor Portal</option>
                        <option value="REVIEWER">Reviewer Portal</option>
                        <option value="PUBLISHER">Publisher Portal</option>
                        <option value="ARCHITECT">Architect Specs</option>
                      </select>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      setIsCreatingSubmission(true);
                      setSelectedPaper(null);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Make New Submission</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      if (onSignOut) onSignOut();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-655 text-red-600 transition-colors flex items-center gap-2 font-semibold border-t border-gray-100 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>

                </div>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ----------------- 2. CONTENT VIEW CONTAINER ----------------- */}
      <div className="flex-grow w-full max-w-ffffff mx-auto flex flex-col md:flex-row items-stretch">
        
        {/* =============== C. LEFT OJS NAVIGATION SIDEBAR =============== */}
        {!selectedPaper && (
          <aside className="w-full md:w-64 bg-white border-r border-[#cfdde5] flex flex-col shrink-0 text-left">
          
          <div className="flex-grow">
            
            {/* accordion group 1: My Submissions as Author */}
            <div>
              <button
                onClick={() => setSubmissionsExpanded(!submissionsExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#f5f8fa] border-b border-[#cfdde5] text-sm font-bold uppercase tracking-wider text-[#002b3d] hover:bg-[#e9f0f4] transition duration-150 cursor-pointer text-left"
              >
                <span className="flex items-center gap-2 font-sans">
                  <FileText className="w-4 h-4 text-[#005c7a]" />
                  My Submissions as Author
                </span>
                {submissionsExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {submissionsExpanded && (
                <div className="divide-y divide-slate-150/70">
                  
                  {/* Category: Active submissions */}
                  <div className="px-2 py-0.5">
                    <button
                      onClick={() => handleSelectTab('ACTIVE_SUBMISSIONS')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                        activeTab === 'ACTIVE_SUBMISSIONS' && !isCreatingSubmission
                          ? 'bg-emerald-50 text-[#008751] font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                      }`}
                    >
                      <span className="truncate">Active submissions</span>
                      <span
                        className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-mono ${
                          activeTab === 'ACTIVE_SUBMISSIONS' && !isCreatingSubmission
                            ? 'bg-emerald-200/80 text-[#008751] font-bold'
                            : 'bg-emerald-500/10 text-emerald-700 font-bold'
                        }`}
                      >
                        {countActive}
                      </span>
                    </button>
                  </div>

                  {/* Category: Revisions requested */}
                  <div className="px-2 py-0.5">
                    <button
                      onClick={() => handleSelectTab('REVISIONS_REQUESTED')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                        activeTab === 'REVISIONS_REQUESTED' && !isCreatingSubmission
                          ? 'bg-emerald-50 text-[#008751] font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                      }`}
                    >
                      <span className="truncate">Revisions requested</span>
                      <span
                        className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-mono ${
                          activeTab === 'REVISIONS_REQUESTED' && !isCreatingSubmission
                            ? 'bg-emerald-200/80 text-[#008751] font-bold'
                            : 'bg-emerald-500/10 text-emerald-700 font-bold'
                        }`}
                      >
                        {countRevisionsReq}
                      </span>
                    </button>
                  </div>

                  {/* Category: Revisions submitted */}
                  <div className="px-2 py-0.5">
                    <button
                      onClick={() => handleSelectTab('REVISIONS_SUBMITTED')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                        activeTab === 'REVISIONS_SUBMITTED' && !isCreatingSubmission
                          ? 'bg-emerald-50 text-[#008751] font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                      }`}
                    >
                      <span className="truncate">Revisions submitted</span>
                      <span
                        className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-mono ${
                          activeTab === 'REVISIONS_SUBMITTED' && !isCreatingSubmission
                            ? 'bg-emerald-200/80 text-[#008751] font-bold'
                            : 'bg-emerald-500/10 text-emerald-700 font-bold'
                        }`}
                      >
                        {countRevisionsSub}
                      </span>
                    </button>
                  </div>

                  {/* Category: Incomplete submissions */}
                  <div className="px-2 py-0.5">
                    <button
                      onClick={() => handleSelectTab('INCOMPLETE_SUBMISSIONS')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                        activeTab === 'INCOMPLETE_SUBMISSIONS' && !isCreatingSubmission
                          ? 'bg-emerald-50 text-[#008751] font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                      }`}
                    >
                      <span className="truncate">Incomplete submissions</span>
                      <span
                        className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-mono ${
                          activeTab === 'INCOMPLETE_SUBMISSIONS' && !isCreatingSubmission
                            ? 'bg-emerald-200/80 text-[#008751] font-bold'
                            : 'bg-emerald-500/10 text-emerald-700 font-bold'
                        }`}
                      >
                        {countIncomplete}
                      </span>
                    </button>
                  </div>

                  {/* Category: Scheduled for publication */}
                  <div className="px-2 py-0.5">
                    <button
                      onClick={() => handleSelectTab('SCHEDULED')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                        activeTab === 'SCHEDULED' && !isCreatingSubmission
                          ? 'bg-emerald-50 text-[#008751] font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                      }`}
                    >
                      <span className="truncate">Scheduled for publication</span>
                      <span
                        className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-mono ${
                          activeTab === 'SCHEDULED' && !isCreatingSubmission
                            ? 'bg-emerald-200/80 text-[#008751] font-bold'
                            : 'bg-emerald-500/10 text-emerald-700 font-bold'
                        }`}
                      >
                        {countScheduled}
                      </span>
                    </button>
                  </div>

                  {/* Category: Published */}
                  <div className="px-2 py-0.5">
                    <button
                      onClick={() => handleSelectTab('PUBLISHED')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                        activeTab === 'PUBLISHED' && !isCreatingSubmission
                          ? 'bg-emerald-50 text-[#008751] font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                      }`}
                    >
                      <span className="truncate">Published</span>
                      <span
                        className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-mono ${
                          activeTab === 'PUBLISHED' && !isCreatingSubmission
                            ? 'bg-emerald-200/80 text-[#008751] font-bold'
                            : 'bg-emerald-500/10 text-emerald-700 font-bold'
                        }`}
                      >
                        {countPublished}
                      </span>
                    </button>
                  </div>

                  {/* Category: Declined */}
                  <div className="px-2 py-1 border-b border-[#cfdde5]">
                    <button
                      onClick={() => handleSelectTab('DECLINED')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                        activeTab === 'DECLINED' && !isCreatingSubmission
                          ? 'bg-emerald-50 text-[#008751] font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                      }`}
                    >
                      <span className="truncate">Declined</span>
                      <span
                        className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-mono ${
                          activeTab === 'DECLINED' && !isCreatingSubmission
                            ? 'bg-emerald-200/80 text-[#008751] font-bold'
                            : 'bg-emerald-500/10 text-emerald-700 font-bold'
                        }`}
                      >
                        {countDeclined}
                      </span>
                    </button>
                  </div>

                </div>
              )}
            </div>

             {/* Static Sidebar Categories styled exactly like screenshots */}
            <div className="divide-y divide-[#cfdde5] border-b border-[#cfdde5]">
              
              <div className="px-2 py-0.5">
                <button
                  onClick={() => handleSelectTab('ISSUES')}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                    activeTab === 'ISSUES' ? 'bg-emerald-50 text-[#008751] font-extrabold' : 'text-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  <Layers className={`w-4.5 h-4.5 ${activeTab === 'ISSUES' ? 'text-[#008751]' : 'text-[#008751]/70'}`} />
                  <span>Issues</span>
                </button>
              </div>

              <div className="px-2 py-0.5">
                <button
                  onClick={() => handleSelectTab('ANNOUNCEMENTS')}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                    activeTab === 'ANNOUNCEMENTS' ? 'bg-emerald-50 text-[#008751] font-extrabold' : 'text-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  <MessageSquare className={`w-4.5 h-4.5 ${activeTab === 'ANNOUNCEMENTS' ? 'text-[#008751]' : 'text-[#008751]/70'}`} />
                  <span>Announcements</span>
                </button>
              </div>

              <div className="px-2 py-0.5">
                <button
                  onClick={() => handleSelectTab('DOIS')}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                    activeTab === 'DOIS' ? 'bg-emerald-50 text-[#008751] font-extrabold' : 'text-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  <Sliders className={`w-4.5 h-4.5 ${activeTab === 'DOIS' ? 'text-[#008751]' : 'text-[#008751]/70'}`} />
                  <span>DOIs</span>
                </button>
              </div>

              <div className="px-2 py-0.5">
                <button
                  onClick={() => handleSelectTab('INSTITUTIONS')}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                    activeTab === 'INSTITUTIONS' ? 'bg-emerald-50 text-[#008751] font-extrabold' : 'text-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  <Globe className={`w-4.5 h-4.5 ${activeTab === 'INSTITUTIONS' ? 'text-[#008751]' : 'text-[#008751]/70'}`} />
                  <span>Institutions</span>
                </button>
              </div>

              <div className="px-2 py-0.5">
                <button
                  onClick={() => handleSelectTab('PAYMENTS')}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                    activeTab === 'PAYMENTS' ? 'bg-emerald-50 text-[#008751] font-extrabold' : 'text-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  <DollarSign className={`w-4.5 h-4.5 ${activeTab === 'PAYMENTS' ? 'text-[#008751]' : 'text-[#008751]/70'}`} />
                  <span>Payments</span>
                </button>
              </div>

              {/* Collapsible Settings */}
              <div className="px-2 py-0.5">
                <button
                  onClick={() => setSettingsExpanded(!settingsExpanded)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-semibold transition duration-150 cursor-pointer text-left rounded-xl"
                >
                  <span className="flex items-center gap-2.5">
                    <Settings className="w-4.5 h-4.5 text-[#008751]/70" />
                    <span>Settings</span>
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${settingsExpanded ? 'rotate-180' : ''}`} />
                </button>
                {settingsExpanded && (
                  <div className="bg-[#fcfdfe] pl-7 pr-4 py-1.5 space-y-2 border-t border-slate-100 text-xs text-slate-500 text-left rounded-b-xl">
                    <button onClick={() => alert("OJS Journal Settings Portal")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Journal</button>
                    <button onClick={() => alert("OJS Website Design Portal")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Website</button>
                    <button onClick={() => alert("OJS Workflow Gateway Settings")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Workflow</button>
                    <button onClick={() => alert("OJS Distribution Channels Settings")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Distribution</button>
                    <button onClick={() => alert("OJS Multi-Tenant Roles Configuration")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Users & Roles</button>
                  </div>
                )}
              </div>

              {/* Collapsible Statistics */}
              <div className="px-2 py-0.5">
                <button
                  onClick={() => setStatisticsExpanded(!statisticsExpanded)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-semibold transition duration-150 cursor-pointer text-left rounded-xl"
                >
                  <span className="flex items-center gap-2.5">
                    <BarChart className="w-4.5 h-4.5 text-[#008751]/70" />
                    <span>Statistics</span>
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${statisticsExpanded ? 'rotate-180' : ''}`} />
                </button>
                {statisticsExpanded && (
                  <div className="bg-[#fcfdfe] pl-7 pr-4 py-1.5 space-y-2 border-t border-slate-100 text-xs text-slate-500 text-left rounded-b-xl">
                    <button onClick={() => alert("Article view and citations counter")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Articles</button>
                    <button onClick={() => alert("Editorial speed calculations")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Editorial Activity</button>
                    <button onClick={() => alert("User demographics reports")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Users</button>
                    <button onClick={() => alert("Custom reports compilation exporter")} className="block hover:text-[#008751] transition-colors py-0.5 w-full text-left font-semibold">Reports</button>
                  </div>
                )}
              </div>

              <div className="px-2 py-0.5">
                <button
                  onClick={() => handleSelectTab('TOOLS')}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition duration-150 cursor-pointer rounded-xl ${
                    activeTab === 'TOOLS' ? 'bg-emerald-50 text-[#008751] font-extrabold' : 'text-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  <Briefcase className={`w-4.5 h-4.5 ${activeTab === 'TOOLS' ? 'text-[#008751]' : 'text-[#008751]/70'}`} />
                  <span>Tools</span>
                </button>
              </div>

            </div>

          </div>
        </aside>
       )}

        {/* =============== MAIN WORKING PANE =============== */}
        {selectedPaper ? (
          <div className="flex-grow w-full">
            <OjsSubmissionDetail
              paper={selectedPaper}
              currentUser={currentUser}
              onBack={() => setSelectedPaper(null)}
              onUpdatePaperDiscussions={(paperId, updatedDiscussions) => {
                const updatedPapers = papers.map(p =>
                  p.id === paperId ? { ...p, discussions: updatedDiscussions } : p
                );
                setPapers(updatedPapers);

                const matchManuscript = manuscripts.find(m => 
                  m.id === paperId || 
                  m.id === `OJS-${paperId}` || 
                  m.id === `JMS-${paperId}` || 
                  m.id.replace('JMS-', '').replace('OJS-', '') === paperId
                );
                if (matchManuscript) {
                  const mappedMsgs = updatedDiscussions.flatMap(t =>
                    t.messages.map((m: any) => ({
                      id: m.id,
                      senderName: m.sender,
                      senderEmail: m.sender === (currentUser?.name || 'Author') ? (currentUser?.email || 'author@jms.org') : 'editor@jms.org',
                      senderRole: (m.senderRole === 'Author' ? 'AUTHOR' : 'EDITOR') as any,
                      text: m.text,
                      timestamp: m.timestamp,
                      fileName: m.files?.[0]?.name || null,
                      fileSize: m.files?.[0]?.size || null
                    }))
                  );

                  let updatedNotes = matchManuscript.editorsNotes || '';
                  const containsRevision = updatedDiscussions.some(t => 
                    (t.subject || '').toLowerCase().includes('revision') || 
                    t.messages.some((msg: any) => 
                      (msg.text || '').toLowerCase().includes('revision') || 
                      (msg.text || '').toLowerCase().includes('reconciled')
                    )
                  );
                  if (containsRevision && !updatedNotes.includes('revision uploaded')) {
                    updatedNotes = updatedNotes ? `${updatedNotes}\n[revision uploaded]` : '[revision uploaded]';
                  }

                  onSaveManuscript({
                    ...matchManuscript,
                    discussions: mappedMsgs,
                    editorsNotes: updatedNotes
                  });
                }
              }}
            />
          </div>
        ) : (
          <main className="flex-grow p-6 sm:p-8 flex flex-col items-center">
            
            {/* ======================= CASE A: PREMIUM MULTI-STEP SUBMISSION WIZARD ======================= */}
            {isCreatingSubmission ? (
              <div className="w-full">
                <NewSubmissionFlow
                  currentUser={{ name: authorName, email: authorEmail, role: 'AUTHOR' }}
                  onCancel={() => {
                    setIsCreatingSubmission(false);
                    setActiveTab('ACTIVE_SUBMISSIONS');
                  }}
                  onSubmit={(paperObj) => {
                    handleCreateSubmissionFromWizard(paperObj);
                  }}
                />
              </div>
            ) : (
            /* ======================= CASE C: OJS LIST OF SUBMISSIONS ======================= */
            <div className="w-full text-left font-sans space-y-5">
              
              {/* OJS Action Header bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                
                {/* Left query/filters control section */}
                <div className="flex items-center gap-2.5">
                  <button className="px-3 py-1.5 bg-white border border-[#cfdde5] text-[#008751] hover:bg-emerald-50/30 text-sm font-bold rounded flex items-center gap-1.5 cursor-pointer transition">
                    <Filter className="w-4 h-4 text-[#008751]" />
                    Filters
                  </button>
                  <button className="px-3 py-1.5 bg-white border border-[#cfdde5] text-[#008751] hover:bg-emerald-50/30 text-sm font-bold rounded flex items-center justify-center cursor-pointer transition">
                    •••
                  </button>
                  
                  {/* Category description labels info */}
                  <span className="text-emerald-800/80 text-sm pl-2 font-mono">
                    /{activeTab.toLowerCase().replace('_', ' ')}
                  </span>
                </div>

                {/* Right search & create submission buttons */}
                <div className="flex items-center gap-3">
                  
                  {/* Search box with dynamic hook */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="w-4 h-4 text-[#008751]/80" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search submissions, ID, authors, k"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full sm:w-64 bg-white border border-[#cfdde5] rounded pl-9 pr-3 py-1.5 text-sm focus:ring-1 focus:ring-[#008751] focus:border-[#008751] focus:outline-none placeholder:text-gray-400 text-slate-800 font-semibold"
                    />
                  </div>

                  {/* Make a Submission Button */}
                  <button
                    onClick={() => {
                      setIsCreatingSubmission(true);
                      setSelectedPaper(null);
                    }}
                    className="bg-[#008751] hover:bg-[#007043] text-white px-3.5 py-1.5 rounded transition text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    New Submission
                  </button>

                </div>

              </div>

              {/* ACCORDION/TAB DESCRIPTION SECTION */}
              <div className="bg-white border border-[#cfdde5] rounded-xl overflow-hidden shadow-xs">
                
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f5f8fa] border-b border-[#cfdde5] text-[#002b3d] text-xs font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-3 w-16 font-mono">ID ↑↓</th>
                      <th className="px-4 py-3">Submissions</th>
                      <th className="px-4 py-3 w-36">Stage</th>
                      <th className="px-4 py-3 w-40">Editorial Activity</th>
                      <th className="px-4 py-3 w-20 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#efefef] text-sm">
                    {filteredList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400 italic">
                          No papers recorded in this category that match your search filters.
                        </td>
                      </tr>
                    ) : (
                      filteredList.map((paper) => {
                        return (
                          <tr key={paper.id} className="hover:bg-slate-50/80 transition duration-100">
                            
                            {/* ID */}
                            <td className="px-4 py-3.5 text-slate-500 font-mono font-medium">
                              {paper.id}
                            </td>

                            {/* Author - Title */}
                            <td className="px-4 py-3.5">
                              <span className="font-bold text-slate-900 block">
                                {paper.author} <span className="font-normal text-slate-400 mx-1">—</span> <span className="font-semibold text-slate-700 hover:text-[#008751] transition cursor-pointer" onClick={() => setSelectedPaper(paper)}>{paper.title}</span>
                              </span>
                              <span className="text-xs text-gray-400 font-mono mt-0.5 block">
                                Received {paper.receivedAt} • Lang: {paper.language} • {paper.section}
                              </span>
                            </td>

                            {/* Stage */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                                <span className="w-2 h-2 rounded-full bg-[#008751] animate-pulse"></span>
                                {paper.stage}
                              </span>
                            </td>

                            {/* Editorial Activity */}
                            <td className="px-4 py-3.5 text-gray-400">
                              {/* Empty per screenshots */}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-center whitespace-nowrap font-bold text-sm">
                              <button
                                onClick={() => setSelectedPaper(paper)}
                                className="text-[#008751] underline hover:text-[#007043] transition cursor-pointer"
                              >
                                View
                              </button>
                            </td>

                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {/* Grid list Table footer */}
                <div className="bg-[#f5f8fa] border-t border-[#cfdde5] px-4 py-3 text-xs text-slate-600 font-mono">
                  Showing <strong>{filteredList.length}</strong> to <strong>{filteredList.length}</strong> of <strong>{filteredList.length}</strong>
                </div>

              </div>

            </div>
          )}

          {/* ======================= CASE D: STATIC OJS PAGES (ISSUES, ANNOUNCEMENTS, DOIS, ETC) ======================= */}
          {(activeTab === 'ISSUES' ||
            activeTab === 'ANNOUNCEMENTS' ||
            activeTab === 'DOIS' ||
            activeTab === 'INSTITUTIONS' ||
            activeTab === 'PAYMENTS' ||
            activeTab === 'TOOLS') && !isCreatingSubmission && !selectedPaper && (
            <div className="w-full text-left bg-white border border-[#cfdde5] rounded-xl shadow-xs p-6 space-y-4">
              
              <div className="border-b pb-3 flex items-center justify-between">
                <h3 className="font-bold text-lg text-slate-900 capitalize tracking-tight flex items-center gap-2">
                  <Layers className="w-5 h-5 text-sky-600" />
                  {activeTab.toLowerCase().replace('_', ' ')}
                </h3>
                <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-150">
                  OJS Module Portal
                </span>
              </div>

              {activeTab === 'ISSUES' && (
                <div className="space-y-4 text-xs font-sans">
                  <p className="text-gray-500 leading-relaxed">
                    Access historical issues and prospective editorial release catalogs loaded into Open Journal Systems.
                  </p>
                  <div className="divide-y divide-gray-100 border rounded-xl overflow-hidden bg-slate-50/50">
                    <div className="p-4 hover:bg-white transition flex items-center justify-between">
                      <div>
                        <strong className="block text-[#002b3d] text-sm font-bold">Vol 14 No 3 (2026): High-Performance Edge AI Applications</strong>
                        <span className="text-[10px] text-gray-400 block mt-1">Published: May 20, 2026</span>
                      </div>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border text-[10px] uppercase font-mono">Current Issue</span>
                    </div>
                    <div className="p-4 hover:bg-white transition flex items-center justify-between">
                      <div>
                        <strong className="block text-[#002b3d] text-sm font-bold">Vol 14 No 2 (2026): Decentralized Cache Optimization Strategies</strong>
                        <span className="text-[10px] text-gray-400 block mt-1">Published: April 12, 2026</span>
                      </div>
                      <span className="text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded border text-[10px] uppercase font-mono">Archived</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ANNOUNCEMENTS' && (
                <div className="space-y-4 text-xs font-sans">
                  <p className="text-gray-500 leading-relaxed font-normal">
                    Explore live announcements and call-for-papers dispatched to corresponding author directories.
                  </p>
                  <div className="space-y-3">
                    <div className="bg-sky-50/20 border border-sky-150 rounded-xl p-4 space-y-1.5 text-left">
                      <strong className="block text-[#002b3d] text-sm">Call for Papers: Special Issue on Medical Swarm Intelligence Gateways</strong>
                      <p className="text-slate-600 leading-relaxed font-normal">
                        Submitters represent clinical compilation datasets. Papers are double-blind evaluated by leading systems professors. Abstracts must contain performance transactions metric datasets.
                      </p>
                      <span className="text-[10px] text-gray-400 block mt-2 font-mono">Dispatched Jun 05, 2026</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'DOIS' && (
                <div className="space-y-4 text-xs">
                  <p className="text-gray-500 leading-relaxed font-normal">
                    Query Digital Object Identifiers (DOI) mapping corresponding to your published academic manuscripts directly with simulated Crossref endpoints.
                  </p>
                  <div className="border rounded-xl p-4 bg-slate-50/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 10.1016/j.jms.2026.0404"
                        className="p-2 border rounded-md text-xs bg-white text-slate-800 font-mono grow max-w-sm"
                        defaultValue="10.1016/j.jms.2026.0404"
                      />
                      <button
                        onClick={() => alert("Simulated Crossref metadata indexing verified.")}
                        className="bg-[#002b3d] text-white px-3 py-2 rounded-md font-bold transition text-xs hover:bg-[#001c29]"
                      >
                        Verify crossref index
                      </button>
                    </div>
                    <span className="text-[10px] text-gray-400 block mt-1">Direct indexing mappings synchronized dynamically on metadata compilation.</span>
                  </div>
                </div>
              )}

              {activeTab === 'INSTITUTIONS' && (
                <div className="space-y-4 text-xs font-sans">
                  <p className="text-gray-500 leading-relaxed font-normal">
                    Manage institutional affiliations and authorized library subscriptions providing multi-tenant platform backing.
                  </p>
                  <div className="bg-slate-50 p-4 border rounded-xl font-normal leading-relaxed text-slate-650 text-slate-600">
                    <strong className="text-slate-800 font-bold block mb-1">Affiliated Association Verified:</strong>
                    The system authenticated subscription protocols corresponding to your institutional email. Galley downloads are fully accessible to credentialed reviewers.
                  </div>
                </div>
              )}

              {activeTab === 'PAYMENTS' && (
                <div className="space-y-4 text-xs font-sans">
                  <p className="text-gray-500 leading-relaxed font-normal">
                    Reconcile Article Processing Charges (APC) and billing invoices once the Editorial Central moves manuscripts to high-priority publication.
                  </p>
                  <div className="border border-slate-150 p-5 rounded-xl shadow-xs bg-slate-50/20 max-w-lg space-y-4">
                    <div className="flex justify-between items-center bg-white p-3 border rounded-xl">
                      <div>
                        <strong className="block text-slate-900 text-xs">Standard APC Open-Access Invoice</strong>
                        <span className="text-[10px] text-gray-400 mt-1 block">Account Invoice: #PKP-2026-950</span>
                      </div>
                      <span className="text-[#002b3d] text-base font-extrabold font-mono">$950.00 USD</span>
                    </div>
                    <button
                      onClick={() => alert("Transactional API successfully simulated APC reconciliation.")}
                      className="w-full py-2.5 bg-[#005c7a] hover:bg-[#004157] text-white rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-colors shadow-xs"
                    >
                      Process mock gateway payment
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'TOOLS' && (
                <div className="space-y-4 text-xs font-sans">
                  <p className="text-gray-500 leading-relaxed font-normal">
                    Utility controllers executing XML metadata exports, database pipeline checks, and PDF template ingestion.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => alert("Metadata exported recursively in JATS XML standard.")}
                      className="p-4 border rounded-xl hover:bg-slate-50 text-slate-700 text-left cursor-pointer transition space-y-1.5"
                    >
                      <strong className="block text-[#002b3d] text-xs font-bold font-sans">JATS-XML Exporter</strong>
                      <span className="text-[10px] text-gray-400 block font-normal leading-normal">Download complete metadata mapping schemas of all submitted drafts.</span>
                    </button>
                    <button
                      onClick={() => alert("LaTeX template guide downloaded.")}
                      className="p-4 border rounded-xl hover:bg-slate-50 text-slate-700 text-left cursor-pointer transition space-y-1.5"
                    >
                      <strong className="block text-[#002b3d] text-xs font-bold font-sans">Manuscript LaTeX Template</strong>
                      <span className="text-[10px] text-gray-400 block font-normal leading-normal">Formatted IEEE standard configurations matching JMS typography rules.</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </main>
       )}

      </div>

    </div>
  );
}
