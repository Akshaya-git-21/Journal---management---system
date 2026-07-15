import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  FileText,
  MessageSquare,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  Settings,
  BarChart,
  Briefcase,
  Globe,
  Sliders,
  DollarSign,
  Paperclip,
  Bold,
  Italic,
  Underline,
  Link,
  Link2Off,
  Image,
  MoreHorizontal,
  Check,
  Maximize2,
  Trash2,
  X,
  FileCode2,
  Download,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Printer,
  Edit,
  SquarePen,
  Eye,
  BookOpen,
  FolderOpen,
  RefreshCw,
  Send,
  Inbox,
  Mail
} from 'lucide-react';

interface OjsSubmissionDetailProps {
  paper: any;
  onBack: () => void;
  onUpdatePaperDiscussions?: (paperId: string, updatedDiscussions: any[]) => void;
  currentUser?: { name: string; email: string; role: string } | null;
}

// Predefined OJS templates
const PREDEFINED_TEMPLATES = [
  {
    title: "Initial Submission Cover Notes",
    subject: "Additional Submission Metadata and Editorial Scope Mapping",
    message: "Dear Editor,\n\nPlease find attached the supplementary metadata references mapped for our validation test. All author arrays are structured in compliance with double-blind peer validation policies. We look forward to your editorial advisory.\n\nSincerely,\nCorresponding Author"
  },
  {
    title: "Inquiry regarding Peer Review response",
    subject: "Status Inquiry: Submission Peer Review Progress",
    message: "Dear Editorial panel,\n\nI am writing to inquire if the double-blind referee review parameters for our paper have crossed the minimum count threshold requirements. Please advise if we should upload early verification datasets.\n\nBest regards,\nAuthor Team"
  },
  {
    title: "Revision Submission Notification",
    subject: "Revision Submission Dispatch - Response to Editorial Queries",
    message: "Dear Editor,\n\nWe have strictly reconciled all revision recommendations issued by the Reviewers. In particular, we have cleared the spacing and contrast metrics. A JATS-compliant manuscript is uploaded.\n\nSincerely,\nCorresponding Authors"
  }
];

export default function OjsSubmissionDetail({
  paper,
  onBack,
  onUpdatePaperDiscussions,
  currentUser
}: OjsSubmissionDetailProps) {
  // Navigation tabs within submission view
  const [activeTab, setActiveTab] = useState<string>('SUBMISSION');
  const [activeFileDropdown, setActiveFileDropdown] = useState<boolean>(false);
  const [editingFileName, setEditingFileName] = useState<string>(paper.fileName || `${paper.title || 'test'}-publication.pdf`);
  const [showFileEditModal, setShowFileEditModal] = useState<boolean>(false);
  const [showDetailedRoadmap, setShowDetailedRoadmap] = useState<boolean>(false);

  // Interface for detailed tracking steps
  interface WorkflowStageDetail {
    id: string;
    label: string;
    status: 'completed' | 'active' | 'upcoming' | 'skipped';
    description: string;
    dateCompleted?: string | null;
  }

  // Generates complete 12-stage progress mapping automatically based on manuscript state
  const getDetailedWorkflowState = (paper: any): WorkflowStageDetail[] => {
    const m = paper.raw || {};
    const status = m.status || 'SUBMITTED';
    const hasReviewers = m.reviewers && m.reviewers.length > 0;
    
    // Core state flags computed dynamically
    const isSubmitted = true; 
    const isEditorAssigned = status !== 'SUBMITTED' && status !== 'DRAFT' || hasReviewers || m.editorsNotes;
    const isReviewerInvitationSent = hasReviewers;
    
    const reviewersAccepted = m.reviewers && m.reviewers.some((r: any) => r.status === 'ACCEPTED' || r.status === 'SUBMITTED');
    const isUnderReview = status === 'UNDER_REVIEW' && reviewersAccepted;
    
    const reviewersCompleted = m.reviewers && m.reviewers.some((r: any) => r.status === 'SUBMITTED');
    const isReviewsReceived = reviewersCompleted;
    
    const isEditorDecisionPending = status === 'AWAITING_DECISION';
    
    const isRevisionRequired = (m.editorsNotes || '').includes('REVISE') || 
                               (m.editorsNotes || '').includes('MINOR_REVISIONS') || 
                               (m.editorsNotes || '').includes('MAJOR_REVISIONS') ||
                               paper.stage === 'Revisions Requested' || 
                               paper.stage === 'Revisions Submitted';
                               
    const isRevisedSubmitted = isRevisionRequired && (paper.stage === 'Revisions Submitted' || (m.editorsNotes || '').includes('revision uploaded'));
    const isFinalReview = isRevisedSubmitted && status === 'UNDER_REVIEW';
    
    const isAccepted = status === 'ACCEPTED' || status === 'PUBLISHED';
    const isProduction = status === 'ACCEPTED';
    const isPublished = status === 'PUBLISHED';
    const isRejected = status === 'REJECTED';

    const stages: WorkflowStageDetail[] = [];

    // 1. Submitted
    stages.push({
      id: 'submitted',
      label: 'Submitted',
      status: isAccepted || isPublished || isFinalReview || isRevisedSubmitted || isRevisionRequired || isEditorDecisionPending || isReviewsReceived || isUnderReview || isReviewerInvitationSent || isEditorAssigned ? 'completed' : 'active',
      description: 'Manuscript successfully registered and files uploaded to the journal database.',
      dateCompleted: paper.receivedAt
    });

    // 2. Editor Assigned
    stages.push({
      id: 'editor_assigned',
      label: 'Editor Assigned',
      status: isAccepted || isPublished || isFinalReview || isRevisedSubmitted || isRevisionRequired || isEditorDecisionPending || isReviewsReceived || isUnderReview || isReviewerInvitationSent ? 'completed' : (isEditorAssigned ? 'active' : 'upcoming'),
      description: 'An editorial board member has been assigned to coordinate peer evaluation.',
      dateCompleted: isEditorAssigned ? paper.receivedAt : null
    });

    // 3. Reviewer Invitation Sent
    stages.push({
      id: 'reviewer_invited',
      label: 'Reviewer Invitation Sent',
      status: isAccepted || isPublished || isFinalReview || isRevisedSubmitted || isRevisionRequired || isEditorDecisionPending || isReviewsReceived || isUnderReview ? 'completed' : (isReviewerInvitationSent ? 'active' : 'upcoming'),
      description: 'Formal double-blind peer referee requests dispatched to corresponding university experts.',
      dateCompleted: isReviewerInvitationSent ? paper.receivedAt : null
    });

    // 4. Under Review
    stages.push({
      id: 'under_review',
      label: 'Under Review',
      status: isAccepted || isPublished || isFinalReview || isRevisedSubmitted || isRevisionRequired || isEditorDecisionPending || isReviewsReceived ? 'completed' : (isUnderReview ? 'active' : 'upcoming'),
      description: 'Assigned peer reviewers are currently evaluating methodology, scientific merit, and ethical compliance.',
      dateCompleted: isUnderReview ? paper.receivedAt : null
    });

    // 5. Reviews Received
    stages.push({
      id: 'reviews_received',
      label: 'Reviews Received',
      status: isAccepted || isPublished || isFinalReview || isRevisedSubmitted || isRevisionRequired || isEditorDecisionPending ? 'completed' : (isReviewsReceived ? 'active' : 'upcoming'),
      description: 'Completed evaluation reports received and logged. Minimum consensus thresholds achieved.',
      dateCompleted: isReviewsReceived ? paper.receivedAt : null
    });

    // 6. Editor Decision Pending
    stages.push({
      id: 'decision_pending',
      label: 'Editor Decision Pending',
      status: isAccepted || isPublished || isFinalReview || isRevisedSubmitted || isRevisionRequired ? 'completed' : (isEditorDecisionPending ? 'active' : 'upcoming'),
      description: 'Editorial board is weighing recommendations to finalize the manuscript decision.',
      dateCompleted: isEditorDecisionPending ? paper.receivedAt : null
    });

    // 7. Minor / Major Revision
    let revisionLabel = 'Minor Revision';
    if ((m.editorsNotes || '').toLowerCase().includes('major') || (paper.title || '').toLowerCase().includes('major')) {
      revisionLabel = 'Major Revision';
    }
    const revisionStatus = isAccepted || isPublished ? 'completed' : (isRevisedSubmitted ? 'completed' : (isRevisionRequired ? 'active' : 'skipped'));
    stages.push({
      id: 'revision_required',
      label: revisionLabel,
      status: revisionStatus,
      description: 'Revisions required to address referee and editor feedback before publication clearance.',
      dateCompleted: isRevisionRequired ? paper.receivedAt : null
    });

    // 8. Revised Manuscript Submitted
    const revSubmittedStatus = isAccepted || isPublished ? 'completed' : (isRevisedSubmitted ? 'active' : (isRevisionRequired ? 'upcoming' : 'skipped'));
    stages.push({
      id: 'revised_submitted',
      label: 'Revised Manuscript Submitted',
      status: revSubmittedStatus,
      description: 'Revised files and author reconciliation statement received by the editorial desk.',
      dateCompleted: isRevisedSubmitted ? paper.receivedAt : null
    });

    // 9. Final Review
    const finalReviewStatus = isAccepted || isPublished ? 'completed' : (isFinalReview ? 'active' : (isRevisedSubmitted ? 'upcoming' : 'skipped'));
    stages.push({
      id: 'final_review',
      label: 'Final Review',
      status: finalReviewStatus,
      description: 'Editor-in-chief executing final validation checks on the revised manuscript.',
      dateCompleted: isFinalReview ? paper.receivedAt : null
    });

    // 10. Accepted
    stages.push({
      id: 'accepted',
      label: 'Accepted',
      status: isPublished ? 'completed' : (isAccepted ? 'active' : 'upcoming'),
      description: 'Manuscript approved for publication! Transitioning to typesetting and copyediting.',
      dateCompleted: isAccepted ? paper.receivedAt : null
    });

    // 11. Production
    stages.push({
      id: 'production',
      label: 'Production',
      status: isPublished ? 'completed' : (isProduction ? 'active' : 'upcoming'),
      description: 'Copyediting, XML tagging (JATS standard), and Galley proof creation in progress.',
      dateCompleted: isProduction ? paper.receivedAt : null
    });

    // 12. Published
    stages.push({
      id: 'published',
      label: 'Published',
      status: isPublished ? 'active' : 'upcoming',
      description: 'Galley release launched. Digital Object Identifier (DOI) registered with Crossref.',
      dateCompleted: isPublished ? paper.receivedAt : null
    });

    if (isRejected) {
      stages.forEach(st => {
        if (['revision_required', 'revised_submitted', 'final_review', 'accepted', 'production', 'published'].includes(st.id)) {
          st.status = 'skipped';
        }
      });
      stages.push({
        id: 'rejected',
        label: 'Rejected',
        status: 'active',
        description: 'The manuscript was declined for publication by the editorial board.',
        dateCompleted: paper.receivedAt
      });
    }

    return stages;
  };

  const getDynamicProgress = () => {
    const rawStatus = paper.raw?.status || 'SUBMITTED';
    const paperStage = paper.stage || 'Submission';

    const isRejected = rawStatus === 'REJECTED' || paperStage === 'Declined';

    // 1. Submission Step
    const isSubmissionDone = true; 
    let submissionStatus = 'Completed';

    // 2. Review Step
    let isReviewDone = false;
    let reviewStatus = 'Pending';
    if (
      rawStatus === 'AWAITING_DECISION' ||
      rawStatus === 'ACCEPTED' ||
      rawStatus === 'PUBLISHED' ||
      rawStatus === 'REJECTED' ||
      paperStage === 'Revisions Requested' ||
      paperStage === 'Revisions Submitted' ||
      paperStage === 'Scheduled' ||
      paperStage === 'Published' ||
      paperStage === 'Declined'
    ) {
      isReviewDone = true;
      reviewStatus = 'Completed';
    } else if (rawStatus === 'UNDER_REVIEW') {
      reviewStatus = 'In Progress';
    }

    // 3. Copyediting Step
    let isCopyeditingDone = false;
    let copyeditingStatus = 'Pending';
    if (
      rawStatus === 'ACCEPTED' ||
      rawStatus === 'PUBLISHED' ||
      rawStatus === 'REJECTED' ||
      paperStage === 'Scheduled' ||
      paperStage === 'Published' ||
      paperStage === 'Declined'
    ) {
      isCopyeditingDone = true;
      copyeditingStatus = 'Completed';
    } else if (
      paperStage === 'Revisions Requested' ||
      paperStage === 'Revisions Submitted' ||
      rawStatus === 'AWAITING_DECISION'
    ) {
      copyeditingStatus = 'In Progress';
    }

    // 4. Production Step
    let isProductionDone = false;
    let productionStatus = 'Pending';
    if (rawStatus === 'PUBLISHED' || paperStage === 'Published') {
      isProductionDone = true;
      productionStatus = 'Completed';
    } else if (rawStatus === 'ACCEPTED' || paperStage === 'Scheduled') {
      productionStatus = 'In Progress';
    }

    // 5. Publication Step
    let isPublicationDone = false;
    let publicationStatus = 'Pending';
    if (rawStatus === 'PUBLISHED' || paperStage === 'Published') {
      isPublicationDone = true;
      publicationStatus = 'Completed';
    } else if (isRejected) {
      publicationStatus = 'Declined';
    }

    // Adjust for rejection
    if (isRejected) {
      if (!isReviewDone && rawStatus === 'REJECTED') {
        reviewStatus = 'Declined';
      }
      if (!isCopyeditingDone) copyeditingStatus = 'Skipped';
      if (!isProductionDone) productionStatus = 'Skipped';
      publicationStatus = 'Declined';
    }

    // Calculate percentage
    let percentage = 20; 
    if (isPublicationDone) {
      percentage = 100;
    } else if (isProductionDone) {
      percentage = 80;
    } else if (isCopyeditingDone) {
      percentage = 60 + (productionStatus === 'In Progress' ? 10 : 0);
    } else if (isReviewDone) {
      percentage = 40 + (copyeditingStatus === 'In Progress' ? 10 : 0);
    } else if (reviewStatus === 'In Progress') {
      percentage = 20 + 10;
    }

    const steps = [
      { id: 'submission', label: 'Submission', status: submissionStatus, isDone: isSubmissionDone, isActive: false },
      { id: 'review', label: 'Review', status: reviewStatus, isDone: isReviewDone, isActive: reviewStatus === 'In Progress' },
      { id: 'copyediting', label: 'Copyediting', status: copyeditingStatus, isDone: isCopyeditingDone, isActive: copyeditingStatus === 'In Progress' },
      { id: 'production', label: 'Production', status: productionStatus, isDone: isProductionDone, isActive: productionStatus === 'In Progress' },
      { id: 'publication', label: 'Publication', status: publicationStatus, isDone: isPublicationDone, isActive: publicationStatus === 'In Progress' || (rawStatus === 'PUBLISHED' && !isPublicationDone) }
    ];

    return { percentage, steps, isRejected };
  };

  // Discussion thread states
  const [discussionThreads, setDiscussionThreads] = useState<any[]>(() => {
    const key = `ojs_discussions_paper_${paper.id}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return []; // Empty list per typical default empty state
  });

  useEffect(() => {
    const key = `ojs_discussions_paper_${paper.id}`;
    localStorage.setItem(key, JSON.stringify(discussionThreads));
    if (onUpdatePaperDiscussions) {
      onUpdatePaperDiscussions(paper.id, discussionThreads);
    }
  }, [discussionThreads, paper.id]);

  // View state: 'DASHBOARD' | 'ADD_DISCUSSION' | 'VIEW_THREAD'
  const [viewState, setViewState] = useState<'DASHBOARD' | 'ADD_DISCUSSION' | 'VIEW_THREAD'>('DASHBOARD');
  const [selectedThread, setSelectedThread] = useState<any | null>(null);

  // Form controls for Add Discussion screen
  const [participants, setParticipants] = useState({
    author: true,
    editor: false
  });
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<any[]>([]);

  // Simulation thread message
  const [threadReplyText, setThreadReplyText] = useState("");
  const [threadReplyAttached, setThreadReplyAttached] = useState<any[]>([]);

  // Derived user roles & labels
  const authorDisplayLabel = currentUser ? `${currentUser.name}, Author` : "Dr. Ada Lovelace, Author";
  const editorDisplayLabel = "Kellye Milhorn, Layout Editor, Proofreader";

  // Handle template selection
  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = e.target.value;
    setSelectedTemplateIndex(idx);
    if (idx !== "") {
      const template = PREDEFINED_TEMPLATES[parseInt(idx)];
      setSubject(template.subject);
      setMessage(template.message);
    } else {
      setSubject("");
      setMessage("");
    }
  };

  // Add Discussion Thread submission
  const handleSaveDiscussion = () => {
    if (!subject.trim() || !message.trim()) {
      alert("Please provide both a subject and a message.");
      return;
    }

    const newThread = {
      id: "thread-" + Date.now(),
      subject: subject.trim(),
      initiator: currentUser?.name || "Dr. Ada Lovelace",
      participants: [
        ...(participants.author ? [currentUser?.name || "Dr. Ada Lovelace"] : []),
        ...(participants.editor ? ["Kellye Milhorn (Editor)"] : [])
      ],
      messages: [
        {
          id: "msg-" + Date.now(),
          sender: currentUser?.name || "Dr. Ada Lovelace",
          senderRole: "Author",
          text: message,
          timestamp: new Date().toISOString(),
          files: [...attachedFiles]
        }
      ],
      createdAt: new Date().toISOString(),
      isClosed: false
    };

    setDiscussionThreads([newThread, ...discussionThreads]);
    
    // Reset form
    setSubject("");
    setMessage("");
    setParticipants({ author: true, editor: false });
    setSelectedTemplateIndex("");
    setAttachedFiles([]);
    setViewState('DASHBOARD');
  };

  // Submit reply inside thread
  const handleSendReply = () => {
    if (!threadReplyText.trim() && threadReplyAttached.length === 0) return;

    const updatedThreads = discussionThreads.map(t => {
      if (t.id === selectedThread.id) {
        const updatedMsg = [
          ...t.messages,
          {
            id: "msg-" + Date.now(),
            sender: currentUser?.name || "Dr. Ada Lovelace",
            senderRole: "Author",
            text: threadReplyText,
            timestamp: new Date().toISOString(),
            files: [...threadReplyAttached]
          }
        ];
        const newThreadObj = { ...t, messages: updatedMsg };
        setSelectedThread(newThreadObj);
        return newThreadObj;
      }
      return t;
    });

    setDiscussionThreads(updatedThreads);
    setThreadReplyText("");
    setThreadReplyAttached([]);
  };

  // Simulation upload file helper
  const handleSimulateUpload = (forReply = false) => {
    const mockFiles = [
      { name: "supplementary_charts_v2.pdf", size: "1.4 MB" },
      { name: "response_to_reviewers.docx", size: "625 KB" },
      { name: "experimental_dataset.xlsx", size: "3.1 MB" },
      { name: "high_res_methodology_flow.png", size: "900 KB" }
    ];
    const picked = mockFiles[Math.floor(Math.random() * mockFiles.length)];
    picked.name = `${Date.now().toString().slice(-4)}_${picked.name}`;

    if (forReply) {
      setThreadReplyAttached([...threadReplyAttached, picked]);
    } else {
      setAttachedFiles([...attachedFiles, picked]);
    }
  };

  return (
    <div id="ojs-submission-detail-container" className="w-full bg-[#f4f7f6] min-h-screen text-slate-800 flex flex-col md:flex-row items-stretch border-t border-slate-200">
      
      {/* ======= COLUMN 1: LEFT WORKFLOW & PUBLICATION SIDEBAR ======= */}
      <aside id="ojs-left-sidebar-navigation" className="w-full md:w-64 bg-white border-r border-[#e9ecef] flex flex-col shrink-0 p-5 space-y-7 text-left font-sans">
        
        {/* Section A: Workflow headings and items */}
        <div className="space-y-3">
          <span className="block text-[10.5px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">
            Workflow
          </span>
          <nav className="flex flex-col space-y-1">
            {[
              { id: 'SUBMISSION', label: 'Submission', icon: FileText, badge: null },
              { id: 'REVIEW', label: 'Review', icon: MessageSquare, badge: 2 },
              { id: 'COPYEDITING', label: 'Copyediting', icon: SquarePen, badge: 1 },
              { id: 'PRODUCTION', label: 'Production', icon: Printer, badge: 0 }
            ].map((item) => {
              const isActive = activeTab === item.id;
              const IconComp = item.icon;
              return (
                <button
                  key={item.id}
                  id={`workflow-tab-${item.id}`}
                  onClick={() => {
                    setActiveTab(item.id);
                    setViewState('DASHBOARD');
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-[#eefcf4] text-[#008751] font-extrabold border-l-[3.5px] border-[#008751]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComp className={`w-4 h-4 ${isActive ? 'text-[#008751]' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== null && (
                    <span className={`text-[10.5px] font-bold font-mono px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-[#008751]/10 text-[#008751]' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Section B: Publication headings and items with checkmarks */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="block text-[10.5px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">
              Publication
            </span>
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <nav className="flex flex-col space-y-1">
            {[
              { id: 'TITLE_ABSTRACT', label: 'Title & Abstract', icon: FileText },
              { id: 'CONTRIBUTORS', label: 'Contributors', icon: Globe },
              { id: 'METADATA', label: 'Metadata', icon: Layers },
              { id: 'REFERENCES', label: 'References', icon: Sliders },
              { id: 'GALLEYS', label: 'Galleys', icon: Briefcase }
            ].map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`publication-tab-${item.id}`}
                  onClick={() => {
                    setActiveTab(item.id);
                    setViewState('DASHBOARD');
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-[#eefcf4] text-[#008751] font-extrabold border-l-[3.5px] border-[#008751]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`w-4 h-4 ${isActive ? 'text-[#008751]' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  
                  {/* Circular check mark badge inside a green ring or indicator */}
                  <div className="w-4 h-4 rounded-full bg-[#eafbf0] text-[#008751] flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Section C: Need Help? guideline box card at the bottom */}
        <div className="mt-auto pt-4">
          <div id="ojs-help-box-card" className="border border-slate-200 rounded-xl p-4 bg-white space-y-3 text-left">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4.5 h-4.5 text-[#008751]" />
              <strong className="text-sm font-bold text-slate-800">Need Help?</strong>
            </div>
            <p className="text-xs text-slate-500 leading-normal">
              Read our author guidelines or contact editorial support.
            </p>
            <button
              id="guidelines-button"
              onClick={() => alert("Simulating scholarly writer and peer review workflow directories.")}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[#f8fcf9] hover:bg-[#edf7f1] border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition duration-150 cursor-pointer"
            >
              <span>View Guidelines</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

      </aside>

      {/* ======= MAIN VIEWPORTS: HERO HEADER CONTAINER + DOUBLE COLUMN STACKS ======= */}
      <div id="ojs-main-panel-content" className="flex-grow flex flex-col p-6 space-y-6 overflow-y-auto w-full">
        
        {/* ======================= TOP GREEN HERO PANEL BANNER ======================= */}
        <div id="ojs-hero-panel-banner" className="bg-[#005c35] bg-gradient-to-r from-[#005230] to-[#007043] rounded-2xl p-6 text-white relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between shadow-sm min-h-[110px]">
          
          {/* Wave Curve Abstract SVG Background overlay matching screenshot */}
          <div className="absolute right-0 top-0 h-full w-2/3 pointer-events-none opacity-30 select-none">
            <svg viewBox="0 0 400 200" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0,100 C150,180 250,50 400,120 L400,200 L0,200 Z" fill="url(#wave-gradient)" opacity="0.1" />
              <path d="M0,90 C120,130 200,60 400,100" stroke="url(#line-gradient)" strokeWidth="2" strokeDasharray="5,5" />
              <path d="M0,120 C180,90 220,160 400,70" stroke="url(#line-gradient)" strokeWidth="1.5" />
              <defs>
                <linearGradient id="wave-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
                <linearGradient id="line-gradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.1" />
                  <stop offset="50%" stopColor="#34d399" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.2" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Left Block: Arrow, Index Number, Name and Title */}
          <div className="flex items-center gap-4 relative z-10 text-left">
            
            {/* Dark box back return button */}
            <button
              id="back-list-button"
              onClick={() => {
                if (viewState !== 'DASHBOARD') {
                  setViewState('DASHBOARD');
                } else {
                  onBack();
                }
              }}
              className="p-2 border border-[#00381b]/30 bg-[#00381b]/40 hover:bg-[#00381b]/65 rounded-lg text-emerald-100 hover:text-white transition duration-150 cursor-pointer"
              title="Return to authors hub"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span className="text-3xl font-bold text-emerald-200 tracking-tight font-sans">
                  {paper.id || "990"}
                </span>
                <h1 className="text-xl font-bold tracking-tight text-white line-clamp-1">
                  {paper.author || "Пестерніков"} — {paper.title || "test"}
                </h1>
              </div>
              
              {/* Circular bullet active state badge */}
              <div className="flex items-center gap-2 pt-0.5">
                <span className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" />
                <span className="text-[10.5px] font-bold uppercase tracking-wider font-mono text-emerald-100">
                  SUBMISSION
                </span>
              </div>
            </div>

          </div>

          {/* Right Block: Library documentary archives catalog view */}
          <div className="mt-4 md:mt-0 relative z-10">
            <button
              id="ojs-library-catalog-trigger"
              onClick={() => alert("Review and organize JATS layouts, DOI metadata indices and author proofsheets catalogs.")}
              className="bg-[#004724]/30 hover:bg-[#004724]/70 transition-all text-white font-extrabold border border-white/40 text-xs px-4 py-2 rounded-lg cursor-pointer tracking-wider flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4 text-emerald-100" />
              <span>Library</span>
            </button>
          </div>

        </div>

        {/* ======================= TWO-PANE STACK SECTION ======================= */}
        <div className="w-full flex flex-col lg:flex-row items-start gap-6">
          
          {/* ======= CENTER CORE COLUMN (COLUMN 2) ======= */}
          <div id="ojs-column-center-main" className="flex-grow space-y-6 w-full lg:max-w-[70%]">
            
            {/* Sub-heading info indicator */}
            <div className="flex items-center gap-2 text-slate-800">
              <span className="w-2.5 h-2.5 rounded-full bg-[#008751]" />
              <span className="text-xs font-bold font-mono uppercase tracking-widest text-[#004d2b]">
                WORKFLOW: {activeTab.replace('_', ' ')}
              </span>
            </div>

            {/* Render dynamically of active tab */}
            {activeTab === 'SUBMISSION' ? (
              <div className="space-y-6 text-left">
                
                {viewState === 'DASHBOARD' && (
                  <div className="space-y-6 animate-in fade-in duration-150">
                    
                    {/* PANEL 1: Submission Language settings */}
                    <div className="bg-white border border-[#edf3f0] rounded-xl p-5 shadow-xs flex items-center justify-between text-left">
                      <div className="flex items-start gap-4">
                        {/* Globe graphic wrap icon */}
                        <div className="w-11 h-11 rounded-full bg-[#eefcf5] flex items-center justify-center text-[#008751] shrink-0 mt-0.5">
                          <Globe className="w-5.5 h-5.5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong className="text-[14px] font-bold text-slate-850">Current Submission Language:</strong>
                            <span className="inline-block bg-[#eafbf0] text-[#008751] border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full">
                              {paper.language || "English"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-normal">
                            You can change the submission language before the review process begins.
                          </p>
                        </div>
                      </div>

                      <button
                        id="change-language-trigger"
                        onClick={() => alert("Simulate changing the primary submission language for editorial indexing.")}
                        className="flex items-center gap-2 border border-slate-250 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-700 select-none transition cursor-pointer shrink-0"
                      >
                        <Globe className="w-3.5 h-3.5 text-slate-500" />
                        <span>Change Language</span>
                      </button>
                    </div>

                    {/* PANEL 2: Submission files list */}
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs text-left">
                      
                      {/* Top banner */}
                      <div className="bg-[#fcfdfe] hover:bg-[#fbfcfc] p-5 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-full bg-[#eefcf5] flex items-center justify-center text-[#008751] shrink-0 mt-0.5">
                            <FolderOpen className="w-5.5 h-5.5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-[#004d2b] text-[15px]">Submission Files</h3>
                            <p className="text-xs text-slate-450 text-slate-400 mt-1 font-medium">
                              Files uploaded at the time of submission
                            </p>
                          </div>
                        </div>

                        <button
                          id="upload-file-button"
                          onClick={() => handleSimulateUpload(false)}
                          className="flex items-center gap-2 border border-[#008751] text-[#008751] hover:bg-emerald-50 px-4 py-2 text-xs font-extrabold rounded-lg transition duration-150 cursor-pointer shadow-xs select-none"
                        >
                          <Download className="w-3.5 h-3.5 text-[#008751] rotate-180" />
                          <span>Upload New File</span>
                        </button>
                      </div>

                      {/* Files table list */}
                      <table className="w-full text-left max-w-ffffff">
                        <thead>
                          <tr className="bg-[#f8fcf9] border-b border-slice-200 text-[10px] font-bold text-slate-550 uppercase tracking-widest font-mono select-none">
                            <th className="px-5 py-3 w-16 text-center">No</th>
                            <th className="px-5 py-3">File Name</th>
                            <th className="px-5 py-3 w-36 text-center">Date Uploaded</th>
                            <th className="px-5 py-3 w-32 text-center">Type</th>
                            <th className="px-5 py-3 w-16 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          <tr className="hover:bg-slate-50/50 transition duration-100">
                            
                            {/* file index */}
                            <td className="px-5 py-5 text-center font-mono font-bold text-slate-400">
                              1511
                            </td>

                            {/* file link details */}
                            <td className="px-5 py-5">
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                                <div className="text-left">
                                  <button
                                    id="download-asset-handle-btn"
                                    onClick={() => alert(`Simulating downloading: ${editingFileName}`)}
                                    className="text-[#008751] hover:text-[#007043] hover:underline font-extrabold text-sm text-left transition"
                                  >
                                    {editingFileName}
                                  </button>
                                  <span className="block text-[10px] text-slate-400 font-medium mt-0.5">Size: 1.24 MB</span>
                                </div>
                              </div>
                            </td>

                            {/* upload date */}
                            <td className="px-5 py-5 text-center font-mono text-slate-450 font-semibold text-slate-500">
                              {paper.receivedAt || "2026-06-08"}
                            </td>

                            {/* Article Text teal representation badge */}
                            <td className="px-5 py-5 text-center">
                              <span className="inline-block bg-[#eefcf4] text-[#008751] border border-emerald-100 px-3 py-1 font-bold text-[10.5px] rounded-full uppercase tracking-wider font-mono">
                                Article Text
                              </span>
                            </td>

                            {/* Options ellipsis */}
                            <td className="px-5 py-5 text-center relative">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  id="view-file-quick"
                                  onClick={() => alert(`Reviewing quick document layout details: ${editingFileName}`)}
                                  className="p-1.5 bg-slate-100 hover:bg-[#eefcf4] text-slate-500 hover:text-[#008751] rounded-lg transition cursor-pointer"
                                  title="View galley document"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  id="actions-ellipsis-button"
                                  onClick={() => setActiveFileDropdown(!activeFileDropdown)}
                                  className={`p-1.5 rounded-lg border text-slate-500 hover:bg-slate-50 transition cursor-pointer ${
                                    activeFileDropdown ? 'bg-slate-100 scale-95 border-slate-300' : 'border-slate-200 bg-white'
                                  }`}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </div>

                              {activeFileDropdown && (
                                <div className="absolute right-5 top-12 w-32 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1.5 animate-in fade-in zoom-in-95 duration-100 text-left">
                                  <button
                                    id="menu-edit-name-btn"
                                    onClick={() => {
                                      setActiveFileDropdown(false);
                                      setShowFileEditModal(true);
                                    }}
                                    className="w-full text-left font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 transition text-xs flex items-center gap-2 cursor-pointer"
                                  >
                                    <SquarePen className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Edit Name</span>
                                  </button>
                                  <button
                                    id="menu-delete-file-btn"
                                    onClick={() => {
                                      setActiveFileDropdown(false);
                                      alert("Scholarly article text deleted in memory. The metadata persists.");
                                    }}
                                    className="w-full text-left font-bold text-red-650 text-red-600 hover:bg-red-50 px-4 py-2 transition text-xs flex items-center gap-2 cursor-pointer border-t border-slate-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </td>

                          </tr>
                        </tbody>
                      </table>

                      {/* Download link footer */}
                      <div className="bg-[#f8faf9] p-4.5 border-t border-slate-100 text-left">
                        <button
                          id="bulk-assets-download-link"
                          onClick={() => alert("Downloading all matching document publication files recursively.")}
                          className="inline-flex items-center gap-2 text-xs font-black text-[#008751] hover:text-[#007043] hover:underline cursor-pointer select-none transition"
                        >
                          <Download className="w-4 h-4 text-[#008751]" />
                          <span>Download All Files</span>
                        </button>
                      </div>

                    </div>

                    {/* PANEL 3: Pre-Review discussions */}
                    <div id="ojs-discussions-card-panel" className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs text-left">
                      
                      {/* Banner list */}
                      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-full bg-[#eefcf5] flex items-center justify-center text-[#008751] shrink-0 mt-0.5">
                            <MessageSquare className="w-5.5 h-5.5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-[#004d2b] text-[15px]">Pre-Review Discussions</h3>
                            <p className="text-xs text-slate-450 text-slate-400 mt-1 font-medium">
                              Use this space to communicate with the editorial team before the review begins.
                            </p>
                          </div>
                        </div>

                        <button
                          id="initiate-discussion-btn"
                          onClick={() => setViewState('ADD_DISCUSSION')}
                          className="bg-[#008751] hover:bg-[#007043] transition-all text-white font-extrabold text-xs px-5 py-2.5 rounded-lg shadow-sm hover:shadow-md cursor-pointer tracking-wider flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4 text-white font-bold stroke-[3]" />
                          <span>Add Discussion</span>
                        </button>
                      </div>

                      {/* Thread List empty state illustration matching screenshot exactly */}
                      <div className="bg-white">
                        {discussionThreads.length === 0 ? (
                          <div id="discussions-empty-viewport" className="py-14 flex flex-col items-center justify-center space-y-4">
                            
                            {/* Speech bubble outline illustration badge in glowing green circle background */}
                            <div className="w-20 h-20 rounded-full bg-[#f4faf7] flex items-center justify-center shadow-inner relative animate-pulse">
                              <div className="absolute inset-0 rounded-full bg-emerald-100/30 scale-110" />
                              <MessageSquare className="w-9 h-9 text-[#008751] relative z-10" />
                            </div>

                            <div className="text-center space-y-1">
                              <strong className="block text-slate-800 text-sm font-extrabold">No Items</strong>
                              <span className="block text-xs text-slate-450 text-slate-400 font-medium">
                                There are no discussions yet.
                              </span>
                            </div>

                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-[#f8fcf9] border-b border-slate-200 text-[10px] font-bold text-slate-550 uppercase tracking-widest font-mono">
                                  <th className="px-5 py-3">Topic/Subject Name</th>
                                  <th className="px-5 py-3 w-40">From</th>
                                  <th className="px-5 py-3 w-44">Last Reply</th>
                                  <th className="px-5 py-3 w-16 text-center">Replies</th>
                                  <th className="px-5 py-3 w-16 text-center">Closed</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {discussionThreads.map((thread) => {
                                  const lastMsg = thread.messages[thread.messages.length - 1];
                                  return (
                                    <tr key={thread.id} className="hover:bg-slate-50/50 transition">
                                      <td className="px-5 py-3.5 font-bold">
                                        <button
                                          onClick={() => {
                                            setSelectedThread(thread);
                                            setViewState('VIEW_THREAD');
                                          }}
                                          className="text-[#008751] hover:text-[#007043] hover:underline text-left font-extrabold cursor-pointer transition"
                                        >
                                          {thread.subject}
                                        </button>
                                      </td>
                                      
                                      <td className="px-5 py-3.5 text-slate-600 font-semibold">
                                        {thread.initiator}
                                      </td>

                                      <td className="px-5 py-3.5 text-slate-500 font-mono text-[10.5px]">
                                        {new Date(lastMsg.timestamp).toLocaleDateString()} {new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                      </td>

                                      <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-500">
                                        {thread.messages.length - 1}
                                      </td>

                                      <td className="px-5 py-3.5 text-center">
                                        <input
                                          type="checkbox"
                                          disabled
                                          checked={thread.isClosed}
                                          className="w-3.5 h-3.5 text-[#008751] rounded border-slate-350 focus:ring-0"
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                )}

                {/* ======================= DISCUSSION THREAD CHAT SCREEN ======================= */}
                {viewState === 'VIEW_THREAD' && selectedThread && (
                  <div className="space-y-4 animate-in fade-in duration-100 text-xs">
                    
                    {/* Thread Navigation header */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <button
                        onClick={() => setViewState('DASHBOARD')}
                        className="flex items-center gap-1.5 font-bold text-[#008751] hover:underline cursor-pointer"
                      >
                        <ChevronLeft className="w-4.5 h-4.5" />
                        <span>Back to Pre-Review Discussions</span>
                      </button>
                      <span className="text-[10px] font-mono bg-emerald-50 text-[#008751] border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider font-bold">
                        Discussions Workspace
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      
                      {/* Thread Info Topic Bar */}
                      <div className="bg-slate-50 border-b border-slate-200/80 p-5 text-left">
                        <span className="text-[10px] font-mono uppercase text-slate-400 font-extrabold block tracking-wider">Topic Discussion Subject</span>
                        <strong className="text-base font-bold text-slate-900 block mt-1">{selectedThread.subject}</strong>
                        
                        <div className="flex flex-wrap gap-2 mt-3 items-center text-[11px]">
                          <span className="font-semibold text-slate-500">Addressed Participants: </span>
                          <div className="flex gap-2">
                            {selectedThread.participants.map((p: any, i: number) => (
                              <span key={i} className="bg-emerald-50 text-[#008751] border border-emerald-100 font-semibold px-2.5 py-0.5 rounded-full text-[10.5px]">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Messages Stack */}
                      <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto bg-slate-50/20">
                        {selectedThread.messages.map((m: any) => (
                          <div key={m.id} className="border border-slate-200 rounded-xl bg-white p-4 space-y-2.5 shadow-xs text-left">
                            <div className="flex items-center justify-between border-b pb-1.5 border-gray-100">
                              <span className="font-bold text-slate-800 text-[12px] flex items-center gap-2">
                                {m.sender}
                                <span className="font-mono text-[9px] bg-slate-100 px-2 py-0.5 rounded font-extrabold uppercase text-slate-500 border">
                                  {m.senderRole}
                                </span>
                              </span>
                              <span className="text-[10.5px] text-slate-400 font-mono">
                                {new Date(m.timestamp).toLocaleString()}
                              </span>
                            </div>
                            
                            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap font-sans font-medium">
                              {m.text}
                            </p>

                            {m.files && m.files.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-dashed space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                                <span className="block text-[9.5px] font-bold text-slate-400 uppercase font-mono tracking-widest mb-1.5">Attached Documentation</span>
                                {m.files.map((file: any, fIdx: number) => (
                                  <div key={fIdx} className="flex items-center justify-between text-[11px] text-slate-600">
                                    <span className="flex items-center gap-1.5 font-bold text-[#008751] hover:underline cursor-pointer">
                                      <FileText className="w-4 h-4 text-rose-500" />
                                      {file.name}
                                    </span>
                                    <span className="font-mono text-slate-400 text-[10px]">({file.size})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Send reply widget inside thread */}
                      <div className="p-5 bg-slate-50 border-t border-slate-200 space-y-4">
                        
                        <div className="text-left space-y-1">
                          <label className="block text-[10.5px] uppercase font-bold text-slate-500 font-mono tracking-wider">Reply message *</label>
                          <textarea
                            rows={3}
                            value={threadReplyText}
                            onChange={(e) => setThreadReplyText(e.target.value)}
                            placeholder="Type response back to the editorial panel..."
                            className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs outline-none focus:ring-1 focus:ring-[#008751] focus:border-[#008751] transition font-medium text-slate-800"
                          />
                        </div>

                        {/* Reply tools attachment zone */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleSimulateUpload(true)}
                              className="text-slate-700 hover:text-slate-900 bg-white p-1.5 px-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition font-bold font-mono tracking-wide flex items-center gap-1.5 text-[10.5px]"
                            >
                              <Paperclip className="w-4 h-4 text-slate-400" />
                              <span>Attach paper proofsheet</span>
                            </button>

                            {threadReplyAttached.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {threadReplyAttached.map((f, i) => (
                                  <span key={i} className="bg-emerald-50 border border-emerald-100 text-[#008751] px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                                    <FileText className="w-3 h-3 text-rose-450" />
                                    <span>{f.name}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5">
                            <button
                              onClick={() => setViewState('DASHBOARD')}
                              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg font-bold cursor-pointer text-xs"
                            >
                              Dismiss
                            </button>
                            <button
                              onClick={handleSendReply}
                              disabled={!threadReplyText.trim() && threadReplyAttached.length === 0}
                              className="bg-[#008751] hover:bg-[#007043] disabled:opacity-50 text-white font-extrabold text-xs px-5 py-2.5 rounded-lg shadow-sm cursor-pointer tracking-wider"
                            >
                              Submit reply
                            </button>
                          </div>

                        </div>

                      </div>

                    </div>

                  </div>
                )}

                {/* ======================= ADD DISCUSSION MODAL IN-PLACE ======================= */}
                {viewState === 'ADD_DISCUSSION' && (
                  <div className="space-y-4 animate-in slide-in-from-bottom duration-150 text-xs text-left leading-normal">
                    
                    <div className="flex items-center gap-1 text-[#008751]">
                      <button
                        onClick={() => setViewState('DASHBOARD')}
                        className="p-1 px-2 hover:bg-emerald-50 rounded-lg transition font-extrabold flex items-center gap-1 text-sm cursor-pointer"
                      >
                        <ChevronLeft className="w-4.5 h-4.5 stroke-[2.5]" />
                        <span>Add Discussion Room</span>
                      </button>
                    </div>

                    {/* Form envelope */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 md:p-6 space-y-5">
                      
                      {/* 1. Participant filters */}
                      <div className="space-y-2">
                        <span className="block text-[11px] font-bold text-slate-700 font-mono uppercase tracking-wide">
                          Participants
                        </span>
                        <div className="space-y-1.5 pl-1 font-medium text-slate-700">
                          
                          <label className="flex items-center gap-2.5 cursor-pointer text-xs select-none">
                            <input
                              type="checkbox"
                              checked={participants.author}
                              onChange={(e) => setParticipants({ ...participants, author: e.target.checked })}
                              className="w-4 h-4 text-[#008751] rounded border-slate-300 focus:ring-0 cursor-pointer"
                            />
                            <span>{authorDisplayLabel}</span>
                          </label>

                          <label className="flex items-center gap-2.5 cursor-pointer text-xs select-none">
                            <input
                              type="checkbox"
                              checked={participants.editor}
                              onChange={(e) => setParticipants({ ...participants, editor: e.target.checked })}
                              className="w-4 h-4 text-[#008751] rounded border-slate-300 focus:ring-0 cursor-pointer"
                            />
                            <span>{editorDisplayLabel}</span>
                          </label>

                        </div>
                      </div>

                      {/* 2. Selecting templates */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-700">
                          Choose a predefined message template, or write a custom message below:
                        </label>
                        <select
                          value={selectedTemplateIndex}
                          onChange={handleTemplateChange}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-[#008751] font-semibold text-slate-700 cursor-pointer"
                        >
                          <option value="">Select template...</option>
                          {PREDEFINED_TEMPLATES.map((tpl, i) => (
                            <option key={i} value={String(i)}>
                              {tpl.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 3. Subject input */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-800">
                          Subject <span className="text-red-500 font-bold ml-0.5">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="Type discussion subject details..."
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-[#008751] font-semibold text-slate-800"
                        />
                      </div>

                      {/* 4. Rich text editor body structure */}
                      <div className="space-y-2">
                        <label className="block text-[11px] font-bold text-slate-800">
                          Message <span className="text-red-500 font-bold ml-0.5">*</span>
                        </label>
                        
                        <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col bg-white">
                          
                          {/* Rich-text simulated menu actions panel */}
                          <div className="bg-slate-50 border-b p-2 flex items-center justify-between text-slate-400 select-none">
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              <button type="button" onClick={() => alert("Toolbar: HTML editor simulated.")} className="p-1 px-1.5 hover:bg-slate-200 hover:text-slate-700 rounded font-bold font-mono text-[10px] cursor-pointer">HTML</button>
                              <div className="w-[1px] h-3.5 bg-slate-200" />
                              <button type="button" onClick={() => setMessage(m => m ? `**${m}**` : '')} className="p-1 hover:bg-slate-200 hover:text-slate-700 rounded cursor-pointer" title="Bold text">
                                <Bold className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => setMessage(m => m ? `*${m}*` : '')} className="p-1 hover:bg-slate-200 hover:text-slate-700 rounded cursor-pointer" title="Italic text">
                                <Italic className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => setMessage(m => m ? `_${m}_` : '')} className="p-1 hover:bg-slate-200 hover:text-slate-700 rounded cursor-pointer" title="Underline text">
                                <Underline className="w-3.5 h-3.5" />
                              </button>
                              <div className="w-[1px] h-3.5 bg-slate-200" />
                              
                              <button type="button" onClick={() => alert("Toolbar: Link insert")} className="p-1 hover:bg-slate-200 hover:text-slate-700 rounded cursor-pointer" title="Link">
                                <Link className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => alert("Toolbar: Link unlink")} className="p-1 hover:bg-slate-200 hover:text-slate-700 rounded cursor-pointer" title="Remove Link">
                                <Link2Off className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => alert("Toolbar: Code insert")} className="p-1 hover:bg-slate-200 hover:text-slate-700 rounded cursor-pointer" title="Code block">
                                <FileCode2 className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => alert("Toolbar: Embed illustration")} className="p-1 hover:bg-slate-200 hover:text-slate-700 rounded cursor-pointer" title="Graphics">
                                <Image className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSimulateUpload(false)}
                              className="text-[10.5px] text-[#008751] hover:underline font-extrabold flex items-center gap-1 px-1 rounded cursor-pointer font-mono"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>Attach layout files</span>
                            </button>

                          </div>

                          <textarea
                            rows={6}
                            required
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type JATS schemas, double-blind parameters, or reviewer validation comments..."
                            className="w-full bg-white border-0 p-3 text-xs outline-none focus:ring-0 font-medium text-slate-800 resize-y"
                          />

                        </div>
                      </div>

                      {/* 5. Attach file indicators */}
                      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="text-[10.5px] font-bold text-slate-600 uppercase font-mono tracking-wider">
                            Attached Files
                          </span>
                          
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleSimulateUpload(false)}
                              className="bg-white hover:bg-slate-100 border text-[#008751] px-2.5 py-1 rounded shadow-inner font-mono font-bold tracking-wide cursor-pointer transition flex items-center gap-0.5"
                            >
                              <Search className="w-3 h-3 text-[#008751]" />
                              <span>Search</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSimulateUpload(false)}
                              className="bg-white hover:bg-slate-100 border text-[#008751] px-2.5 py-1 rounded shadow-inner font-mono font-bold tracking-wide cursor-pointer transition"
                            >
                              <span>Upload File</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSimulateUpload(false)}
                              className="bg-white hover:bg-slate-100 border text-[#008751] px-2.5 py-1 rounded shadow-inner font-mono font-bold tracking-wide cursor-pointer transition"
                            >
                              <span>Select Files</span>
                            </button>
                          </div>
                        </div>

                        {attachedFiles.length === 0 ? (
                          <div className="text-center py-6 text-slate-400 font-mono text-[10.5px]">
                            No Files
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-200 text-xs">
                            {attachedFiles.map((file, i) => (
                              <div key={i} className="py-2 flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-bold text-[#008751]">
                                  <FileText className="w-3.5 h-3.5 text-rose-500" />
                                  {file.name}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-slate-400 text-[10px]">({file.size})</span>
                                  <button
                                    type="button"
                                    onClick={() => setAttachedFiles(attachedFiles.filter((_, idx) => idx !== i))}
                                    className="text-red-500 hover:text-red-700 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Control options */}
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3.5">
                        <button
                          type="button"
                          onClick={() => {
                            setViewState('DASHBOARD');
                            setSubject("");
                            setMessage("");
                            setParticipants({ author: true, editor: false });
                            setSelectedTemplateIndex("");
                            setAttachedFiles([]);
                          }}
                          className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition font-bold text-xs cursor-pointer text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveDiscussion}
                          className="px-5 py-2 bg-[#008751] hover:bg-[#007043] shadow-xs text-white rounded-lg transition font-extrabold text-xs tracking-wider"
                        >
                          OK
                        </button>
                      </div>

                    </div>

                  </div>
                )}

              </div>
            ) : activeTab === 'REVIEW' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Workflow: Double-Blind Peer Review</h2>
                <p className="text-slate-600 leading-relaxed font-semibold">
                  During this phase, blind referees critique the uploaded galley document, indexing scientific validation metrics, methodology suitability, and conclusions sanity.
                </p>

                <div className="bg-[#eefcf4] border border-emerald-100 p-4 rounded-xl leading-relaxed text-[#004d2e]">
                  <strong className="block text-[#004d2b] font-bold text-xs flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-[#008751]" />
                    <span>Isolation safeguards active:</span>
                  </strong>
                  The system stripped author identities from the review terminal records. All feedback submissions will route via the Editorial Central proxy.
                </div>

                <div className="border border-dashed p-4 rounded-lg bg-slate-50 text-slate-400 font-mono text-[10.5px]">
                  Status Metrics: {paper.stage === 'Revisions Requested' ? 'Active Revisions Phase - Revision File Awaiting Dispatch' : 'Awaiting Reviewer Allocation / Invitation dispatch'}
                </div>
              </div>
            ) : activeTab === 'COPYEDITING' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Workflow: Editorial Copyediting</h2>
                <p className="text-slate-600 leading-relaxed font-semibold">
                  Copyediting clears linguistic friction, spelling syntax, and aligns structural layout with IEEE styles.
                </p>
                <div className="p-4 bg-slate-50 font-medium text-slate-500 rounded-lg border font-mono text-center uppercase text-[10px] tracking-wider font-extrabold">
                  Stage: {paper.stage === 'Published' ? 'RELEASE READY' : 'QUEUED (PENDING ACCEPTANCE DECISION)'}
                </div>
              </div>
            ) : activeTab === 'PRODUCTION' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-[#004d2b] uppercase tracking-wide border-b pb-2.5 font-mono">Workflow: JATS XML & DOI Production</h2>
                <p className="text-slate-600 leading-relaxed font-semibold">
                  Production compiles final production galleys, registers DOI pointers, and plans catalog issues mappings.
                </p>
                <div className="p-4 bg-[#004d2b] text-white rounded-lg font-mono text-[10px] text-center uppercase tracking-widest font-extrabold">
                  Current Paper Node State: {paper.stage}
                </div>
              </div>
            ) : activeTab === 'TITLE_ABSTRACT' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-6 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Metadata: Title and Abstract Summary</h2>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10.5px] uppercase font-bold text-slate-400 font-mono tracking-widest">Coretalk Title</label>
                    <p className="text-xs font-bold font-sans text-slate-900 leading-relaxed bg-[#f8fcf9] border border-slate-150 p-4 rounded-xl shadow-xs">
                      {paper.title || "test"}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10.5px] uppercase font-bold text-slate-400 font-mono tracking-widest">Abstract Metadata</label>
                    <p className="text-xs text-slate-600 font-semibold leading-relaxed bg-white border border-slate-150 p-4 rounded-xl shadow-xs max-h-72 overflow-y-auto">
                      {paper.abstract || "No abstract metadata loaded for this validation run."}
                    </p>
                  </div>
                </div>
              </div>
            ) : activeTab === 'CONTRIBUTORS' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Metadata: Authors & Affiliations</h2>
                <p className="text-slate-500 leading-relaxed font-sans font-medium text-xs">
                  Individuals cataloged with submission authority permissions matching workspace settings.
                </p>

                <div className="divide-y border rounded-xl bg-white overflow-hidden text-xs border-slate-200 shadow-xs">
                  <div className="p-4 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <strong className="block text-slate-800 text-[13px] font-bold">{paper.author || "Пестерніков"}</strong>
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">OJS Registered Partner University • author@jms.org</span>
                    </div>
                    <span className="font-mono text-[9px] bg-[#eefcf4] text-[#008751] border border-emerald-100 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Primary Author</span>
                  </div>
                </div>
              </div>
            ) : activeTab === 'METADATA' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Metadata: Indexed Tags & Licensing</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10.5px] font-mono leading-relaxed">
                  <div className="bg-white border border-slate-250 p-4 rounded-lg">
                    <strong className="text-slate-400 font-bold text-[9px] uppercase tracking-widest block mb-1 font-mono">Journal Assigned Section</strong>
                    <span className="text-slate-800 font-extrabold block text-xs">{paper.section || "Articles"}</span>
                  </div>
                  
                  <div className="bg-white border border-slate-250 p-4 rounded-lg">
                    <strong className="text-slate-400 font-bold text-[9px] uppercase tracking-widest block mb-1 font-mono">Licensing Terms</strong>
                    <span className="text-slate-800 font-extrabold block text-xs uppercase text-[#008751]">CC BY 4.0 Open-Access License</span>
                  </div>

                  <div className="bg-white border border-slate-250 p-4 rounded-lg">
                    <strong className="text-slate-400 font-bold text-[9px] uppercase tracking-widest block mb-1 font-mono">Index Taxonomy</strong>
                    <span className="text-slate-700 font-bold block">Medical Artificial Intelligence Systems</span>
                  </div>

                  <div className="bg-white border border-slate-250 p-4 rounded-lg">
                    <strong className="text-slate-400 font-bold text-[9px] uppercase tracking-widest block mb-1 font-mono">JATS Metadata Schema</strong>
                    <span className="text-slate-700 font-bold block">v1.2 XML COMPACT</span>
                  </div>
                </div>
              </div>
            ) : activeTab === 'REFERENCES' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Metadata: References and Bibliography</h2>
                
                <div className="bg-[#f8fcf9] p-4.5 rounded-xl border border-slate-150 text-slate-650 space-y-3 font-mono leading-relaxed">
                  <p>
                    1. Пестерніков, Р. (2025). Clinical Neural Models: Optimizing Biopsy Image Seeding. Journal of Artificial Intelligence in Medicine.
                  </p>
                  <p>
                    2. Willinksy, J. (2021). Scholarly Associations and the Economic Viability of Open Access Publishing. Scholarly Publishing Review, 11(2).
                  </p>
                  <p>
                    3. Cha, J., & Lovelace, A. (2024). Multi-Tenant Namespace Separation Protocols in Modern Health Registries. IEEE Transactions.
                  </p>
                </div>
              </div>
            ) : activeTab === 'GALLEYS' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Metadata: Compiled Production Galleys</h2>
                <p className="text-slate-500 font-semibold leading-relaxed">
                  Galleys represent the final validated publications compiled for PDF, EPUB or JATS XML reading.
                </p>

                <div className="p-4 border rounded-xl flex items-center justify-between text-xs bg-slate-50 font-normal shadow-inner">
                  <div className="flex items-center gap-2.5">
                    <FileCode2 className="w-5 h-5 text-[#008751] stroke-1" />
                    <div className="text-left">
                      <strong className="block text-slate-850">{editingFileName}</strong>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">Format: PDF • Size: 2.1 MB</span>
                    </div>
                  </div>

                  <button
                    onClick={() => alert(`Simulated downloading galley of: ${editingFileName}`)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4.5 py-2 text-[10.5px] rounded hover:bg-slate-950 cursor-pointer font-mono tracking-wider shadow-xs"
                  >
                    Download Asset
                  </button>
                </div>
              </div>
            ) : null}

          </div>

          {/* ======= COLUMN 3: RIGHT DETAILS SIDEBAR ======= */}
          {(() => {
            const { isRejected } = getDynamicProgress();
            return (
              <aside id="ojs-column-right-details" className="w-full lg:w-80 shrink-0 space-y-6 text-left leading-normal">
                
                {/* AREA A: Submission Progress detailed vertical timeline widget */}
                <div id="ojs-progress-widget" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
                  
                  <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-800 font-sans tracking-tight">
                        Submission Status
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-sans">Workflow tracking lifecycle</p>
                    </div>
                    {isRejected && (
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded-md border border-rose-100 font-mono">
                        DECLINED
                      </span>
                    )}
                  </div>

                  {/* Detailed 12-stage academic tracker timeline */}
                  <div className="space-y-4 text-left">
                    <div className="relative pl-5 border-l border-slate-200 ml-2.5 space-y-5 text-xs">
                      {getDetailedWorkflowState(paper).map((stage) => {
                        const isDone = stage.status === 'completed';
                        const isActive = stage.status === 'active';
                        const isUpcoming = stage.status === 'upcoming';
                        const isSkipped = stage.status === 'skipped';

                        let bulletColor = "bg-white border-slate-200 text-slate-350";
                        let textColor = "text-slate-400";
                        let iconElem: React.ReactNode = null;

                        if (isDone) {
                          bulletColor = "bg-[#008751] border-[#008751] text-white";
                          textColor = "text-slate-800 font-extrabold";
                          iconElem = <Check className="w-2.5 h-2.5 stroke-[3.5]" />;
                        } else if (isActive) {
                          bulletColor = "bg-emerald-50 border-2 border-[#008751] text-[#008751] animate-pulse ring-2 ring-[#008751]/10";
                          textColor = "text-[#008751] font-black";
                          iconElem = <span className="w-1.5 h-1.5 bg-[#008751] rounded-full animate-ping" />;
                        } else if (isSkipped) {
                          bulletColor = "bg-slate-100 border-slate-200 text-slate-400";
                          textColor = "text-slate-450 line-through";
                          iconElem = <span className="text-[8px]">-</span>;
                        }

                        return (
                          <div key={stage.id} className="relative">
                            {/* Circle dot marker */}
                            <div className={`absolute -left-[30.5px] top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${bulletColor} z-10 transition`}>
                              {iconElem}
                            </div>

                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[11px] leading-tight ${textColor}`}>
                                  {stage.label}
                                </span>
                                {stage.dateCompleted && (
                                  <span className="text-[9px] font-mono font-bold text-[#008751] whitespace-nowrap bg-emerald-50 px-1.5 py-0.5 rounded">
                                    {stage.dateCompleted}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10.5px] text-slate-500 leading-relaxed font-sans select-none">
                                {stage.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

            {/* AREA B: Submission Details table listing */}
            <div id="ojs-details-widget" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              
              <h3 className="text-sm font-extrabold text-[#004d2b] font-sans tracking-tight border-b pb-2.5 border-slate-100">
                Submission Details
              </h3>

              <div className="space-y-3 pt-1 text-xs">
                
                <div className="flex flex-col space-y-1 text-left">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">Submission ID</span>
                  <strong className="text-slate-800 font-extrabold font-mono text-[13px]">{paper.id || "990"}</strong>
                </div>

                <div className="flex flex-col space-y-1 text-left">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold font-mono">Submitted On</span>
                  <strong className="text-slate-800 font-extrabold font-mono text-xs">{paper.receivedAt || "2026-06-08"}</strong>
                </div>

                <div className="flex flex-col space-y-1 text-left">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold font-mono">Last Updated</span>
                  <strong className="text-slate-800 font-extrabold font-mono text-xs">{paper.receivedAt || "2026-06-08"}</strong>
                </div>

                <div className="flex flex-col space-y-1 text-left">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold font-mono">Submission Files</span>
                  <strong className="text-slate-800 font-extrabold font-mono text-xs">1 file</strong>
                </div>

              </div>

            </div>

          </aside>
          );
          })()}

        </div>

      </div>

      {/* File editing dialog modal */}
      {showFileEditModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border rounded-xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-left">
            <div className="flex items-center justify-between border-b pb-2">
              <strong className="text-slate-900 text-sm">Edit File Asset Name</strong>
              <button
                id="close-file-modal-x"
                onClick={() => setShowFileEditModal(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase font-bold text-slate-450 font-mono tracking-wide">Enter new file handle name *</label>
              <input
                id="edit-file-input"
                type="text"
                value={editingFileName}
                onChange={(e) => setEditingFileName(e.target.value)}
                className="w-full bg-[#fafbfc] border rounded p-2 text-xs focus:ring-1 focus:ring-sky-500 outline-none font-semibold text-slate-800"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                id="cancel-edit-name-btn"
                onClick={() => setShowFileEditModal(false)}
                className="px-3.5 py-1.5 border rounded-lg text-slate-700 bg-white hover:bg-slate-50 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                id="save-edit-name-btn"
                onClick={() => {
                  if (!editingFileName.trim()) {
                    alert("Filename is required.");
                    return;
                  }
                  setShowFileEditModal(false);
                }}
                className="px-4 py-1.5 bg-[#008751] hover:bg-[#007043] text-white rounded-lg font-bold text-xs shadow-xs cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
