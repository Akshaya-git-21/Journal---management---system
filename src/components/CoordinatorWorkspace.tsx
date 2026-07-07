import React, { useState } from 'react';
import TuliticsLogo from './TuliticsLogo';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  Settings as SettingsIcon, 
  AlertOctagon, 
  Search, 
  Filter, 
  ChevronDown, 
  Check, 
  UserPlus, 
  RefreshCw,
  ExternalLink,
  Shield,
  Sliders,
  Database,
  Eye,
  Unlock,
  BookOpen,
  Award,
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  BarChart3,
  Mail,
  FileCheck,
  Clock,
  ChevronRight,
  Bell,
  Inbox,
  Download,
  Plus,
  Trash2,
  HelpCircle,
  Send,
  MoreVertical,
  ChevronLeft,
  X,
  Calendar,
  TrendingUp,
  TrendingDown,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb
} from 'lucide-react';
import { Manuscript, ManuscriptStatus } from '../types';

interface CoordinatorWorkspaceProps {
  manuscripts: Manuscript[];
  onUpdateManuscript?: (updated: Manuscript) => void;
}

interface BoardMember {
  id: string;
  name: string;
  email: string;
  role: 'Editor-in-Chief' | 'Associate Editor' | 'Section Editor' | 'Editorial Board';
  specialty: string;
  status: 'Active' | 'Invited' | 'Inactive';
  joinedOn: string;
  lastActive: string;
}

export default function CoordinatorWorkspace({ manuscripts: propManuscripts, onUpdateManuscript }: CoordinatorWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'queue' | 'board' | 'reviewers' | 'analytics' | 'protocols' | 'communications' | 'settings' | 'audit'>('queue');
  
  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'info'; text: string } | null>({
    type: 'info',
    text: 'Coordinator Session Active. Multi-tenant governance overrides authorized.'
  });
  
  // Validation Gates Settings
  const [doubleBlindRequired, setDoubleBlindRequired] = useState(true);
  const [minReviewsNeeded, setMinReviewsNeeded] = useState(2);
  const [screeningTimeLimit, setScreeningTimeLimit] = useState(7);
  const [waiverPolicyEnabled, setWaiverPolicyEnabled] = useState(true);

  // Pagination and Modals States
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedManuscript, setSelectedManuscript] = useState<any | null>(null);
  const [isNewSubmissionModalOpen, setIsNewSubmissionModalOpen] = useState(false);
  const [isInviteMemberModalOpen, setIsInviteMemberModalOpen] = useState(false);
  const [isInviteReviewerModalOpen, setIsInviteReviewerModalOpen] = useState(false);

  // Detailed modal inputs
  const [newSubTitle, setNewSubTitle] = useState('');
  const [newSubAuthor, setNewSubAuthor] = useState('');
  const [newSubEmail, setNewSubEmail] = useState('');
  const [newSubPriority, setNewSubPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [newSubAbstract, setNewSubAbstract] = useState('');
  const [newSubEditor, setNewSubEditor] = useState('Dr. Elizabeth Vance');

  const [inviteMemName, setInviteMemName] = useState('');
  const [inviteMemEmail, setInviteMemEmail] = useState('');
  const [inviteMemRole, setInviteMemRole] = useState<'Editor-in-Chief' | 'Associate Editor' | 'Section Editor' | 'Editorial Board'>('Editorial Board');
  const [inviteMemSpecialty, setInviteMemSpecialty] = useState('');

  const [inviteRevName, setInviteRevName] = useState('');
  const [inviteRevSpecialty, setInviteRevSpecialty] = useState('');

  // Drawer composing state
  const [composingSubject, setComposingSubject] = useState('');
  const [composingBody, setComposingBody] = useState('');
  const [composingRecipientType, setComposingRecipientType] = useState('Author');

  // Override Challenge Modal State
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState('Editorial Board Consensus Override');
  const [pendingTargetStage, setPendingTargetStage] = useState<string | null>(null);

  const dismissAlert = () => setAlertMessage(null);

  // Board members data (Dynamic State)
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([
    {
      id: "EM-01",
      name: "Dr. Elizabeth Vance",
      email: "elizabeth.vance@medai.edu",
      role: "Editor-in-Chief",
      specialty: "AI in Healthcare",
      status: "Active",
      joinedOn: "Jan 15, 2024",
      lastActive: "2 hours ago"
    },
    {
      id: "EM-02",
      name: "Dr. Hiroshi Tanaka",
      email: "hiroshi.tanaka@medai.jp",
      role: "Associate Editor",
      specialty: "Medical Imaging",
      status: "Active",
      joinedOn: "Feb 20, 2024",
      lastActive: "1 day ago"
    },
    {
      id: "EM-03",
      name: "Prof. Arjun Patel",
      email: "arjun.patel@iitd.ac.in",
      role: "Section Editor",
      specialty: "Machine Learning",
      status: "Active",
      joinedOn: "Mar 10, 2024",
      lastActive: "3 hours ago"
    },
    {
      id: "EM-04",
      name: "Dr. Maria Garcia",
      email: "maria.garcia@nih.gov",
      role: "Editorial Board",
      specialty: "NLP in Medicine",
      status: "Active",
      joinedOn: "Apr 05, 2024",
      lastActive: "5 days ago"
    },
    {
      id: "EM-05",
      name: "Dr. James Wilson",
      email: "james.wilson@bioinfo.org",
      role: "Editorial Board",
      specialty: "Bioinformatics",
      status: "Active",
      joinedOn: "May 12, 2024",
      lastActive: "2 days ago"
    },
    {
      id: "EM-06",
      name: "Dr. Sarah Johnson",
      email: "sarah.johnson@datasci.org",
      role: "Editorial Board",
      specialty: "Data Science",
      status: "Invited",
      joinedOn: "Jun 20, 2026",
      lastActive: "-"
    },
    {
      id: "EM-07",
      name: "Dr. Chen Wei",
      email: "chen.wei@aiethics.org",
      role: "Editorial Board",
      specialty: "AI Ethics",
      status: "Inactive",
      joinedOn: "Dec 01, 2023",
      lastActive: "60 days ago"
    }
  ]);

  // Reviewers dataset (Dynamic State)
  const [reviewersData, setReviewersData] = useState([
    { name: "Dr. Michael Lee", specialty: "Medical Imaging", invited: 15, accepted: 12, completed: 10, status: "Active" },
    { name: "Dr. Priya Sharma", specialty: "Machine Learning", invited: 18, accepted: 15, completed: 13, status: "Active" },
    { name: "Dr. Robert Kim", specialty: "AI in Healthcare", invited: 10, accepted: 9, completed: 8, status: "Active" },
    { name: "Dr. Laura Wilson", specialty: "Bioinformatics", invited: 15, accepted: 12, completed: 8, status: "Active" },
    { name: "Dr. Ahmed Hassan", specialty: "NLP in Medicine", invited: 8, accepted: 5, completed: 3, status: "Pending" },
    { name: "Dr. Fatima Ali", specialty: "Data Science", invited: 6, accepted: 2, completed: 1, status: "Declined" }
  ]);

  // Communications dataset (Dynamic State)
  const [communicationsData, setCommunicationsData] = useState([
    { subject: "Your manuscript JMS-2026-220 is under review", recipient: "James Carter", type: "Author", status: "Sent", sent: "Jun 25, 2026 10:30 AM" },
    { subject: "Review invitation for manuscript JMS-2026-221", recipient: "Dr. Michael Lee", type: "Reviewer", status: "Delivered", sent: "Jun 25, 2026 09:15 AM" },
    { subject: "Editorial decision for manuscript JMS-2026-218", recipient: "Emily Watson", type: "Author", status: "Sent", sent: "Jun 24, 2026 04:20 PM" },
    { subject: "Reminder: Review overdue for JMS-2026-215", recipient: "Dr. Priya Sharma", type: "Reviewer", status: "Sent", sent: "Jun 24, 2026 11:10 AM" },
    { subject: "New assignment: Section Editor", recipient: "Prof. Arjun Patel", type: "Editor", status: "Delivered", sent: "Jun 24, 2026 09:00 AM" },
    { subject: "Manuscript JMS-2026-210 moved to production", recipient: "Sarah Johnson", type: "Author", status: "Sent", sent: "Jun 23, 2026 02:45 PM" }
  ]);

  // Audit dataset (Dynamic State)
  const [auditData, setAuditData] = useState([
    { event: "Double-Blind Anonymity policy verified", actor: "System Controller", target: "Platform Configuration", date: "Jun 25, 2026 10:00 AM", status: "Verified" },
    { event: "Editorial board staff EM-06 Sarah Johnson enrolled", actor: "Dr. Akshay (Coordinator)", target: "Staff Directory", date: "Jun 24, 2026 03:30 PM", status: "Success" },
    { event: "Authorized bypass for screening SLA warning check", actor: "Dr. Akshay (Coordinator)", target: "JMS-2026-220", date: "Jun 24, 2026 01:15 PM", status: "Override" },
    { event: "APC Waiver Automatically Evaluated", actor: "Financial Substrate Rule", target: "JMS-2026-224", date: "Jun 21, 2026 11:00 AM", status: "Approved" }
  ]);

  // Combined Dynamic Manuscripts list state
  const [manuscriptsList, setManuscriptsList] = useState(() => {
    // Basic coordinator mock items
    const baseList = [
      {
        id: "JMS-2026-220",
        title: "Deep Learning for Medical Imaging Classification",
        author: "James Carter",
        authorEmail: "james.carter@stanford.edu",
        stage: "Under Review",
        priority: "High",
        assignedTo: "Dr. Elizabeth Vance",
        submitted: "Jun 25, 2026",
        dueDate: "Jul 05, 2026",
        dueStatus: "Overdue",
        status: "In Progress",
        abstract: "This manuscript proposes an advanced multi-scale convolutional neural network architecture with self-attention gates for high-accuracy classification of pulmonary nodules in clinical CT scans. Our validation dataset includes 1,200 annotated nodules from public and private clinical cohorts, demonstrating a 98.4% diagnostic sensitivity.",
        coverLetter: "Dear Editor-in-Chief,\n\nWe submit our original research manuscript for consideration in JAM. We certify that this work has not been published elsewhere and all co-authors agree to the submission. This study is critical for automating lung cancer screening with clinical-grade accuracy.\n\nSincerely,\nJames Carter",
        contributors: [
          { name: "James Carter", email: "james.carter@stanford.edu", affiliation: "Stanford University", role: "Primary Author" },
          { name: "Dr. Sarah Lin", email: "sarah.lin@stanford.edu", affiliation: "Stanford Medical Center", role: "Co-Author" }
        ],
        reviewersAssigned: ["Dr. Michael Lee", "Dr. Priya Sharma"],
        comments: "Initial screening passed. Assigned to Dr. Vance."
      },
      {
        id: "JMS-2026-221",
        title: "AI-driven Drug Discovery Paradigm",
        author: "Emily Watson",
        authorEmail: "emily.w@oxford.ac.uk",
        stage: "Screening",
        priority: "Medium",
        assignedTo: "Dr. Hiroshi Tanaka",
        submitted: "Jun 24, 2026",
        dueDate: "Jul 03, 2026",
        dueStatus: "2 days left",
        status: "Pending",
        abstract: "By leveraging generative diffusion models trained on millions of small molecule ligand-receptor binding affinity datasets, we present a novel computational pipeline that accelerates drug hit candidate identification from 3 years to 14 days. We validated our selected candidates in-vitro against SARS-CoV-2 main protease targets.",
        coverLetter: "Dear Editorial Board,\n\nWe present our drug-discovery pipeline which utilizes recent advancements in AI diffusion models. We believe this represents a paradigm shift for computational biochemistry.\n\nBest regards,\nEmily Watson",
        contributors: [
          { name: "Emily Watson", email: "emily.w@oxford.ac.uk", affiliation: "University of Oxford", role: "Primary Author" }
        ],
        reviewersAssigned: ["Dr. Robert Kim"],
        comments: "Desk screening SLA limit warning is pending. Need to verify data availability statement."
      },
      {
        id: "JMS-2026-222",
        title: "Natural Language Processing in Clinical Documentation",
        author: "Michael Lee",
        authorEmail: "michael.lee@mit.edu",
        stage: "Screening",
        priority: "Low",
        assignedTo: "Prof. Arjun Patel",
        submitted: "Jun 23, 2026",
        dueDate: "Jul 02, 2026",
        dueStatus: "1 day left",
        status: "Pending",
        abstract: "Clinical document processing is historically plagued by spelling errors, domain specific abbreviations, and lack of structuring. This research evaluates deep language transformers fine-tuned on intensive care unit EHR records to automatically synthesize structured FHIR resources from clinical narratives.",
        coverLetter: "To whom it may concern,\n\nI am pleased to submit our work focusing on mapping unstructured physician notes to compliant health informatics structures. We hope you find it suitable.",
        contributors: [
          { name: "Michael Lee", email: "michael.lee@mit.edu", affiliation: "Massachusetts Institute of Technology", role: "Primary Author" }
        ],
        reviewersAssigned: [] as string[],
        comments: "Assigned editor reviewing peer reviewer candidates."
      },
      {
        id: "JMS-2026-223",
        title: "Federated Learning for Healthcare Systems",
        author: "Sarah Johnson",
        authorEmail: "sarah.j@datasci.org",
        stage: "Under Review",
        priority: "High",
        assignedTo: "Dr. Maria Garcia",
        submitted: "Jun 22, 2026",
        dueDate: "Jul 04, 2026",
        dueStatus: "3 days left",
        status: "In Progress",
        abstract: "Training deep models on multi-institutional medical data raises critical privacy constraints. This paper introduces a secure multiparty federated learning framework integrated with differential privacy guarantees, enabling collaborative brain tumor segmentations across three global hospitals.",
        coverLetter: "Dear Editor,\n\nOur paper addresses the crucial dilemma of privacy vs accuracy in global clinical training datasets. We provide fully reproducible Docker and GitHub setups.",
        contributors: [
          { name: "Sarah Johnson", email: "sarah.j@datasci.org", affiliation: "Data Science Association", role: "Primary Author" }
        ],
        reviewersAssigned: ["Dr. Laura Wilson", "Dr. Robert Kim"],
        comments: "Privacy compliance check verified."
      },
      {
        id: "JMS-2026-224",
        title: "Explainable AI in Clinical Decision Support",
        author: "David Brown",
        authorEmail: "david.brown@duke.edu",
        stage: "Revision",
        priority: "Medium",
        assignedTo: "Dr. James Wilson",
        submitted: "Jun 21, 2026",
        dueDate: "Jul 06, 2026",
        dueStatus: "5 days left",
        status: "Revision",
        abstract: "Black-box diagnostic systems suffer from a lack of clinician trust. We propose an explainable AI layer utilizing SHAP (Shapley Additive exPlanations) values coupled with clinically parsed rule-induction algorithms to provide natural language explanations for ischemic stroke predictions.",
        coverLetter: "Dear Editors,\n\nWe submit our revised manuscript incorporating reviewer feedback on validation cohorts. Explanatory charts are now included in appendix.",
        contributors: [
          { name: "David Brown", email: "david.brown@duke.edu", affiliation: "Duke University", role: "Primary Author" }
        ],
        reviewersAssigned: ["Dr. Ahmed Hassan"],
        comments: "Revision uploaded on June 21st. Awaiting second screening."
      },
      {
        id: "JMS-2026-225",
        title: "Robustness of AI Models Against Adversarial Attacks",
        author: "Laura Wilson",
        authorEmail: "laura.w@bioinfo.org",
        stage: "Decision Pending",
        priority: "High",
        assignedTo: "Dr. Sarah Johnson",
        submitted: "Jun 20, 2026",
        dueDate: "-",
        dueStatus: "",
        status: "Pending",
        abstract: "Medical imaging classifiers are highly vulnerable to adversarial noise injections. This research maps the failure modes of several state-of-the-art chest X-ray classifiers under FGSM attacks and presents a novel adversarial training regimen that bolsters diagnostic robustness by 35%.",
        coverLetter: "Dear Editor,\n\nWe present a security audit of medical classifiers. As AI models transition to bedside clinics, understanding adversarial vulnerabilities is a major safety requirement.",
        contributors: [
          { name: "Laura Wilson", email: "laura.w@bioinfo.org", affiliation: "Bioinformatics Alliance", role: "Primary Author" }
        ],
        reviewersAssigned: ["Dr. Priya Sharma", "Dr. Ahmed Hassan"],
        comments: "Peer reviews completed. Editor in decision round."
      }
    ];

    // Seed/Integrate from system-wide propManuscripts that are not duplicate
    propManuscripts.forEach((pm) => {
      const exists = baseList.some(m => m.id === pm.id);
      if (!exists) {
        let stage = 'Screening';
        let status = 'Pending';
        if (pm.status === 'UNDER_REVIEW') { stage = 'Under Review'; status = 'In Progress'; }
        else if (pm.status === 'AWAITING_DECISION') { stage = 'Decision Pending'; status = 'Pending'; }
        else if (pm.status === 'ACCEPTED') { stage = 'Production'; status = 'In Progress'; }
        else if (pm.status === 'REJECTED') { stage = 'Rejected'; status = 'Completed'; }
        else if (pm.status === 'SUBMITTED') { stage = 'Screening'; status = 'Pending'; }
        else if (pm.status === 'DRAFT') { stage = 'Draft'; status = 'Pending'; }

        baseList.push({
          id: pm.id,
          title: pm.title,
          author: pm.authorName || 'Unknown Author',
          authorEmail: pm.authorEmail || 'author@medai.edu',
          stage: stage,
          priority: pm.isDoubleBlind ? 'High' : 'Medium',
          assignedTo: 'Dr. Elizabeth Vance',
          submitted: pm.submittedAt ? new Date(pm.submittedAt).toLocaleDateString() : 'Jun 25, 2026',
          dueDate: 'Jul 10, 2026',
          dueStatus: '14 days left',
          status: status,
          abstract: pm.abstract || 'No abstract supplied with proposal submission.',
          coverLetter: pm.coverLetter || 'No cover letter supplied.',
          contributors: pm.contributors?.map(c => ({ name: c.name, email: c.email, affiliation: c.affiliation, role: c.role })) || [
            { name: pm.authorName, email: pm.authorEmail, affiliation: 'Affiliated Hospital', role: 'Primary Author' }
          ],
          reviewersAssigned: pm.reviewers?.map(r => r.name) || [] as string[],
          comments: pm.editorsNotes || 'No notes yet.',
          original: pm
        } as any);
      }
    });

    return baseList;
  });

  // Master update action that syncs with system state
  const handleUpdateManuscriptRow = (id: string, updatedFields: Partial<typeof manuscriptsList[0]>) => {
    setManuscriptsList(prev => prev.map(m => {
      if (m.id === id) {
        const nextItem = { ...m, ...updatedFields };
        
        // Sync system state
        if (onUpdateManuscript && m.original) {
          let nextStatus: ManuscriptStatus = 'SUBMITTED';
          if (nextItem.stage === 'Under Review') nextStatus = 'UNDER_REVIEW';
          else if (nextItem.stage === 'Decision Pending') nextStatus = 'AWAITING_DECISION';
          else if (nextItem.stage === 'Production') nextStatus = 'ACCEPTED';
          else if (nextItem.stage === 'Rejected') nextStatus = 'REJECTED';
          else if (nextItem.stage === 'Draft') nextStatus = 'DRAFT';

          const updatedOrig: Manuscript = {
            ...m.original,
            title: nextItem.title,
            status: nextStatus,
            editorsNotes: nextItem.comments || ''
          };
          onUpdateManuscript(updatedOrig);
        }
        return nextItem;
      }
      return m;
    }));
    
    // Also keep drawer in sync if open
    if (selectedManuscript && selectedManuscript.id === id) {
      setSelectedManuscript(prev => ({ ...prev, ...updatedFields }));
    }
  };


  // Filter queue manuscripts
  const filteredQueue = manuscriptsList.filter(m => {
    const matchesSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          m.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || m.stage.toUpperCase() === statusFilter.toUpperCase() || m.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div id="coordinator-workspace" className="min-h-screen bg-[#00170f] text-[#111827] flex flex-col font-sans">
      
      {/* 1. TOP BAR SPANNING FULL WIDTH (matching Image 1 & 2) */}
      <header className="bg-[#001c12] border-b border-[#002f1f] px-6 py-4 flex items-center justify-between shrink-0 text-white z-10">
        <div className="shrink-0">
          <TuliticsLogo iconSize={36} showText={true} textColorClass="text-white" subTitle="COORDINATOR WORKSPACE • JMS CORE v3.5" usePng={true} />
        </div>

        {/* SEARCH BAR & ACTIVE BADGE */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="relative w-96">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-emerald-100/30" />
            <input 
              type="text" 
              placeholder="Search manuscripts, authors, reviewers..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#00281b] border border-[#003d29] focus:border-emerald-500/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-emerald-100/30 focus:outline-none transition-all"
            />
            <span className="absolute right-3 top-2.5 text-[9px] font-mono font-bold bg-[#003d29] text-emerald-100/40 px-1.5 py-0.5 rounded">
              ⌘ K
            </span>
          </div>
          
          <div className="bg-[#00281b] border border-emerald-500/20 rounded-full px-3 py-1 flex items-center gap-2 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[9px] font-mono font-black tracking-widest text-emerald-400 uppercase">
              COORDINATOR SESSION ACTIVE
            </span>
          </div>
        </div>

        {/* NOTIFICATIONS & AVATAR */}
        <div className="flex items-center gap-4">
          <button className="relative p-1.5 hover:bg-white/5 rounded-lg text-emerald-100/60 hover:text-white transition">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-white font-mono text-[7px] font-black flex items-center justify-center rounded-full border border-[#001c12]">
              5
            </span>
          </button>
          
          <button className="relative p-1.5 hover:bg-white/5 rounded-lg text-emerald-100/60 hover:text-white transition">
            <Inbox className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 text-white font-mono text-[7px] font-black flex items-center justify-center rounded-full border border-[#001c12]">
              8
            </span>
          </button>

          <div className="flex items-center gap-2.5 border-l border-[#002f1f] pl-4">
            <div className="w-8 h-8 rounded-lg bg-[#008751] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              JA
            </div>
            <div className="hidden sm:block text-left leading-none">
              <span className="text-[10px] font-bold text-white block">Dr. Akshay</span>
              <span className="text-[8px] font-mono font-medium text-emerald-100/40 mt-0.5 block">Active User</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-emerald-100/40" />
          </div>
        </div>
      </header>

      {/* 2. MAIN DIV WITH SIDEBAR AND COMPONENT CONTAINER */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden min-h-0">
        
        {/* SIDEBAR NAVIGATION */}
        <aside id="coordinator-sidebar" className="w-full md:w-68 bg-[#00170f] border-r border-[#002116] p-5 flex flex-col justify-between text-white shrink-0">
          <div className="space-y-6">
            <div className="bg-[#002216] border border-[#003823]/50 p-3.5 rounded-xl flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 bg-[#008751] text-white flex items-center justify-center rounded-lg font-black text-xs select-none shrink-0 shadow-sm">
                JA
              </div>
              <div className="text-left leading-none">
                <span className="text-[7.5px] font-mono font-black tracking-widest text-[#a3cfbb]/50 block mb-0.5 uppercase">
                  COORDINATOR PORTAL
                </span>
                <h2 className="font-extrabold text-[11px] text-white tracking-tight uppercase leading-none">
                  Dr. Akshay
                </h2>
                <div className="flex items-center gap-1 text-[9px] text-[#a3cfbb]/70 mt-1 leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>OJS Core Substrate</span>
                </div>
              </div>
            </div>

            <nav className="space-y-1 text-left">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, count: null },
                { id: 'queue', label: 'Manuscript Queue', icon: FileText, count: 19 },
                { id: 'board', label: 'Editorial Board', icon: Users, count: 4 },
                { id: 'reviewers', label: 'Reviewers', icon: Users, count: null },
                { id: 'analytics', label: 'Reports & Analytics', icon: BarChart3, count: null },
                { id: 'protocols', label: 'Protocols', icon: FileCheck, count: null },
                { id: 'communications', label: 'Communications', icon: Mail, count: null },
                { id: 'settings', label: 'Settings', icon: SettingsIcon, count: null },
                { id: 'audit', label: 'Audit Trail', icon: Shield, count: null },
              ].map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      dismissAlert();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer ${
                      isActive 
                        ? 'bg-[#008751] text-white font-black shadow-sm' 
                        : 'bg-transparent text-emerald-100/60 hover:bg-white/5 hover:text-white font-semibold'
                    }`}
                  >
                    <TabIcon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-emerald-100/40'}`} />
                    <span className="font-sans text-xs tracking-wide leading-none">{tab.label}</span>
                    {tab.count !== null && (
                      <span className={`ml-auto font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-[#004d2e] text-emerald-100' : 'bg-white/10 text-emerald-100/70'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="bg-gradient-to-br from-[#002e1c] to-[#00170f] border border-[#004229] rounded-xl p-3.5 mt-6 text-left relative overflow-hidden shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div>
                  <span className="text-[9px] font-sans font-extrabold uppercase tracking-wider text-amber-400 block leading-none">
                    EXCELLENCE IN
                  </span>
                  <span className="text-[10px] font-sans font-black text-white block mt-0.5 leading-none">
                    Scholarly Publishing
                  </span>
                </div>
              </div>
              <p className="text-[9.5px] text-emerald-100/40 font-medium leading-normal">
                Building the future of academic communication and peer review.
              </p>
              <button 
                onClick={() => {
                  setAlertMessage({ type: 'info', text: 'Navigating to public journal portal...' });
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[#004d2e] hover:bg-[#006837] text-white border border-[#005c37] text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition duration-150 cursor-pointer"
              >
                <span>View Journal Site</span>
                <ExternalLink className="w-3 h-3 text-white/80" />
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN COMPONENT CONTAINER WITH PREMIUM White Nested Card style */}
        <div className="flex-1 bg-[#00170f] md:pl-0 md:p-3 overflow-hidden flex flex-col min-h-0">
          <main className="flex-1 bg-slate-50 md:rounded-3xl border border-[#002b1d]/20 p-6 md:p-8 overflow-y-auto text-left relative flex flex-col gap-6">
            
            {/* ALERT DISPLAY */}
            {alertMessage && (
              <div className={`border rounded-xl px-4 py-3 flex items-center justify-between text-xs font-mono transition-all duration-300 ${
                alertMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${alertMessage.type === 'success' ? 'bg-green-600' : 'bg-blue-600'}`} />
                  <strong className="uppercase">SYSTEM DISPATCHER:</strong>
                  <span>{alertMessage.text}</span>
                </div>
                <button 
                  onClick={dismissAlert}
                  className="hover:underline font-bold uppercase text-[10px] tracking-wider"
                >
                  [Dismiss]
                </button>
              </div>
            )}

            {/* HEADER BAR FOR ACTIVE SCREEN */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-200 pb-6">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  {activeTab === 'dashboard' && 'Dashboard Overview'}
                  {activeTab === 'queue' && 'Manuscript Queue'}
                  {activeTab === 'board' && 'Editorial Board'}
                  {activeTab === 'reviewers' && 'Reviewer Register'}
                  {activeTab === 'analytics' && 'Reports & Analytics'}
                  {activeTab === 'protocols' && 'Protocols & Verification'}
                  {activeTab === 'communications' && 'Communications Dispatcher'}
                  {activeTab === 'settings' && 'System Settings'}
                  {activeTab === 'audit' && 'Cryptographic Audit Trail'}
                </h1>
                <p className="text-slate-500 text-xs mt-1 font-medium">
                  {activeTab === 'dashboard' && 'Monitor editorial pipeline, decisions backlog, and active SLAs.'}
                  {activeTab === 'queue' && 'Manage and track all manuscripts through the editorial workflow.'}
                  {activeTab === 'board' && 'Manage editorial board members, roles, responsibilities, and performance.'}
                  {activeTab === 'reviewers' && 'Manage peer reviewer performance matrix and track invitations.'}
                  {activeTab === 'analytics' && 'Real-time scholarly performance indices, acceptance curves, and triage logs.'}
                  {activeTab === 'protocols' && 'Formulate academic governance policies and double-blind parameters.'}
                  {activeTab === 'communications' && 'Manage notification templates, automated SMTP triggers, and active SMTP dispatcher.'}
                  {activeTab === 'settings' && 'Configure validation gates, review response windows, and access scopes.'}
                  {activeTab === 'audit' && 'Verifiable event log of all programmatic transitions and editor overrides.'}
                </p>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-sm mr-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <div>
                    <span className="font-bold text-slate-800 block">June 25, 2026</span>
                  </div>
                </div>

                {activeTab === 'queue' && (
                  <>
                    <button onClick={() => setAlertMessage({ type: 'success', text: 'Spreadsheet export successful.' })} className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-emerald-600 text-emerald-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-sm">
                      <Download className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>
                    <button onClick={() => setAlertMessage({ type: 'info', text: 'Technical filter constraints enabled.' })} className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-emerald-600 text-emerald-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-sm">
                      <Filter className="w-3.5 h-3.5" />
                      <span>Filter</span>
                    </button>
                    <button onClick={() => setIsNewSubmissionModalOpen(true)} className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-lg transition shadow-sm">
                      + New Submission
                    </button>
                  </>
                )}

                {activeTab === 'board' && (
                  <>
                    <button onClick={() => setAlertMessage({ type: 'success', text: 'Exporting editorial directory...' })} className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-emerald-600 text-emerald-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-sm">
                      <Download className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>
                    <button onClick={() => setIsInviteMemberModalOpen(true)} className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-lg transition shadow-sm">
                      Invite Member
                    </button>
                  </>
                )}

                {activeTab === 'reviewers' && (
                  <>
                    <button onClick={() => setIsInviteReviewerModalOpen(true)} className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-lg transition shadow-sm">
                      Invite Reviewer
                    </button>
                  </>
                )}

                {activeTab === 'communications' && (
                  <>
                    <button onClick={() => setAlertMessage({ type: 'info', text: 'SMTP mail templates loaded.' })} className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-emerald-600 text-emerald-700 text-xs font-bold rounded-lg transition shadow-sm">
                      Email Templates
                    </button>
                    <button onClick={() => setAlertMessage({ type: 'success', text: 'SMTP direct dispatch initialized.' })} className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-lg transition shadow-sm">
                      + New Message
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ----------------- SCREEN 1: DASHBOARD VIEW ----------------- */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* DYNAMIC PIPELINE ROW WITH MAXIMUM STYLED "SUBMITTED" BOX */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-xs font-mono font-black text-emerald-800 uppercase tracking-wider">
                      Editorial Workflow Pipeline
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono font-bold">Real-time telemetry</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* STEP 1: SUBMITTED - HIGHLIGHTED MAXIMUM SIZE & BOLD */}
                    <div className="relative overflow-hidden rounded-2xl border-4 border-emerald-500 bg-emerald-50 p-6 shadow-md transition transform hover:scale-[1.02] duration-200 ring-4 ring-emerald-400/20">
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-mono font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        1
                      </div>
                      <div className="text-[11px] font-mono font-black uppercase text-emerald-800 tracking-wider">
                        Current Queue
                      </div>
                      {/* Name submitted in maximum size and bold */}
                      <div className="text-2xl font-black text-emerald-950 uppercase tracking-tight mt-1">
                        SUBMITTED
                      </div>
                      <div className="text-4xl font-extrabold text-emerald-950 tracking-tight mt-2 flex items-baseline gap-2">
                        <span>19</span>
                        <span className="text-xs font-bold text-emerald-700 font-sans">manuscripts</span>
                      </div>
                      <div className="text-xs font-bold text-emerald-800/80 mt-2 leading-tight">
                        Awaiting technical screening check.
                      </div>
                      <div className="w-full bg-emerald-200 h-2 rounded-full overflow-hidden mt-4">
                        <div className="bg-emerald-600 h-full w-[80%] rounded-full"></div>
                      </div>
                    </div>

                    {/* STEP 2: SCREENING */}
                    <div className="relative overflow-hidden rounded-2xl border border-amber-300 bg-amber-50/50 p-4 shadow-sm transition">
                      <div className="absolute top-2 right-2 bg-amber-500 text-white text-[9px] font-mono font-semibold w-4 h-4 rounded-full flex items-center justify-center">
                        2
                      </div>
                      <div className="text-[10px] font-mono font-bold uppercase text-amber-700 tracking-wider">
                        Desk Phase
                      </div>
                      <div className="text-lg font-black text-amber-900 uppercase tracking-tight mt-1">
                        Screening
                      </div>
                      <div className="text-2xl font-extrabold text-amber-950 tracking-tight mt-2">
                        12
                      </div>
                      <div className="text-[11px] font-semibold text-amber-800 mt-1">
                        Initial technical vetting
                      </div>
                      <div className="w-full bg-amber-100 h-1.5 rounded-full overflow-hidden mt-4">
                        <div className="bg-amber-500 h-full w-[45%]"></div>
                      </div>
                    </div>

                    {/* STEP 3: UNDER REVIEW */}
                    <div className="relative overflow-hidden rounded-2xl border border-blue-300 bg-blue-50/50 p-4 shadow-sm transition">
                      <div className="absolute top-2 right-2 bg-blue-500 text-white text-[9px] font-mono font-semibold w-4 h-4 rounded-full flex items-center justify-center">
                        3
                      </div>
                      <div className="text-[10px] font-mono font-bold uppercase text-blue-700 tracking-wider">
                        Peer Vetting
                      </div>
                      <div className="text-lg font-black text-blue-900 uppercase tracking-tight mt-1">
                        Under Review
                      </div>
                      <div className="text-2xl font-extrabold text-blue-950 tracking-tight mt-2">
                        8
                      </div>
                      <div className="text-[11px] font-semibold text-blue-800 mt-1">
                        Active external review reports
                      </div>
                      <div className="w-full bg-blue-100 h-1.5 rounded-full overflow-hidden mt-4">
                        <div className="bg-blue-500 h-full w-[30%]"></div>
                      </div>
                    </div>

                    {/* STEP 4: DECISION */}
                    <div className="relative overflow-hidden rounded-2xl border border-purple-300 bg-purple-50/50 p-4 shadow-sm transition">
                      <div className="absolute top-2 right-2 bg-purple-500 text-white text-[9px] font-mono font-semibold w-4 h-4 rounded-full flex items-center justify-center">
                        4
                      </div>
                      <div className="text-[10px] font-mono font-bold uppercase text-purple-700 tracking-wider">
                        Academic Gate
                      </div>
                      <div className="text-lg font-black text-purple-900 uppercase tracking-tight mt-1">
                        Decision
                      </div>
                      <div className="text-2xl font-extrabold text-purple-950 tracking-tight mt-2">
                        7
                      </div>
                      <div className="text-[11px] font-semibold text-purple-800 mt-1">
                        Awaiting editorial judgment
                      </div>
                      <div className="w-full bg-purple-100 h-1.5 rounded-full overflow-hidden mt-4">
                        <div className="bg-purple-500 h-full w-[25%]"></div>
                      </div>
                    </div>

                    {/* STEP 5: PRODUCTION */}
                    <div className="relative overflow-hidden rounded-2xl border border-teal-300 bg-teal-50/50 p-4 shadow-sm transition">
                      <div className="absolute top-2 right-2 bg-teal-500 text-white text-[9px] font-mono font-semibold w-4 h-4 rounded-full flex items-center justify-center">
                        5
                      </div>
                      <div className="text-[10px] font-mono font-bold uppercase text-teal-700 tracking-wider">
                        Archiving Phase
                      </div>
                      <div className="text-lg font-black text-teal-900 uppercase tracking-tight mt-1">
                        Production
                      </div>
                      <div className="text-2xl font-extrabold text-teal-950 tracking-tight mt-2">
                        13
                      </div>
                      <div className="text-[11px] font-semibold text-teal-800 mt-1">
                        Injecting DOI variables
                      </div>
                      <div className="w-full bg-teal-100 h-1.5 rounded-full overflow-hidden mt-4">
                        <div className="bg-teal-500 h-full w-[65%]"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DOUBLE COLUMN: WARNING TASKS AND EDITORIAL BOARD SUMMARY */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* WARNING TASKS */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="text-xs font-mono font-black text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertOctagon className="w-4 h-4" />
                        <span>SLA Warning Exceptions (3)</span>
                      </h3>
                      <span className="text-[9px] font-mono text-slate-400">Review required</span>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                        <div className="text-xs">
                          <strong className="block font-bold text-red-950">JMS-2026-220 — Overdue Review Round</strong>
                          <p className="text-red-800 mt-1">Assigned reviewer Dr. Elizabeth Vance is overdue on decision feedback check by 4 days.</p>
                        </div>
                      </div>

                      <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <div className="text-xs">
                          <strong className="block font-bold text-amber-950">Desk Screening Threshold Warning</strong>
                          <p className="text-amber-800 mt-1">4 submissions have been in unassigned screening queue for over the SLA limit of {screeningTimeLimit} days.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* EDITORIAL RECENT ACTIVITY */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="text-xs font-mono font-black text-emerald-800 uppercase tracking-wider">
                        Recent Peer-Review Actions
                      </h3>
                      <span className="text-[9px] font-mono text-slate-400">SMTP logs</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      {communicationsData.slice(0, 4).map((comm, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b last:border-0">
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-900 block truncate max-w-[280px]">{comm.subject}</span>
                            <span className="text-[10px] text-slate-400">Recipient: {comm.recipient} ({comm.type})</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">{comm.sent}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* ----------------- SCREEN 2: MANUSCRIPT QUEUE ----------------- */}
            {activeTab === 'queue' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* 4 STATS CARDS ROW (Exact metrics matching first image) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Manuscripts</span>
                      <div className="text-2xl font-extrabold text-slate-900">46</div>
                      <span className="text-[9px] text-emerald-600 block font-semibold">All Submissions</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Submissions</span>
                      <div className="text-2xl font-extrabold text-slate-900">19</div>
                      <span className="text-[9px] text-blue-600 block font-semibold">This Month</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 shrink-0">
                      <Send className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Awaiting Screening</span>
                      <div className="text-2xl font-extrabold text-slate-900">12</div>
                      <span className="text-[9px] text-amber-600 block font-semibold">Needs Attention</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Under Review</span>
                      <div className="text-2xl font-extrabold text-slate-900">8</div>
                      <span className="text-[9px] text-purple-600 block font-semibold">In Progress</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-700 shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Decision Pending</span>
                      <div className="text-2xl font-extrabold text-slate-900">7</div>
                      <span className="text-[9px] text-rose-600 block font-semibold">Awaiting Decision</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-700 shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500"></div>
                  </div>
                </div>

                {/* FILTER PILLS ROW AND SEARCH BAR (Matching first image) */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'All Stages', count: 46, filterValue: 'ALL' },
                      { label: 'Submission', count: 19, filterValue: 'SUBMITTED' },
                      { label: 'Screening', count: 12, filterValue: 'SCREENING' },
                      { label: 'Review', count: 8, filterValue: 'UNDER REVIEW' },
                      { label: 'Decision', count: 7, filterValue: 'DECISION PENDING' },
                      { label: 'Production', count: 0, filterValue: 'PRODUCTION' }
                    ].map((pill, idx) => {
                      const isActive = statusFilter === pill.filterValue;
                      return (
                        <button 
                          key={idx}
                          onClick={() => setStatusFilter(pill.filterValue)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                            isActive ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {pill.label} ({pill.count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative w-full lg:w-72 shrink-0">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search manuscripts..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-slate-300 focus:border-emerald-600 pl-9 pr-3 py-2 rounded-lg text-xs placeholder-slate-400 outline-none"
                    />
                  </div>
                </div>

                {/* TABLE CARD */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                          <th className="p-4">ID</th>
                          <th className="p-4">Title</th>
                          <th className="p-4">Author</th>
                          <th className="p-4">Stage</th>
                          <th className="p-4">Priority</th>
                          <th className="p-4">Assigned To</th>
                          <th className="p-4">Submitted</th>
                          <th className="p-4">Due Date</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {filteredQueue.map((item, idx) => (
                          <tr key={idx} onClick={() => setSelectedManuscript(item)} className="hover:bg-slate-50/50 transition cursor-pointer">
                            <td className="p-4 font-mono font-bold text-emerald-800">{item.id}</td>
                            <td className="p-4">
                              <span onClick={(e) => { e.stopPropagation(); setSelectedManuscript(item); }} className="font-extrabold text-slate-900 block leading-tight hover:text-emerald-700 transition cursor-pointer">
                                {item.title}
                              </span>
                              {doubleBlindRequired && (
                                <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase">
                                  <Shield className="w-2.5 h-2.5" /> Double-Blind Secured
                                </span>
                              )}
                            </td>
                            {/* ANONYMITY SAFEGUARD check: hide author name if double-blind is strictly on and viewing reviewer view, but since this is Coordinator dashboard we show sanitized view indicator */}
                            <td className="p-4">
                              <span className="font-bold text-slate-800 block">{item.author}</span>
                              <span className="text-[10px] text-slate-400">Submitting Author</span>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.stage === 'Under Review' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                item.stage === 'Screening' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                item.stage === 'Revision' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                'bg-red-50 text-red-700 border border-red-200'
                              }`}>
                                {item.stage}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.priority === 'High' ? 'bg-red-50 text-red-700' :
                                item.priority === 'Medium' ? 'bg-amber-50 text-amber-700' :
                                'bg-green-50 text-green-700'
                              }`}>
                                {item.priority}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className="font-semibold text-slate-800">{item.assignedTo}</span>
                            </td>
                            <td className="p-4 text-slate-500 font-mono font-semibold">{item.submitted}</td>
                            <td className="p-4 leading-normal">
                              <span className="font-mono text-slate-600 block font-semibold">{item.dueDate}</span>
                              {item.dueStatus && (
                                <span className={`text-[10px] font-bold ${item.dueStatus === 'Overdue' ? 'text-red-600 animate-pulse' : 'text-emerald-700'}`}>
                                  {item.dueStatus}
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                item.status === 'In Progress' ? 'bg-emerald-100 text-emerald-800' :
                                item.status === 'Revision' ? 'bg-purple-100 text-purple-800' :
                                'bg-amber-100 text-amber-800'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <button onClick={(e) => { e.stopPropagation(); setSelectedManuscript(item); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 transition">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION SECTION (exact from first image) */}
                  <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-500">
                    <div>Showing 1 to 6 of 46 results</div>
                    <div className="flex items-center gap-1">
                      <button className="p-1 hover:bg-slate-200 rounded text-slate-400">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {[1, 2, 3, 4, 5, '...', 8].map((page, idx) => (
                        <button 
                          key={idx} 
                          onClick={() => { if (typeof page === 'number') setCurrentPage(page); }}
                          className={`w-7 h-7 flex items-center justify-center rounded transition ${
                            currentPage === page ? 'bg-emerald-700 text-white font-bold' : 'hover:bg-slate-200'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button className="p-1 hover:bg-slate-200 rounded text-slate-400">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ----------------- SCREEN 3: EDITORIAL BOARD ----------------- */}
            {activeTab === 'board' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* 5 STATS CARDS ROW (Exact metrics matching Editorial Board Image) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Members</span>
                      <div className="text-2xl font-extrabold text-slate-900">24</div>
                      <span className="text-[9px] text-emerald-600 block font-semibold flex items-center gap-1">
                        <span>↑ 2 this month</span>
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Members</span>
                      <div className="text-2xl font-extrabold text-slate-900">20</div>
                      <span className="text-[9px] text-blue-600 block font-semibold">83% of total</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 shrink-0">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invited</span>
                      <div className="text-2xl font-extrabold text-slate-900">3</div>
                      <span className="text-[9px] text-amber-600 block font-semibold">Pending acceptance</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inactive</span>
                      <div className="text-2xl font-extrabold text-slate-900">1</div>
                      <span className="text-[9px] text-slate-500 block font-semibold">Deactivated</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-400"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg. Response Time</span>
                      <div className="text-2xl font-extrabold text-slate-900">2.4 days</div>
                      <span className="text-[9px] text-emerald-600 block font-semibold">To editorial tasks</span>
                    </div>
                    {/* Tiny representation of Sparkline wave chart matching image */}
                    <div className="w-12 h-6 flex items-end gap-0.5 pb-1 shrink-0">
                      <div className="bg-emerald-300 w-1.5 h-2 rounded-t"></div>
                      <div className="bg-emerald-400 w-1.5 h-3 rounded-t"></div>
                      <div className="bg-emerald-300 w-1.5 h-1 rounded-t"></div>
                      <div className="bg-emerald-500 w-1.5 h-4 rounded-t"></div>
                      <div className="bg-emerald-600 w-1.5 h-5 rounded-t"></div>
                    </div>
                  </div>
                </div>

                {/* DOUBLE COLUMN: DIRECTORY & SIDE STATS PANEL */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* LEFT: DIRECTORY TABLE (2/3 width) */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                      <div className="flex flex-wrap gap-2">
                        {['All Members (24)', 'Editors (6)', 'Associate Editors (8)', 'Section Editors (6)'].map((pill, idx) => (
                          <button key={idx} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${idx === 0 ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            {pill}
                          </button>
                        ))}
                      </div>

                      <div className="relative w-full sm:w-56 shrink-0">
                        <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-400" />
                        <input type="text" placeholder="Search members..." className="w-full bg-white border border-slate-300 pl-8 pr-3 py-1.5 rounded-lg text-xs placeholder-slate-400 outline-none" />
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                              <th className="p-4">Member</th>
                              <th className="p-4">Role</th>
                              <th className="p-4">Specialty Discipline</th>
                              <th className="p-4">Status</th>
                              <th className="p-4">Joined On</th>
                              <th className="p-4">Last Active</th>
                              <th className="p-4 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {boardMembers.map((member, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition">
                                <td className="p-4">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-800 font-extrabold flex items-center justify-center text-[10px] shrink-0 border border-emerald-100">
                                      {member.name.split(' ').map(n=>n[0]).join('')}
                                    </div>
                                    <div>
                                      <span className="font-extrabold text-slate-900 block leading-tight">{member.name}</span>
                                      <span className="text-[10px] text-slate-400 font-mono font-medium">{member.email}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <span className={`px-2 py-0.5 rounded-[6px] text-[10px] font-bold border ${
                                    member.role === 'Editor-in-Chief' ? 'bg-green-50 text-green-700 border-green-200' :
                                    member.role === 'Associate Editor' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-purple-50 text-purple-700 border-purple-200'
                                  }`}>
                                    {member.role}
                                  </span>
                                </td>
                                <td className="p-4 font-semibold text-slate-700">{member.specialty}</td>
                                <td className="p-4">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      member.status === 'Active' ? 'bg-emerald-500' :
                                      member.status === 'Invited' ? 'bg-blue-500' :
                                      'bg-red-400'
                                    }`} />
                                    <span className="font-semibold text-slate-800">{member.status}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-slate-500 font-semibold">{member.joinedOn}</td>
                                <td className="p-4 text-slate-500 font-semibold">{member.lastActive}</td>
                                <td className="p-4 text-center">
                                  <button onClick={() => setAlertMessage({ type: 'info', text: `Initiated staff record review for ${member.name}` })} className="p-1 hover:bg-slate-100 rounded text-slate-500">
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT SIDEBAR STATS PANEL (1/3 width, exactly matching Editorial Board Image) */}
                  <div className="space-y-6">
                    
                    {/* Role Distribution Panel */}
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
                      <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider pb-2 border-b">
                        Role Distribution
                      </h4>
                      
                      <div className="flex items-center gap-6">
                        {/* Custom Circular Progress representation of Donut chart */}
                        <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="32" cy="32" r="28" className="stroke-slate-100 fill-none" strokeWidth="8" />
                            <circle cx="32" cy="32" r="28" className="stroke-emerald-600 fill-none" strokeWidth="8" strokeDasharray="175" strokeDashoffset="45" />
                          </svg>
                          <span className="absolute text-xs font-mono font-extrabold text-slate-800">24</span>
                        </div>

                        <div className="text-[10px] font-semibold text-slate-500 space-y-1 w-full">
                          <div className="flex justify-between items-center">
                            <span>Editor-in-Chief</span>
                            <span className="font-bold text-slate-800">1 (4%)</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Associate Editors</span>
                            <span className="font-bold text-slate-800">8 (33%)</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Section Editors</span>
                            <span className="font-bold text-slate-800">6 (25%)</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Editorial Board</span>
                            <span className="font-bold text-slate-800">9 (38%)</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Top Expertise Areas Panel */}
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-3">
                      <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider pb-2 border-b">
                        Top Expertise Areas
                      </h4>
                      
                      <div className="space-y-2.5 text-xs font-semibold">
                        {[
                          { title: 'AI in Healthcare', value: 12, max: 15 },
                          { title: 'Medical Imaging', value: 9, max: 15 },
                          { title: 'Machine Learning', value: 8, max: 15 },
                          { title: 'Bioinformatics', value: 7, max: 15 },
                          { title: 'Data Science', value: 6, max: 15 }
                        ].map((exp, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-700">{exp.title}</span>
                              <span className="font-bold text-slate-900">{exp.value} experts</span>
                            </div>
                            <div className="bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${(exp.value / exp.max) * 100}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Support Card Panel */}
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5 rounded-2xl text-left shadow-xs">
                      <HelpCircle className="w-8 h-8 text-emerald-700" />
                      <h4 className="font-black text-sm text-emerald-950 tracking-tight mt-3">Need More Editorial Support?</h4>
                      <p className="text-xs text-emerald-800 mt-1 leading-normal">Invite qualified clinical informatics or diagnostic AI experts to strengthen your specialized review sub-boards.</p>
                      <button onClick={() => setAlertMessage({ type: 'info', text: 'Opening editor invitation terminal...' })} className="mt-4 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-lg transition duration-150">
                        Invite Member
                      </button>
                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* ----------------- SCREEN 4: REVIEWERS ----------------- */}
            {activeTab === 'reviewers' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* 4 STATS CARDS ROW */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Reviewers</span>
                      <div className="text-2xl font-extrabold text-slate-900">124</div>
                      <span className="text-[9px] text-emerald-600 block font-semibold">Active In Database</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Reviewers</span>
                      <div className="text-2xl font-extrabold text-slate-900">98</div>
                      <span className="text-[9px] text-blue-600 block font-semibold">Completed Reviews</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 shrink-0">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Invitations</span>
                      <div className="text-2xl font-extrabold text-slate-900">24</div>
                      <span className="text-[9px] text-amber-600 block font-semibold">Awaiting Response</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500"></div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Declined</span>
                      <div className="text-2xl font-extrabold text-slate-900">12</div>
                      <span className="text-[9px] text-red-500 block font-semibold">This Month</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-700 shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500"></div>
                  </div>
                </div>

                {/* REVIEWERS TABLE */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center flex-wrap gap-4">
                    <div className="text-xs font-bold text-slate-700">Database Reviewer Register</div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Search reviewers..." className="bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-xs outline-none" />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                          <th className="p-4">Reviewer</th>
                          <th className="p-4">Specialty</th>
                          <th className="p-4 text-center">Invited</th>
                          <th className="p-4 text-center">Accepted</th>
                          <th className="p-4 text-center">Completed</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {reviewersData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="p-4 font-bold text-slate-900">{item.name}</td>
                            <td className="p-4 text-slate-700 font-semibold">{item.specialty}</td>
                            <td className="p-4 text-center font-mono text-slate-600">{item.invited}</td>
                            <td className="p-4 text-center font-mono text-slate-600">{item.accepted}</td>
                            <td className="p-4 text-center font-mono text-slate-600 font-bold text-emerald-800">{item.completed}</td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                                item.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <button onClick={() => setAlertMessage({ type: 'info', text: `Reviewer matrix loaded for ${item.name}` })} className="px-3 py-1 border border-slate-300 rounded text-slate-700 hover:border-black text-[10px] font-bold transition">
                                Profile
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ----------------- SCREEN 5: REPORTS & ANALYTICS ----------------- */}
            {activeTab === 'analytics' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* Title & Actions Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-100">
                  <div className="text-left">
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Reports & Analytics</h1>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      Comprehensive insights into journal performance and editorial workflow.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-4 sm:mt-0">
                    <button 
                      onClick={() => setAlertMessage({ type: 'info', text: 'Select Date Range filter activated (May 25 – Jun 25, 2026).' })}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950 transition shadow-xs"
                    >
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>May 25 – Jun 25, 2026</span>
                    </button>
                    <button 
                      onClick={() => {
                        // Create custom audit log
                        setAuditData(prev => [
                          {
                            event: "Scholarly analytics report exported to CSV/XML",
                            actor: "Dr. Akshay (Coordinator)",
                            target: "Platform Metrics System",
                            date: "Just Now",
                            status: "Success"
                          },
                          ...prev
                        ]);
                        setAlertMessage({ type: 'success', text: 'Scholarly report exported successfully as OJS-XML and Excel spreadsheet.' });
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950 transition shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Export Report</span>
                    </button>
                  </div>
                </div>

                {/* KPI Metrics Row - 6 Columns Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {/* Card 1: Total Submissions */}
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-1 hover:border-emerald-500 hover:shadow-md transition duration-200 text-left relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="w-16 h-8 opacity-85">
                        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                          <path d="M5 25 Q20 30 35 20 T65 25 T95 15 T120 5" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-2">Total Submissions</span>
                    <div className="text-2xl font-extrabold text-slate-900 leading-none">286</div>
                    <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-extrabold mt-1">
                      <TrendingUp className="w-3 h-3" />
                      <span>18% vs last month</span>
                    </div>
                  </div>

                  {/* Card 2: Acceptance Rate */}
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-1 hover:border-blue-500 hover:shadow-md transition duration-200 text-left relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="w-16 h-8 opacity-85">
                        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                          <path d="M5 25 Q20 20 35 28 T65 24 T95 12 T120 8" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-2">Acceptance Rate</span>
                    <div className="text-2xl font-extrabold text-slate-900 leading-none">42%</div>
                    <div className="flex items-center gap-1 text-[10px] text-blue-600 font-extrabold mt-1">
                      <TrendingUp className="w-3 h-3" />
                      <span>5% vs last month</span>
                    </div>
                  </div>

                  {/* Card 3: Median Review Time */}
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-1 hover:border-purple-500 hover:shadow-md transition duration-200 text-left relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="w-16 h-8 opacity-85">
                        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                          <path d="M5 15 L25 25 L45 20 L65 35 L85 18 L105 30 L125 22" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-2">Median Review Time</span>
                    <div className="text-2xl font-extrabold text-slate-900 leading-none">18.6 days</div>
                    <div className="flex items-center gap-1 text-[10px] text-purple-600 font-extrabold mt-1">
                      <TrendingDown className="w-3 h-3 text-purple-600" />
                      <span>2.4 days vs last month</span>
                    </div>
                  </div>

                  {/* Card 4: Published Articles */}
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-1 hover:border-orange-500 hover:shadow-md transition duration-200 text-left relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 group-hover:scale-110 transition">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="w-16 h-8 opacity-85">
                        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                          <path d="M5 25 Q20 22 35 15 T65 26 T95 18 T120 20" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-2">Published Articles</span>
                    <div className="text-2xl font-extrabold text-slate-900 leading-none">128</div>
                    <div className="flex items-center gap-1 text-[10px] text-orange-600 font-extrabold mt-1">
                      <TrendingDown className="w-3 h-3" />
                      <span>22% vs last month</span>
                    </div>
                  </div>

                  {/* Card 5: Active Reviewers */}
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-1 hover:border-teal-500 hover:shadow-md transition duration-200 text-left relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 group-hover:scale-110 transition">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="w-16 h-8 opacity-85">
                        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                          <path d="M5 30 L25 25 L45 28 L65 18 L85 22 L105 12 L125 10" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-2">Active Reviewers</span>
                    <div className="text-2xl font-extrabold text-slate-900 leading-none">124</div>
                    <div className="flex items-center gap-1 text-[10px] text-teal-600 font-extrabold mt-1">
                      <TrendingUp className="w-3 h-3" />
                      <span>12% vs last month</span>
                    </div>
                  </div>

                  {/* Card 6: Reviewer Response Rate */}
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-1 hover:border-pink-500 hover:shadow-md transition duration-200 text-left relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center text-pink-600 group-hover:scale-110 transition">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="w-16 h-8 opacity-85">
                        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                          <path d="M5 35 L25 28 L45 32 L65 20 L85 15 L105 18 L125 12" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-2">Reviewer Response Rate</span>
                    <div className="text-2xl font-extrabold text-slate-900 leading-none">75%</div>
                    <div className="flex items-center gap-1 text-[10px] text-pink-600 font-extrabold mt-1">
                      <TrendingUp className="w-3 h-3" />
                      <span>8% vs last month</span>
                    </div>
                  </div>
                </div>

                {/* Row 2: Submissions Trend, Editorial Decision Breakdown & Triage Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Card A: Submissions Trend Over Time */}
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b pb-3 mb-4">
                      <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        Submissions Trend Over Time
                      </h4>
                      <select className="text-[10px] font-bold border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50 text-slate-600 outline-none">
                        <option>Monthly</option>
                        <option>Quarterly</option>
                        <option>Weekly</option>
                      </select>
                    </div>

                    {/* Area line chart representing the exact trend values: Jan 35, Feb 42, Mar 50, Apr 48, May 76, Jun 81 */}
                    <div className="h-48 relative">
                      {/* Grid lines */}
                      <div className="absolute inset-x-0 top-0 h-full flex flex-col justify-between pointer-events-none opacity-40">
                        <div className="border-b border-dashed border-slate-200 w-full h-0"></div>
                        <div className="border-b border-dashed border-slate-200 w-full h-0"></div>
                        <div className="border-b border-dashed border-slate-200 w-full h-0"></div>
                        <div className="border-b border-dashed border-slate-200 w-full h-0"></div>
                      </div>

                      <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                        {/* Area Gradient */}
                        <path 
                          d="M 25 160 L 115 140 L 205 110 L 295 118 L 385 50 L 475 30 L 475 190 L 25 190 Z" 
                          fill="url(#trendGrad)" 
                        />
                        {/* Line path */}
                        <path 
                          d="M 25 160 L 115 140 L 205 110 L 295 118 L 385 50 L 475 30" 
                          fill="none" 
                          stroke="#10b981" 
                          strokeWidth="3.5" 
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <defs>
                          <linearGradient id="trendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                          </linearGradient>
                        </defs>

                        {/* Interactive Data Markers & Labels */}
                        {/* Jan 35 */}
                        <circle cx="25" cy="160" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" className="cursor-pointer hover:r-7 transition" />
                        {/* Feb 42 */}
                        <circle cx="115" cy="140" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                        {/* Mar 50 */}
                        <circle cx="205" cy="110" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                        {/* Apr 48 */}
                        <circle cx="295" cy="118" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                        {/* May 76 */}
                        <circle cx="385" cy="50" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                        {/* Jun 81 */}
                        <circle cx="475" cy="30" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                      </svg>

                      {/* Floating value indicators aligned perfectly with peak markers */}
                      <span className="absolute left-[3%] bottom-[16%] text-[10px] font-black text-slate-800 bg-slate-50 border px-1 rounded shadow-xs font-mono">35</span>
                      <span className="absolute left-[21%] bottom-[26%] text-[10px] font-black text-slate-800 bg-slate-50 border px-1 rounded shadow-xs font-mono">42</span>
                      <span className="absolute left-[39%] bottom-[41%] text-[10px] font-black text-slate-800 bg-slate-50 border px-1 rounded shadow-xs font-mono">50</span>
                      <span className="absolute left-[57%] bottom-[37%] text-[10px] font-black text-slate-800 bg-slate-50 border px-1 rounded shadow-xs font-mono">48</span>
                      <span className="absolute left-[75%] bottom-[71%] text-[10px] font-black text-slate-800 bg-slate-50 border px-1 rounded shadow-xs font-mono">76</span>
                      <span className="absolute left-[92%] bottom-[81%] text-[10px] font-black text-slate-800 bg-slate-50 border px-1 rounded shadow-xs font-mono">81</span>
                    </div>

                    {/* Timeline X-Axis Labels */}
                    <div className="flex justify-between text-[10px] font-black text-slate-400 font-mono mt-3 border-t pt-2">
                      <span>Jan</span>
                      <span>Feb</span>
                      <span>Mar</span>
                      <span>Apr</span>
                      <span>May</span>
                      <span>Jun</span>
                    </div>
                  </div>

                  {/* Card B: Editorial Decision Breakdown Donut */}
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b pb-3 mb-4">
                      <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        Editorial Decision Breakdown
                      </h4>
                    </div>

                    <div className="flex flex-row items-center justify-around h-48">
                      {/* SVG Donut */}
                      <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          {/* Base circle background */}
                          <circle cx="50" cy="50" r="40" className="stroke-slate-50 fill-none" strokeWidth="10" />
                          
                          {/* Accepted circle - 42% (Length 105.5, offset 0) */}
                          <circle cx="50" cy="50" r="40" className="stroke-emerald-500 fill-none cursor-pointer transition hover:stroke-emerald-600" strokeWidth="10" strokeDasharray="251" strokeDashoffset="0" />
                          
                          {/* Revisions circle - 38% (Length 95.3, offset 105.5) */}
                          <circle cx="50" cy="50" r="40" className="stroke-blue-500 fill-none cursor-pointer transition hover:stroke-blue-600" strokeWidth="10" strokeDasharray="251" strokeDashoffset="105.5" />
                          
                          {/* Rejected circle - 20% (Length 50.2, offset 200.8) */}
                          <circle cx="50" cy="50" r="40" className="stroke-rose-500 fill-none cursor-pointer transition hover:stroke-rose-600" strokeWidth="10" strokeDasharray="251" strokeDashoffset="200.8" />
                        </svg>
                        
                        {/* Center Absolute Label */}
                        <div className="absolute text-center leading-none">
                          <span className="text-2xl font-black text-slate-900 block">42%</span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block mt-1">Accept Rate</span>
                        </div>
                      </div>

                      {/* Legend List with specific values */}
                      <div className="text-[11px] font-bold text-slate-500 space-y-2.5 w-full max-w-[140px] text-left pl-2">
                        <div className="flex justify-between items-center hover:bg-slate-50 p-1 rounded transition">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></span>
                            <span className="text-slate-600 font-extrabold">Accepted</span>
                          </div>
                          <span className="font-extrabold text-slate-900">42% (54)</span>
                        </div>
                        <div className="flex justify-between items-center hover:bg-slate-50 p-1 rounded transition">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></span>
                            <span className="text-slate-600 font-extrabold">Revisions</span>
                          </div>
                          <span className="font-extrabold text-slate-900">38% (49)</span>
                        </div>
                        <div className="flex justify-between items-center hover:bg-slate-50 p-1 rounded transition">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm"></span>
                            <span className="text-slate-600 font-extrabold">Rejected</span>
                          </div>
                          <span className="font-extrabold text-slate-900">20% (25)</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono pt-2 border-t mt-3">
                      Total evaluated manuscripts in pool: 128
                    </div>
                  </div>

                  {/* Card C: Triage Summary Funnel */}
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col justify-between text-left">
                    <div className="flex items-center justify-between border-b pb-3 mb-2">
                      <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        Triage Summary
                      </h4>
                    </div>

                    {/* Funnel Layout */}
                    <div className="flex items-center gap-4 py-2">
                      {/* Interactive Funnel Polygons */}
                      <div className="w-24 h-40 shrink-0">
                        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {/* Level 1: Submitted - light-teal */}
                          <polygon points="5,5 95,5 80,22 20,22" fill="#52c41a" opacity="0.8" className="hover:opacity-100 transition duration-150 cursor-pointer" />
                          {/* Level 2: Screening - light-blue */}
                          <polygon points="21,24 79,24 68,41 32,41" fill="#1890ff" opacity="0.8" className="hover:opacity-100 transition duration-150 cursor-pointer" />
                          {/* Level 3: Under Review - indigo */}
                          <polygon points="33,43 67,43 58,60 42,60" fill="#722ed1" opacity="0.8" className="hover:opacity-100 transition duration-150 cursor-pointer" />
                          {/* Level 4: Decision Pending - gold/amber */}
                          <polygon points="43,62 57,62 52,79 48,79" fill="#faad14" opacity="0.8" className="hover:opacity-100 transition duration-150 cursor-pointer" />
                          {/* Level 5: Completed - green */}
                          <polygon points="48,81 52,81 51,98 49,98" fill="#13c2c2" opacity="0.8" className="hover:opacity-100 transition duration-150 cursor-pointer" />
                        </svg>
                      </div>

                      {/* Funnel Labels with exact values matching screenshot */}
                      <div className="flex-1 space-y-[9px] text-xs">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-0.5">
                          <span className="font-extrabold text-slate-500">Submitted</span>
                          <span className="font-black text-slate-900 font-mono text-[13px]">286</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-0.5">
                          <span className="font-extrabold text-slate-500">Screening</span>
                          <span className="font-black text-slate-900 font-mono text-[13px]">124</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-0.5">
                          <span className="font-extrabold text-slate-500">Under Review</span>
                          <span className="font-black text-slate-900 font-mono text-[13px]">80</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-0.5">
                          <span className="font-extrabold text-slate-500">Decision Pending</span>
                          <span className="font-black text-slate-900 font-mono text-[13px]">27</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-slate-500">Completed</span>
                          <span className="font-black text-emerald-600 font-mono text-[13px]">55</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 font-mono pt-2 border-t mt-1">
                      Conversion rate: 19.2% overall intake efficiency.
                    </div>
                  </div>

                </div>

                {/* Row 3: Review Time (Bar Chart), Submissions by Section (Donut) & Top Reviewers */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Card D: Review Time Distribution Bar Chart */}
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b pb-3 mb-4">
                      <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        Review Time (Days)
                      </h4>
                      <select className="text-[10px] font-bold border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50 text-slate-600 outline-none">
                        <option>This Month</option>
                        <option>This Quarter</option>
                        <option>All Time</option>
                      </select>
                    </div>

                    {/* Styled vertical bars matching the values: 0-7: 18, 8-14: 28, 15-21: 22, 22-30: 16, 31-60: 10, 60+: 6 */}
                    <div className="h-44 flex items-end justify-between px-3 relative">
                      {/* Grid line guidelines */}
                      <div className="absolute inset-y-0 inset-x-0 flex flex-col justify-between pointer-events-none opacity-20">
                        <div className="border-t border-slate-300 w-full"></div>
                        <div className="border-t border-slate-300 w-full"></div>
                        <div className="border-t border-slate-300 w-full"></div>
                        <div className="border-b border-slate-300 w-full"></div>
                      </div>

                      {[
                        { label: "0-7", value: 18, height: "64%" },
                        { label: "8-14", value: 28, height: "100%" },
                        { label: "15-21", value: 22, height: "78%" },
                        { label: "22-30", value: 16, height: "57%" },
                        { label: "31-60", value: 10, height: "35%" },
                        { label: "60+", value: 6, height: "21%" }
                      ].map((b, idx) => (
                        <div key={idx} className="flex flex-col items-center flex-1 space-y-1.5 group">
                          {/* Tooltip on hover */}
                          <span className="text-[9px] font-black font-mono text-emerald-800 bg-emerald-50 px-1 border border-emerald-100 rounded opacity-80 group-hover:opacity-100 transition">
                            {b.value}
                          </span>
                          {/* Bar pillar */}
                          <div 
                            style={{ height: b.height }}
                            className="w-5.5 bg-emerald-500 hover:bg-emerald-600 rounded-t-sm transition duration-200 cursor-pointer shadow-xs"
                          />
                          {/* Axis label */}
                          <span className="text-[10px] font-black font-mono text-slate-400 mt-1">
                            {b.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="text-[10px] text-slate-400 font-mono pt-2 border-t mt-4 text-left">
                      Target SLA benchmark: &lt; 21 days (88.4% compliance achieved)
                    </div>
                  </div>

                  {/* Card E: Submissions by Section Donut */}
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b pb-3 mb-4">
                      <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        Submissions by Section
                      </h4>
                    </div>

                    <div className="flex flex-row items-center justify-around h-44">
                      {/* SVG Donut circle */}
                      <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          {/* Base background circle */}
                          <circle cx="50" cy="50" r="40" className="stroke-slate-50 fill-none" strokeWidth="10" />
                          
                          {/* AI in Healthcare - 39% (Length 97.9, offset 0) - emerald */}
                          <circle cx="50" cy="50" r="40" className="stroke-emerald-500 fill-none cursor-pointer transition hover:stroke-emerald-600" strokeWidth="10" strokeDasharray="251" strokeDashoffset="0" />
                          
                          {/* Medical Imaging - 24% (Length 60.2, offset 97.9) - blue */}
                          <circle cx="50" cy="50" r="40" className="stroke-blue-500 fill-none cursor-pointer transition hover:stroke-blue-600" strokeWidth="10" strokeDasharray="251" strokeDashoffset="97.9" />
                          
                          {/* Machine Learning - 18% (Length 45.2, offset 158.1) - purple */}
                          <circle cx="50" cy="50" r="40" className="stroke-purple-500 fill-none cursor-pointer transition hover:stroke-purple-600" strokeWidth="10" strokeDasharray="251" strokeDashoffset="158.1" />
                          
                          {/* NLP in Medicine - 12% (Length 30.1, offset 203.3) - orange */}
                          <circle cx="50" cy="50" r="40" className="stroke-amber-500 fill-none cursor-pointer transition hover:stroke-amber-600" strokeWidth="10" strokeDasharray="251" strokeDashoffset="203.3" />
                          
                          {/* Other - 7% (Length 17.6, offset 233.4) - teal */}
                          <circle cx="50" cy="50" r="40" className="stroke-teal-500 fill-none cursor-pointer transition hover:stroke-teal-600" strokeWidth="10" strokeDasharray="251" strokeDashoffset="233.4" />
                        </svg>

                        {/* Center total text */}
                        <div className="absolute text-center leading-none">
                          <span className="text-xl font-black text-slate-900 block">286</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-1">Total</span>
                        </div>
                      </div>

                      {/* Legends with matching values */}
                      <div className="text-[10px] font-bold text-slate-500 space-y-1.5 w-full max-w-[150px] text-left pl-2">
                        <div className="flex justify-between items-center hover:bg-slate-50 px-1 rounded transition">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-xs"></span>
                            <span className="text-slate-600 truncate font-semibold">AI in Healthcare</span>
                          </div>
                          <span className="font-mono text-slate-900">39%</span>
                        </div>
                        <div className="flex justify-between items-center hover:bg-slate-50 px-1 rounded transition">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-blue-500 rounded-xs"></span>
                            <span className="text-slate-600 truncate font-semibold">Medical Imaging</span>
                          </div>
                          <span className="font-mono text-slate-900">24%</span>
                        </div>
                        <div className="flex justify-between items-center hover:bg-slate-50 px-1 rounded transition">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-purple-500 rounded-xs"></span>
                            <span className="text-slate-600 truncate font-semibold">Machine Learning</span>
                          </div>
                          <span className="font-mono text-slate-900">18%</span>
                        </div>
                        <div className="flex justify-between items-center hover:bg-slate-50 px-1 rounded transition">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-amber-500 rounded-xs"></span>
                            <span className="text-slate-600 truncate font-semibold">NLP in Medicine</span>
                          </div>
                          <span className="font-mono text-slate-900">12%</span>
                        </div>
                        <div className="flex justify-between items-center hover:bg-slate-50 px-1 rounded transition">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-teal-500 rounded-xs"></span>
                            <span className="text-slate-600 truncate font-semibold">Other</span>
                          </div>
                          <span className="font-mono text-slate-900">7%</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono pt-2 border-t mt-4">
                      Submissions balanced by cross-disciplinary section tags.
                    </div>
                  </div>

                  {/* Card F: Top Performing Reviewers */}
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b pb-3 mb-4">
                      <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        Top Performing Reviewers
                      </h4>
                      <select className="text-[10px] font-bold border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50 text-slate-600 outline-none">
                        <option>This Month</option>
                        <option>Last Month</option>
                        <option>All Time</option>
                      </select>
                    </div>

                    {/* List of 5 reviewers with matching stats */}
                    <div className="space-y-2.5 text-left flex-1 flex flex-col justify-around">
                      {[
                        { name: "Dr. Sarah Johnson", reviews: "24 reviews completed", time: "6.2 days", rating: "4.9", color: "from-emerald-500 to-teal-600" },
                        { name: "Dr. Michael Lee", reviews: "18 reviews completed", time: "7.1 days", rating: "4.8", color: "from-blue-500 to-indigo-600" },
                        { name: "Dr. Hiroshi Tanaka", reviews: "16 reviews completed", time: "8.3 days", rating: "4.7", color: "from-purple-500 to-pink-600" },
                        { name: "Dr. Maria Garcia", reviews: "15 reviews completed", time: "9.0 days", rating: "4.6", color: "from-amber-500 to-orange-600" },
                        { name: "Dr. Arjun Patel", reviews: "14 reviews completed", time: "6.8 days", rating: "4.5", color: "from-teal-500 to-emerald-600" }
                      ].map((rev, rIdx) => (
                        <div key={rIdx} className="flex justify-between items-center hover:bg-slate-50/80 p-1.5 rounded-lg transition duration-150">
                          <div className="flex items-center gap-2.5">
                            {/* Visual Avatar block */}
                            <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${rev.color} flex items-center justify-center text-white text-[10px] font-black uppercase shadow-xs`}>
                              {rev.name.split(' ').slice(1).map(n => n[0]).join('') || 'DR'}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-800 block leading-tight">{rev.name}</span>
                              <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">{rev.reviews}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 font-bold block leading-none">Avg. Time</span>
                              <span className="text-[10px] text-slate-700 font-mono font-bold block mt-0.5">{rev.time}</span>
                            </div>
                            {/* Star rating indicator */}
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-100 rounded text-[10px] font-bold text-amber-700 font-mono">
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                              <span>{rev.rating}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Bottom Row: Insight Alert bar exactly matching the design */}
                <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="text-xs font-black text-emerald-900 block uppercase tracking-wider">Operational Insight</strong>
                      <p className="text-xs text-emerald-800 leading-relaxed font-semibold mt-0.5">
                        Your acceptance rate is <strong className="font-extrabold text-emerald-950">5% higher</strong> than last month. Peer reviewer coordination is operating at optimum capacity! 🎉
                      </p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setAlertMessage({
                        type: 'success',
                        text: 'Detailed multi-tenant OJS diagnostic pipeline initialized. Generating database schema metrics.'
                      });
                    }}
                    className="flex items-center gap-1 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-extrabold transition shadow-sm self-start sm:self-center uppercase tracking-wider"
                  >
                    <span>View Detailed Analytics</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            )}

            {/* ----------------- SCREEN 6: PROTOCOLS ----------------- */}
            {activeTab === 'protocols' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                <div className="flex gap-2 border-b border-slate-200 pb-3">
                  <button className="px-4 py-2 bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm">
                    Active Governance Protocols
                  </button>
                  <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-lg">
                    Archived Protocols
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { title: "Double-Blind Review", desc: "Strictly secures anonymity boundaries. Strip contributor and affiliation lists before external review rounds.", status: "ACTIVE" },
                    { title: "Ethics & Compliance Check", desc: "Integrity vetting including automatic animal study and clinical trial registration declaration checks.", status: "ACTIVE" },
                    { title: "Plagiarism Similarity Vetting", desc: "Cross-checks cross-ref similarity indexes. Requires less than 15% aggregate similarity metric score.", status: "ACTIVE" },
                    { title: "Data Availability Mandate", desc: "Verifies authors supplied functional links to persistent Zenodo or GitHub repositories for clinical assets.", status: "ACTIVE" },
                    { title: "AI Transparency Protocol", desc: "Enforces full disclosure of Large Language Models used in diagnostic text synthesis within methodology.", status: "ACTIVE" },
                    { title: "Conflict of Interest Disclosure", desc: "Mandates signature array declarations on corporate or funding relationships prior to review assignments.", status: "ACTIVE" }
                  ].map((item, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-mono font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded uppercase">
                            {item.status}
                          </span>
                          <Sliders className="w-4 h-4 text-slate-400" />
                        </div>
                        <h4 className="font-black text-sm text-slate-900 tracking-tight">{item.title}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-semibold">{item.desc}</p>
                      </div>
                      <button onClick={() => setAlertMessage({ type: 'info', text: `Governance parameter details loaded for ${item.title}` })} className="mt-4 w-full py-1.5 bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 rounded-lg transition">
                        View Details
                      </button>
                    </div>
                  ))}
                </div>

              </div>
            )}

            {/* ----------------- SCREEN 7: COMMUNICATIONS ----------------- */}
            {activeTab === 'communications' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* PILLED CATEGORY FILTERS */}
                <div className="flex gap-2 bg-white border border-slate-200 p-3 rounded-xl shadow-xs">
                  {['All Messages', 'Authors', 'Reviewers', 'Editorial Board', 'System Alerts'].map((pill, idx) => (
                    <button key={idx} className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${idx === 0 ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {pill}
                    </button>
                  ))}
                </div>

                {/* LOGS TABLE (Matching Image 5) */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                          <th className="p-4">Subject</th>
                          <th className="p-4">Recipient</th>
                          <th className="p-4">Type</th>
                          <th className="p-4">Status</th>
                          <th className="p-4">Sent At</th>
                          <th className="p-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {communicationsData.map((comm, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="p-4">
                              <span className="font-extrabold text-slate-900 block leading-tight">{comm.subject}</span>
                            </td>
                            <td className="p-4 font-bold text-slate-800">{comm.recipient}</td>
                            <td className="p-4">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold uppercase">
                                {comm.type}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="font-bold text-emerald-800">{comm.status}</span>
                              </div>
                            </td>
                            <td className="p-4 font-mono font-bold text-slate-500">{comm.sent}</td>
                            <td className="p-4 text-center">
                              <button onClick={() => setAlertMessage({ type: 'info', text: `SMTP payload log opened.` })} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 rounded transition">
                                View Logs
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ----------------- SCREEN 8: SYSTEM SETTINGS ----------------- */}
            {activeTab === 'settings' && (
              <div className="space-y-6 animate-in fade-in duration-200 max-w-4xl">
                
                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
                  <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider border-b pb-3 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-700" />
                    <span>Validation Gates & Threshold Parameters</span>
                  </h3>

                  <div className="space-y-5 text-xs">
                    
                    {/* DOUBLE BLIND SETTING */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-3">
                      <div className="space-y-1 max-w-xl">
                        <strong className="block text-slate-900 font-bold text-sm">Strict Double-Blind Anonymity Enforcement</strong>
                        <p className="text-slate-500 font-medium leading-relaxed">
                          When enabled, all author identifiers, affiliation arrays, and metadata are dynamically sanitized before manuscripts are rendered in the Reviewer queue. Ensures pure double-blind criteria.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={doubleBlindRequired} 
                          onChange={(e) => {
                            setDoubleBlindRequired(e.target.checked);
                            setAlertMessage({
                              type: 'info',
                              text: `Double-Blind Policy parameter changed to: ${e.target.checked ? 'STRICT' : 'OPTIONAL'}`
                            });
                          }}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>

                    {/* REVIEWS COUNT SETTING */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-3">
                      <div className="space-y-1 max-w-xl">
                        <strong className="block text-slate-900 font-bold text-sm">Minimum Peer Reviews Required For Decision Gate</strong>
                        <p className="text-slate-500 font-medium leading-relaxed">
                          The minimum number of completed reviewer recommendations required to trigger decision gates. If editors try to override below this, a 400-range override challenge is displayed.
                        </p>
                      </div>
                      <select
                        value={minReviewsNeeded}
                        onChange={(e) => {
                          setMinReviewsNeeded(Number(e.target.value));
                          setAlertMessage({
                            type: 'info',
                            text: `Required review threshold updated to ${e.target.value} reviewers.`
                          });
                        }}
                        className="border border-slate-300 rounded-lg p-1.5 bg-white text-xs text-slate-800 outline-none w-24 font-bold"
                      >
                        <option value="1">1 Review</option>
                        <option value="2">2 Reviews</option>
                        <option value="3">3 Reviews</option>
                        <option value="4">4 Reviews</option>
                      </select>
                    </div>

                    {/* DESK SLA SETTING */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-3">
                      <div className="space-y-1 max-w-xl">
                        <strong className="block text-slate-900 font-bold text-sm">Desk Screening Sla Threshold Limit</strong>
                        <p className="text-slate-500 font-medium leading-relaxed">
                          Max time (in days) allocated to desk screening triages before triggering warnings on the Coordinator Dashboard.
                        </p>
                      </div>
                      <input
                        type="number"
                        value={screeningTimeLimit}
                        onChange={(e) => setScreeningTimeLimit(Number(e.target.value))}
                        className="border border-slate-300 font-mono font-bold text-center rounded-lg p-1.5 bg-white text-xs text-slate-800 outline-none w-24"
                      />
                    </div>

                  </div>

                  <div className="pt-4 flex justify-between items-center text-[11px] font-mono text-slate-400">
                    <span>Configuration checksum: JMS-GATE-2026-F9</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAlertMessage({
                          type: 'success',
                          text: 'OJS parameters persisted successfully in container state config.'
                        });
                      }}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider transition rounded-lg"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* ----------------- SCREEN 9: AUDIT TRAIL ----------------- */}
            {activeTab === 'audit' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                    Cryptographically Sealed Event Logs (SHA-256 Block Proof)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                          <th className="p-4">Event Description</th>
                          <th className="p-4">Actor</th>
                          <th className="p-4">Target Resource</th>
                          <th className="p-4">Verification State</th>
                          <th className="p-4">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {auditData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="p-4 font-extrabold text-slate-900">{item.event}</td>
                            <td className="p-4 font-mono font-semibold text-slate-600">{item.actor}</td>
                            <td className="p-4 font-mono font-bold text-emerald-800">{item.target}</td>
                            <td className="p-4">
                              <span className="px-2 py-0.5 bg-green-50 text-emerald-700 border border-green-200 rounded text-[10px] font-bold">
                                {item.status}
                              </span>
                            </td>
                            <td className="p-4 font-mono text-slate-500 font-semibold">{item.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

          </main>
        </div>

      </div>

      {/* ========================================== */}
      {/* SECTION: INTERACTIVE MANUSCRIPT DETAIL DRAWER */}
      {/* ========================================== */}
      {selectedManuscript && (
        <>
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 transition-opacity animate-in fade-in duration-200" 
            onClick={() => setSelectedManuscript(null)}
          />
          
          {/* Slide-over panel */}
          <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-start border-b border-slate-800">
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-emerald-600 text-white px-2 py-0.5 rounded">
                    {selectedManuscript.id}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    selectedManuscript.stage === 'Under Review' ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' :
                    selectedManuscript.stage === 'Screening' ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30' :
                    selectedManuscript.stage === 'Revision' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' :
                    'bg-red-600/20 text-red-300 border border-red-500/30'
                  }`}>
                    {selectedManuscript.stage}
                  </span>
                </div>
                <h3 className="text-base font-extrabold tracking-tight text-white leading-tight mt-2 text-left">
                  {selectedManuscript.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Submitted by <strong className="text-white">{selectedManuscript.author}</strong> on {selectedManuscript.submitted}
                </p>
              </div>
              <button 
                onClick={() => setSelectedManuscript(null)} 
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Tab Navigation */}
            <div className="bg-slate-50 border-b border-slate-200 flex text-xs font-bold shrink-0">
              {[
                { id: 'metadata', label: 'Metadata & Status', icon: FileText },
                { id: 'anonymity', label: 'Anonymity Check', icon: Shield },
                { id: 'reviewers', label: 'Peer Review', icon: Users },
                { id: 'compose', label: 'Compose SMTP', icon: Mail },
                { id: 'override', label: 'Compliance Gate', icon: AlertOctagon }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = (selectedManuscript.drawerTab || 'metadata') === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      // Instantly set drawer tab state on selectedManuscript
                      setSelectedManuscript(prev => ({ ...prev, drawerTab: tab.id }));
                      if (tab.id === 'compose') {
                        setComposingSubject(`Status Update: Manuscript ${selectedManuscript.id}`);
                        setComposingBody(`Dear ${selectedManuscript.author},\n\nThis is to notify you that your manuscript "${selectedManuscript.title}" (ID: ${selectedManuscript.id}) is currently in the "${selectedManuscript.stage}" phase of our specialized clinical artificial intelligence peer review process.\n\nBest regards,\nDr. Akshay (Project Coordinator)`);
                      }
                    }}
                    className={`flex-1 py-3 px-2 border-b-2 flex items-center justify-center gap-1.5 transition ${
                      isActive 
                        ? 'border-emerald-700 text-emerald-800 bg-white' 
                        : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Drawer Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
              
              {/* TAB 1: METADATA & STATUS */}
              {(selectedManuscript.drawerTab === 'metadata' || !selectedManuscript.drawerTab) && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Manuscript Abstract</span>
                    <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 leading-relaxed font-semibold">
                      {selectedManuscript.abstract || "No abstract supplied with submission."}
                    </p>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-mono font-black text-amber-800 uppercase tracking-wider block flex items-center gap-1">
                      <Shield className="w-3 h-3 text-amber-700" /> CONFIDENTIAL COVER LETTER (Restricted Access)
                    </span>
                    <p className="text-xs text-amber-950 font-semibold italic bg-white/50 p-3 rounded border border-amber-200/50 leading-relaxed">
                      {selectedManuscript.coverLetter || "Dear Editorial Office,\nWe submit our clinical study on diagnostic neural networks. We certify no conflicting industrial sponsorships.\nWarm regards,\nAuthors."}
                    </p>
                  </div>

                  {/* Operational Settings Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Change Workflow Stage</label>
                      <select 
                        value={selectedManuscript.stage} 
                        onChange={(e) => {
                          const nextStage = e.target.value;
                          const reviewsCount = selectedManuscript.reviewersAssigned?.length || 0;
                          
                          // TRIGGER gate override check if they select Decision Pending or Production and reviews are less than minReviewsNeeded
                          if ((nextStage === 'Decision Pending' || nextStage === 'Production') && reviewsCount < minReviewsNeeded) {
                            setPendingTargetStage(nextStage);
                            setShowOverrideModal(true);
                          } else {
                            handleUpdateManuscriptRow(selectedManuscript.id, { 
                              stage: nextStage,
                              status: nextStage === 'Production' ? 'Completed' : 'In Progress'
                            });
                            setAlertMessage({
                              type: 'success',
                              text: `Workflow stage for ${selectedManuscript.id} successfully updated to "${nextStage}".`
                            });
                          }
                        }}
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs text-slate-800 outline-none font-bold"
                      >
                        <option value="Screening">Screening (Desk Phase)</option>
                        <option value="Under Review">Under Review (Peer Vetting)</option>
                        <option value="Revision">Revision Required</option>
                        <option value="Decision Pending">Decision Pending (Editorial Gate)</option>
                        <option value="Production">Production (Publisher Release)</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">SLA Priority Rating</label>
                      <select 
                        value={selectedManuscript.priority} 
                        onChange={(e) => {
                          handleUpdateManuscriptRow(selectedManuscript.id, { priority: e.target.value as any });
                          setAlertMessage({
                            type: 'success',
                            text: `SLA Priority rating for ${selectedManuscript.id} changed to ${e.target.value}.`
                          });
                        }}
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs text-slate-800 outline-none font-bold"
                      >
                        <option value="High">High Priority</option>
                        <option value="Medium">Medium Priority</option>
                        <option value="Low">Low Priority</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Assigned Editor Orchestrator</label>
                      <select 
                        value={selectedManuscript.assignedTo} 
                        onChange={(e) => {
                          handleUpdateManuscriptRow(selectedManuscript.id, { assignedTo: e.target.value });
                          setAlertMessage({
                            type: 'success',
                            text: `Editorial assignment of ${selectedManuscript.id} transferred to ${e.target.value}.`
                          });
                        }}
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs text-slate-800 outline-none font-bold"
                      >
                        {boardMembers.map(m => (
                          <option key={m.id} value={m.name}>{m.name} ({m.role})</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">SLA Triage Due Date</label>
                      <input 
                        type="date" 
                        value={selectedManuscript.dueDate === '-' ? '' : '2026-07-05'}
                        onChange={(e) => {
                          handleUpdateManuscriptRow(selectedManuscript.id, { dueDate: e.target.value, dueStatus: 'SLA Updated' });
                          setAlertMessage({
                            type: 'success',
                            text: `SLA triaging deadline for ${selectedManuscript.id} updated to ${e.target.value}.`
                          });
                        }}
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs text-slate-800 outline-none font-bold font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 pt-2">
                    <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Internal Coordinator comments & override notes</label>
                    <textarea 
                      value={selectedManuscript.comments || ''} 
                      onChange={(e) => handleUpdateManuscriptRow(selectedManuscript.id, { comments: e.target.value })}
                      placeholder="Add system override comments, checklist compliance remarks, or custom triage remarks..."
                      className="w-full h-24 border border-slate-300 rounded-xl p-3 bg-white text-xs text-slate-800 outline-none focus:border-emerald-600 font-semibold leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: ANONYMITY SAFEGUARDS */}
              {selectedManuscript.drawerTab === 'anonymity' && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex gap-3">
                    <Shield className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="block font-bold text-emerald-950">Strict Double-Blind Anonymity Mandate Engaged</strong>
                      <p className="text-emerald-800 leading-relaxed mt-1 font-semibold">
                        To maintain compliance protocols, author and affiliation arrays must be completely sanitized. Our automated system will replace names with anonymous identifiers (e.g., AUTHOR_1) before sending to external reviewers.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                    <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider border-b pb-2">
                      Associated Contributors List
                    </h4>
                    
                    <div className="space-y-2">
                      {selectedManuscript.contributors?.map((contrib: any, cidx: number) => (
                        <div key={cidx} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-150 rounded-lg text-xs">
                          <div>
                            <span className="font-extrabold text-slate-900 block">{contrib.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">{contrib.email} • {contrib.affiliation}</span>
                          </div>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[9px] font-mono font-bold uppercase">
                            {contrib.role}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2">
                      <button 
                        onClick={() => {
                          const sanitizedContribs = selectedManuscript.contributors?.map((c: any, i: number) => ({
                            ...c,
                            name: `Author_${i + 1}`,
                            email: `anonymized_${i + 1}@medai-doubleblind.org`,
                            affiliation: "REDACTED_ANONYMOUS_ACADEMIC_AFFILIATION"
                          })) || [];
                          
                          handleUpdateManuscriptRow(selectedManuscript.id, { 
                            author: "Sanitized Contributor Group",
                            contributors: sanitizedContribs 
                          });

                          setAlertMessage({
                            type: 'success',
                            text: 'Anonymity safeguards successfully executed. Author metadata arrays fully redact-sanitized.'
                          });
                        }}
                        className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-lg transition"
                      >
                        Sanitize & Strip Contributor Metadata Arrays
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: PEER REVIEW MANAGEMENT */}
              {selectedManuscript.drawerTab === 'reviewers' && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Assigned Active Reviewers</span>
                    <span className="text-xs font-bold text-slate-900">
                      {selectedManuscript.reviewersAssigned?.length || 0} assigned
                    </span>
                  </div>

                  {/* Assigned list */}
                  <div className="space-y-2">
                    {(!selectedManuscript.reviewersAssigned || selectedManuscript.reviewersAssigned.length === 0) ? (
                      <div className="text-center py-6 border border-dashed border-slate-200 bg-slate-50 text-slate-400 rounded-xl text-xs font-semibold">
                        No peer reviewers have been assigned to this manuscript yet.
                      </div>
                    ) : (
                      selectedManuscript.reviewersAssigned.map((revName: string, ri: number) => {
                        const revDetails = reviewersData.find(r => r.name === revName);
                        return (
                          <div key={ri} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                            <div className="text-xs">
                              <span className="font-extrabold text-slate-900 block">{revName}</span>
                              <span className="text-[10px] text-slate-400 font-mono block">Specialty: {revDetails?.specialty || "Clinical AI"}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[9px] font-bold">
                                Recommendation: Pending
                              </span>
                              <button 
                                onClick={() => {
                                  const nextAssigned = selectedManuscript.reviewersAssigned.filter((n: string) => n !== revName);
                                  handleUpdateManuscriptRow(selectedManuscript.id, { reviewersAssigned: nextAssigned });
                                  setAlertMessage({
                                    type: 'info',
                                    text: `Reviewer ${revName} unassigned from ${selectedManuscript.id}`
                                  });
                                }}
                                className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add Reviewer Form */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <h4 className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider">
                      Assign Qualified Peer Reviewer
                    </h4>
                    
                    <div className="flex gap-2">
                      <select 
                        id="reviewer-assign-select"
                        className="flex-1 border border-slate-300 rounded-lg p-2 bg-white text-xs outline-none font-bold"
                      >
                        <option value="">-- Choose reviewer in medical AI field --</option>
                        {reviewersData
                          .filter(r => !selectedManuscript.reviewersAssigned?.includes(r.name))
                          .map((r, idx) => (
                            <option key={idx} value={r.name}>{r.name} ({r.specialty})</option>
                          ))
                        }
                      </select>
                      <button 
                        onClick={() => {
                          const sel = document.getElementById('reviewer-assign-select') as HTMLSelectElement;
                          const selectedName = sel?.value;
                          if (!selectedName) return;
                          
                          const nextAssigned = [...(selectedManuscript.reviewersAssigned || []), selectedName];
                          handleUpdateManuscriptRow(selectedManuscript.id, { reviewersAssigned: nextAssigned });
                          
                          // Append email dispatch SMTP
                          setCommunicationsData(prev => [
                            {
                              subject: `Review assignment for manuscript ${selectedManuscript.id}`,
                              recipient: selectedName,
                              type: "Reviewer",
                              status: "Delivered",
                              sent: "Today 10:00 AM"
                            },
                            ...prev
                          ]);

                          // Audit log
                          setAuditData(prev => [
                            {
                              event: `Peer reviewer ${selectedName} assigned to manuscript`,
                              actor: "Dr. Akshay (Coordinator)",
                              target: selectedManuscript.id,
                              date: "Today 10:00 AM",
                              status: "Assigned"
                            },
                            ...prev
                          ]);

                          setAlertMessage({
                            type: 'success',
                            text: `Peer reviewer ${selectedName} assigned and validation packet transmitted.`
                          });
                        }}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-lg transition shrink-0"
                      >
                        Assign
                      </button>
                    </div>
                  </div>

                  {/* Validation Gate Threshold Card */}
                  <div className="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center">
                    <div className="space-y-1 text-xs">
                      <strong className="block font-bold">Decision Gate Threshold</strong>
                      <p className="text-slate-400 font-semibold leading-relaxed">
                        Currently {selectedManuscript.reviewersAssigned?.length || 0} reviews assigned. Target: {minReviewsNeeded}.
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase ${
                      (selectedManuscript.reviewersAssigned?.length || 0) >= minReviewsNeeded 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                    }`}>
                      {(selectedManuscript.reviewersAssigned?.length || 0) >= minReviewsNeeded ? 'APPROVED' : 'LOCKED - REVIEWS DEFICIT'}
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 4: COMPOSE NOTIFICATION (SMTP) */}
              {selectedManuscript.drawerTab === 'compose' && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="space-y-1.5 text-left">
                    <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Recipient Contact Role</span>
                    <div className="flex gap-2">
                      {['Author', 'Reviewer', 'Editorial Board'].map((role) => (
                        <button 
                          key={role}
                          onClick={() => {
                            setComposingRecipientType(role);
                            const recName = role === 'Author' ? selectedManuscript.author : 
                                            role === 'Reviewer' ? (selectedManuscript.reviewersAssigned?.[0] || 'Peer Reviewer') : 
                                            selectedManuscript.assignedTo;
                            setComposingSubject(`Specialized OJS Triage Alert: ${selectedManuscript.id}`);
                            setComposingBody(`Dear ${recName},\n\nWe would like to coordinate technical details regarding the screening status of submission "${selectedManuscript.title}". We request immediate response.\n\nBest regards,\nDr. Akshay (JMS Coordinator)`);
                          }}
                          className={`flex-1 py-1.5 border font-bold text-xs rounded-lg transition ${
                            composingRecipientType === role 
                              ? 'bg-emerald-700 border-emerald-700 text-white' 
                              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">SMTP Email Subject</span>
                    <input 
                      type="text" 
                      value={composingSubject}
                      onChange={(e) => setComposingSubject(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-xs outline-none focus:border-emerald-600 font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">SMTP Email Body Payload</span>
                    <textarea 
                      value={composingBody}
                      onChange={(e) => setComposingBody(e.target.value)}
                      className="w-full h-48 border border-slate-300 rounded-xl p-3 bg-white text-xs text-slate-800 outline-none focus:border-emerald-600 font-semibold leading-relaxed"
                    />
                  </div>

                  <button 
                    onClick={() => {
                      // Append to communications list
                      setCommunicationsData(prev => [
                        {
                          subject: composingSubject,
                          recipient: composingRecipientType === 'Author' ? selectedManuscript.author : 
                                     composingRecipientType === 'Reviewer' ? (selectedManuscript.reviewersAssigned?.[0] || 'Dr. Priya Sharma') :
                                     selectedManuscript.assignedTo,
                          type: composingRecipientType,
                          status: "Sent",
                          sent: "Today 10:00 AM"
                        },
                        ...prev
                      ]);

                      // Append to audit trail
                      setAuditData(prev => [
                        {
                          event: `SMTP mail payload dispatched: "${composingSubject}"`,
                          actor: "Dr. Akshay (Coordinator)",
                          target: selectedManuscript.id,
                          date: "Today 10:00 AM",
                          status: "Dispatched"
                        },
                        ...prev
                      ]);

                      setAlertMessage({
                        type: 'success',
                        text: 'SMTP Direct Dispatch complete. Academic communication logged and routed successfully.'
                      });
                      
                      // Move to metadata tab
                      setSelectedManuscript(prev => ({ ...prev, drawerTab: 'metadata' }));
                    }}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-lg transition flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Dispatch SMTP Email Payload</span>
                  </button>
                </div>
              )}

              {/* TAB 5: COMPLIANCE OVERRIDES */}
              {selectedManuscript.drawerTab === 'override' && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex gap-3">
                    <AlertOctagon className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="block font-bold text-rose-950">Specialized Decisional Gate Safeguard</strong>
                      <p className="text-rose-800 leading-relaxed mt-1 font-semibold">
                        JMS compliance frameworks mandate a minimum threshold of {minReviewsNeeded} peer reviews before changing a manuscript's status to Production or Decision Pending. Overriding this gate requires a formalized Coordinator Justification log.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 text-xs font-semibold">
                    <div className="flex justify-between items-center text-xs">
                      <span>Assigned Reviewer Count:</span>
                      <strong className="text-slate-900">{(selectedManuscript.reviewersAssigned?.length || 0)} reviewers</strong>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span>Threshold Requirement:</span>
                      <strong className="text-slate-900">{minReviewsNeeded} reviewers</strong>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t pt-2">
                      <span>Compliance Gate Status:</span>
                      <strong className={(selectedManuscript.reviewersAssigned?.length || 0) >= minReviewsNeeded ? "text-emerald-700" : "text-red-600 animate-pulse"}>
                        {(selectedManuscript.reviewersAssigned?.length || 0) >= minReviewsNeeded ? "APPROVED" : "COMPLIANCE BLOCKED"}
                      </strong>
                    </div>

                    {(selectedManuscript.reviewersAssigned?.length || 0) < minReviewsNeeded && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">coordinator override justification</label>
                        <select 
                          id="override-justification-select"
                          className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs outline-none font-bold"
                        >
                          <option value="Editorial Board Consensus Override">Editorial Board Consensus Override</option>
                          <option value="Emergency Desktop Screening Bypass">Emergency Desktop Screening Bypass</option>
                          <option value="SLA Time-Sensitive Triage Exception">SLA Time-Sensitive Triage Exception</option>
                          <option value="Prior Qualified Evaluation Equivalence">Prior Qualified Evaluation Equivalence</option>
                        </select>

                        <button 
                          onClick={() => {
                            const just = (document.getElementById('override-justification-select') as HTMLSelectElement)?.value;
                            
                            // Execute bypass
                            handleUpdateManuscriptRow(selectedManuscript.id, { 
                              stage: "Decision Pending",
                              comments: `${selectedManuscript.comments || ''}\n\n[COMPLIANCE BYPASS EXCEPTION LOGGED]: Justification: "${just}" by Coordinator Akshay.`
                            });

                            // Audit trail exception block
                            setAuditData(prev => [
                              {
                                event: `Cryptographically Sealed Compliance Override: "${just}"`,
                                actor: "Dr. Akshay (Coordinator)",
                                target: selectedManuscript.id,
                                date: "Today 10:00 AM",
                                status: "Bypassed"
                              },
                              ...prev
                            ]);

                            setAlertMessage({
                              type: 'success',
                              text: `EXCEPTION LOGGED: Compliancy gate bypassed successfully via "${just}".`
                            });

                            // Close modal/reset
                            setSelectedManuscript(prev => ({ ...prev, drawerTab: 'metadata' }));
                          }}
                          className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-lg transition"
                        >
                          Execute Decisional Gate Override
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Drawer Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between gap-3 shrink-0">
              <button 
                onClick={() => {
                  setAlertMessage({
                    type: 'success',
                    text: `Manuscript ${selectedManuscript.id} metadata parameters persisted in container state.`
                  });
                  setSelectedManuscript(null);
                }}
                className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-lg transition"
              >
                Save & Close
              </button>
              <button 
                onClick={() => setSelectedManuscript(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>
            </div>

          </div>
        </>
      )}

      {/* ========================================== */}
      {/* MODAL 1: NEW MANUSCRIPT TRIAGE SUBMISSION */}
      {/* ========================================== */}
      {isNewSubmissionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full overflow-hidden shadow-2xl text-left animate-in zoom-in-95 duration-200">
            
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="space-y-1 text-left">
                <span className="text-[9px] font-mono font-black text-emerald-400 uppercase tracking-widest block">ADMINISTRATIVE ACCESS</span>
                <h3 className="font-extrabold text-base tracking-tight uppercase leading-none">New Submission Triage Entry</h3>
              </div>
              <button onClick={() => setIsNewSubmissionModalOpen(false)} className="text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Manuscript Title</label>
                <input 
                  type="text" 
                  placeholder="Enter scientific title of submission..."
                  value={newSubTitle}
                  onChange={(e) => setNewSubTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-emerald-600 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Submitting Author Name</label>
                  <input 
                    type="text" 
                    placeholder="James Carter"
                    value={newSubAuthor}
                    onChange={(e) => setNewSubAuthor(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-emerald-600 font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Author Email Address</label>
                  <input 
                    type="email" 
                    placeholder="author@hospital.org"
                    value={newSubEmail}
                    onChange={(e) => setNewSubEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-emerald-600 font-bold font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Priority Classification</label>
                  <select 
                    value={newSubPriority}
                    onChange={(e) => setNewSubPriority(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs outline-none font-bold"
                  >
                    <option value="High">High (Immediate Triage)</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Assigned Section Editor</label>
                  <select 
                    value={newSubEditor}
                    onChange={(e) => setNewSubEditor(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs outline-none font-bold"
                  >
                    {boardMembers.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Manuscript Abstract Summary</label>
                <textarea 
                  placeholder="Enter medical AI abstract..."
                  value={newSubAbstract}
                  onChange={(e) => setNewSubAbstract(e.target.value)}
                  className="w-full h-24 border border-slate-300 rounded-xl p-3 text-xs outline-none focus:border-emerald-600 font-semibold leading-relaxed"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button 
                onClick={() => setIsNewSubmissionModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!newSubTitle || !newSubAuthor) {
                    setAlertMessage({ type: 'info', text: 'Please complete all required administrative fields.' });
                    return;
                  }

                  const nextId = `JMS-2026-${220 + manuscriptsList.length}`;
                  const nextItem = {
                    id: nextId,
                    title: newSubTitle,
                    author: newSubAuthor,
                    authorEmail: newSubEmail || 'contributor@medai.edu',
                    stage: 'Screening',
                    priority: newSubPriority,
                    assignedTo: newSubEditor,
                    submitted: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
                    dueDate: 'Jul 10, 2026',
                    dueStatus: '14 days left',
                    status: 'Pending',
                    abstract: newSubAbstract || 'Abstract currently in administrative staging indexing.',
                    coverLetter: `Dear Coordinator,\n\nWe submit our diagnostic artificial intelligence research for technical screening.\n\nBest regards,\n${newSubAuthor}.`,
                    contributors: [
                      { name: newSubAuthor, email: newSubEmail || 'author@hospital.org', affiliation: "Academics", role: "Primary Author" }
                    ],
                    reviewersAssigned: [] as string[],
                    comments: "Administrative intake. Initial screening SLA triggered."
                  };

                  setManuscriptsList(prev => [nextItem, ...prev]);

                  // Dispatch Communications
                  setCommunicationsData(prev => [
                    {
                      subject: `Your manuscript ${nextId} is received for screening`,
                      recipient: newSubAuthor,
                      type: "Author",
                      status: "Sent",
                      sent: "Just Now"
                    },
                    ...prev
                  ]);

                  // Log audit trail
                  setAuditData(prev => [
                    {
                      event: `New manuscript triage entry initialized by coordinator`,
                      actor: "Dr. Akshay (Coordinator)",
                      target: nextId,
                      date: "Just Now",
                      status: "Success"
                    },
                    ...prev
                  ]);

                  setAlertMessage({
                    type: 'success',
                    text: `Intake complete. Manuscript ${nextId} successfully queued for academic screening.`
                  });

                  // Reset
                  setNewSubTitle('');
                  setNewSubAuthor('');
                  setNewSubEmail('');
                  setNewSubAbstract('');
                  setIsNewSubmissionModalOpen(false);
                }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider rounded-lg transition shadow-sm"
              >
                Submit Triage
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: INVITE EDITORIAL BOARD MEMBER */}
      {/* ========================================== */}
      {isInviteMemberModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden shadow-2xl text-left animate-in zoom-in-95 duration-200">
            
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="space-y-1 text-left">
                <span className="text-[9px] font-mono font-black text-emerald-400 uppercase tracking-widest block">BOARD RECRUITMENT</span>
                <h3 className="font-extrabold text-base tracking-tight uppercase leading-none">Invite Editorial Member</h3>
              </div>
              <button onClick={() => setIsInviteMemberModalOpen(false)} className="text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Full Name</label>
                <input 
                  type="text" 
                  placeholder="Dr. Sarah Lin"
                  value={inviteMemName}
                  onChange={(e) => setInviteMemName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-emerald-600 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Academic Email Address</label>
                <input 
                  type="email" 
                  placeholder="s.lin@stanford.edu"
                  value={inviteMemEmail}
                  onChange={(e) => setInviteMemEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-emerald-600 font-bold font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Editorial Board Role</label>
                  <select 
                    value={inviteMemRole}
                    onChange={(e) => setInviteMemRole(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs outline-none font-bold"
                  >
                    <option value="Associate Editor">Associate Editor</option>
                    <option value="Section Editor">Section Editor</option>
                    <option value="Editorial Board">Editorial Board</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Speciality Discipline</label>
                  <input 
                    type="text" 
                    placeholder="AI in Radiology"
                    value={inviteMemSpecialty}
                    onChange={(e) => setInviteMemSpecialty(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-emerald-600 font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button 
                onClick={() => setIsInviteMemberModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!inviteMemName || !inviteMemEmail) return;

                  const nextId = `EM-${String(boardMembers.length + 1).padStart(2, '0')}`;
                  const nextItem: BoardMember = {
                    id: nextId,
                    name: inviteMemName,
                    email: inviteMemEmail,
                    role: inviteMemRole,
                    specialty: inviteMemSpecialty || 'Clinical Informatics',
                    status: 'Invited',
                    joinedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
                    lastActive: '-'
                  };

                  setBoardMembers(prev => [...prev, nextItem]);

                  // Dispatch notification SMTP
                  setCommunicationsData(prev => [
                    {
                      subject: `Editorial Board Invitation: Section Board Recruitment`,
                      recipient: inviteMemName,
                      type: "Editor",
                      status: "Sent",
                      sent: "Just Now"
                    },
                    ...prev
                  ]);

                  // Log audit trail
                  setAuditData(prev => [
                    {
                      event: `Editorial staff ${nextId} recruitment sequence triggered`,
                      actor: "Dr. Akshay (Coordinator)",
                      target: inviteMemName,
                      date: "Just Now",
                      status: "Success"
                    },
                    ...prev
                  ]);

                  setAlertMessage({
                    type: 'success',
                    text: `Invitation dispatched. Dr. ${inviteMemName} successfully listed as Invited.`
                  });

                  // Reset
                  setInviteMemName('');
                  setInviteMemEmail('');
                  setInviteMemSpecialty('');
                  setIsInviteMemberModalOpen(false);
                }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider rounded-lg transition"
              >
                Dispatch Invitation
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 3: INVITE EXTERNAL REVIEWER */}
      {/* ========================================== */}
      {isInviteReviewerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full overflow-hidden shadow-2xl text-left animate-in zoom-in-95 duration-200">
            
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="space-y-1 text-left">
                <span className="text-[9px] font-mono font-black text-emerald-400 uppercase tracking-widest block">PEER REGISTER</span>
                <h3 className="font-extrabold text-base tracking-tight uppercase leading-none">Invite Expert Reviewer</h3>
              </div>
              <button onClick={() => setIsInviteReviewerModalOpen(false)} className="text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Reviewer Name</label>
                <input 
                  type="text" 
                  placeholder="Dr. David Kael"
                  value={inviteRevName}
                  onChange={(e) => setInviteRevName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-emerald-600 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">Specialty Domain</label>
                <input 
                  type="text" 
                  placeholder="Deep Learning, Bioinformatics"
                  value={inviteRevSpecialty}
                  onChange={(e) => setInviteRevSpecialty(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-emerald-600 font-bold"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button 
                onClick={() => setIsInviteReviewerModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!inviteRevName) return;

                  setReviewersData(prev => [
                    ...prev,
                    {
                      name: inviteRevName,
                      specialty: inviteRevSpecialty || 'General Diagnostics',
                      invited: 1,
                      accepted: 0,
                      completed: 0,
                      status: 'Pending'
                    }
                  ]);

                  // Dispatch communications SMTP
                  setCommunicationsData(prev => [
                    {
                      subject: `Peer Reviewer Invitation: JAM peer register`,
                      recipient: inviteRevName,
                      type: "Reviewer",
                      status: "Sent",
                      sent: "Just Now"
                    },
                    ...prev
                  ]);

                  // Log audit trail
                  setAuditData(prev => [
                    {
                      event: `Expert reviewer validation queue enroll: ${inviteRevName}`,
                      actor: "Dr. Akshay (Coordinator)",
                      target: "Reviewer Directory",
                      date: "Just Now",
                      status: "Success"
                    },
                    ...prev
                  ]);

                  setAlertMessage({
                    type: 'success',
                    text: `Direct dispatch successful. ${inviteRevName} added as pending peer reviewer.`
                  });

                  // Reset
                  setInviteRevName('');
                  setInviteRevSpecialty('');
                  setIsInviteReviewerModalOpen(false);
                }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider rounded-lg transition"
              >
                Dispatch Invite
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* WARNING POPUP: GATE EXCEPTION OVERRIDE BLOCK */}
      {/* ========================================== */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-4 border-red-600 max-w-md w-full overflow-hidden shadow-2xl text-left animate-in zoom-in-95 duration-200">
            
            <div className="bg-red-600 text-white p-5 flex items-start gap-3">
              <AlertOctagon className="w-8 h-8 shrink-0 mt-0.5" />
              <div className="space-y-1 text-left">
                <span className="text-[10px] font-mono font-black text-red-200 uppercase tracking-widest block">SECURITY COMPLIANCE THRESHOLD REJECTED</span>
                <h3 className="font-extrabold text-lg tracking-tight uppercase leading-none">Compliance Gate Lockout</h3>
              </div>
            </div>

            <div className="p-6 space-y-4 text-xs font-semibold">
              <p className="text-slate-800 leading-relaxed font-bold">
                ALERT: Changing this manuscript's stage to "{pendingTargetStage}" triggers decisive status gates. JMS policy config currently requires at least <span className="text-red-600 font-extrabold">{minReviewsNeeded} completed peer review reports</span>.
              </p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-slate-600">
                <div className="flex justify-between">
                  <span>Currently assigned reviewers:</span>
                  <strong className="text-slate-900">{(selectedManuscript?.reviewersAssigned?.length || 0)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Required reviewer responses:</span>
                  <strong className="text-slate-900">{minReviewsNeeded}</strong>
                </div>
                <div className="flex justify-between text-red-600 font-extrabold">
                  <span>Missing response deficit:</span>
                  <span>{minReviewsNeeded - (selectedManuscript?.reviewersAssigned?.length || 0)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider block">coordinator override credentials justification</label>
                <select 
                  id="exc-override-justification"
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-xs outline-none font-bold text-red-900 border-red-300"
                >
                  <option value="Editorial Board Consensus Override">Editorial Board Consensus Override</option>
                  <option value="Prior Qualified Evaluation Equivalence">Prior Qualified Evaluation Equivalence</option>
                  <option value="SLA Time-Sensitive Triage Exception">SLA Time-Sensitive Triage Exception</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button 
                onClick={() => {
                  setShowOverrideModal(false);
                  setPendingTargetStage(null);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                Abort Stage Change
              </button>
              <button 
                onClick={() => {
                  const just = (document.getElementById('exc-override-justification') as HTMLSelectElement)?.value || 'Authorized Coordinator Override';
                  
                  // Force change stage
                  handleUpdateManuscriptRow(selectedManuscript.id, { 
                    stage: pendingTargetStage as any,
                    comments: `${selectedManuscript.comments || ''}\n\n[COMPLIANCE GATE BYPASS EXCEPTION LOGGED]: Justification: "${just}" by Coordinator Akshay.`
                  });

                  // Add Audit Trail entry
                  setAuditData(prev => [
                    {
                      event: `Security Compliance Bypass: "${just}" for stage ${pendingTargetStage}`,
                      actor: "Dr. Akshay (Coordinator)",
                      target: selectedManuscript.id,
                      date: "Today 10:00 AM",
                      status: "Bypassed"
                    },
                    ...prev
                  ]);

                  setAlertMessage({
                    type: 'success',
                    text: `SUCCESS: Dynamic gate bypass exception generated under protocol JMS-GATE-2026.`
                  });

                  setShowOverrideModal(false);
                  setPendingTargetStage(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider rounded-lg transition shadow-sm"
              >
                Force State Override
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
