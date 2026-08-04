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
  Filter,
  Inbox,
  Eye,
  RefreshCw,
  FileCheck,
  Send,
  Check,
  HelpCircle,
  Mail,
  X,
  Trash2
} from 'lucide-react';

import NewSubmissionFlow from './NewSubmissionFlow';
import OjsSubmissionDetail from './OjsSubmissionDetail';

interface AuthorWorkspaceProps {
  manuscripts: Manuscript[];
  onSaveManuscript: (manuscript: Manuscript) => void;
  onSubmitManuscript: (manuscriptId: string) => void;
  onDeleteManuscript?: (manuscriptId: string) => void;
  currentUser?: { name: string; email: string; role: Role } | null;
  onSignOut?: () => void;
  onRoleChange?: (role: Role) => void;
}

// Exact OJS initial papers matching user's screenshots
const DEFAULT_OJS_MANUSCRIPTS: any[] = [];

export default function AuthorWorkspace({
  manuscripts,
  onSaveManuscript,
  onSubmitManuscript,
  onDeleteManuscript,
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
    let loadedPapers: any[] = [];
    if (saved) {
      try {
        loadedPapers = JSON.parse(saved);
      } catch (e) {
        console.error("Local parse error", e);
      }
    }
    return loadedPapers;
  });

  // Track recently submitted IDs to avoid race-condition auto-deletion during parent state updates
  const recentlySubmittedIds = React.useRef<Set<string>>(new Set());

  // Keep papers state persistent
  useEffect(() => {
    localStorage.setItem('ojs_author_papers_state', JSON.stringify(papers));
  }, [papers]);

  // Synchronize with centralized parent manuscripts state for database-level live updates
  useEffect(() => {
    setPapers((prevPapers) => {
      // Create a map of existing papers in local state to preserve key custom OJS properties
      const paperMap = new Map<string, any>();

      // Map/synchronize centralized manuscripts into the OJS list
      manuscripts.forEach((m) => {
        const cleanId = m.id.replace('JMS-', '').replace('OJS-', '');
        
        // Find if this manuscript is already represented
        const existing = prevPapers.find(p => p.id === cleanId || p.id === m.id);

        let stage = 'Submission';
        if (m.status === 'DRAFT') {
          stage = 'Incomplete';
        } else if (m.status === 'SUBMITTED') {
          stage = 'Submission';
        } else if (m.status === 'REVISION_REQUESTED') {
          stage = 'Revisions Requested';
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

      // Keep recently submitted papers in state even if the parent state update hasn't propagated to manuscripts yet
      prevPapers.forEach((p) => {
        if (!paperMap.has(p.id) && (recentlySubmittedIds.current.has(p.id) || recentlySubmittedIds.current.has(`OJS-${p.id}`))) {
          paperMap.set(p.id, p);
        }
      });

      return Array.from(paperMap.values());
    });
  }, [manuscripts]);

  const authorName = currentUser?.name || "Dr. Ada Lovelace";
  const authorEmail = currentUser?.email || "ada@computing.org";

  // Counts tracking
  const countSubmitted = papers.filter(p => p.stage === 'Submission' && (!p.raw?.status || p.raw?.status === 'SUBMITTED')).length;
  const countUnderReview = papers.filter(p => p.raw?.status === 'UNDER_REVIEW' && p.stage !== 'Revisions Requested' && p.stage !== 'Revisions Submitted').length;
  const countRevisionRequired = papers.filter(p => p.stage === 'Revisions Requested').length;
  const countRevisionProcessing = papers.filter(p => p.stage === 'Revisions Submitted').length;
  const countAcceptedProduction = papers.filter(p => p.raw?.status === 'ACCEPTED' || p.stage === 'Scheduled').length;
  const countPublished = papers.filter(p => p.raw?.status === 'PUBLISHED' || p.stage === 'Published').length;
  const countRejected = papers.filter(p => p.raw?.status === 'REJECTED' || p.stage === 'Declined').length;

  const countActive = countSubmitted + countUnderReview;
  const countRevisionsReq = countRevisionRequired;
  const countRevisionsSub = countRevisionProcessing;
  const countIncomplete = papers.filter(p => p.stage === 'Incomplete').length;
  const countScheduled = countAcceptedProduction;
  const countDeclined = countRejected;

  // Handle new submission creation from the premium NewSubmissionFlow wizard
  const handleCreateSubmissionFromWizard = (paperObj: any) => {
    // Add to recently submitted IDs to avoid race-condition auto-deletion during parent state updates
    recentlySubmittedIds.current.add(paperObj.id);
    recentlySubmittedIds.current.add(`OJS-${paperObj.id}`);

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
      editorsNotes: "",
      assignedEditor: "Unassigned",
      assignedEditorEmail: null
    };

    onSaveManuscript(parentManuscript);
    onSubmitManuscript(`OJS-${paperObj.id}`);
  };

  const handleDeletePaper = (paperId: string) => {
    if (confirm("Do you want to delete?")) {
      setPapers((prev) => prev.filter((p) => p.id !== paperId));
      const saved = localStorage.getItem('ojs_author_papers_state');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const filtered = parsed.filter((p: any) => p.id !== paperId);
          localStorage.setItem('ojs_author_papers_state', JSON.stringify(filtered));
        } catch (e) {
          console.error(e);
        }
      }
      const parentMatch = manuscripts.find(m => {
        const cleanId = m.id.replace('JMS-', '').replace('OJS-', '');
        return cleanId === paperId || m.id === paperId;
      });
      if (onDeleteManuscript) {
        const targetId = parentMatch ? parentMatch.id : (paperId.startsWith('OJS-') || paperId.startsWith('JMS-') ? paperId : `OJS-${paperId}`);
        onDeleteManuscript(targetId);
      } else {
        alert("Submission deleted successfully from local cache.");
      }
    }
  };

  // Premium Interactive Queue tracking states
  const [selectedQueue, setSelectedQueue] = useState<string>('SUBMITTED');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Modal interaction states (Contact & Respond to Decision)
  const [isContactModalOpen, setIsContactModalOpen] = useState<boolean>(false);
  const [contactPaper, setContactPaper] = useState<any | null>(null);
  const [contactSubject, setContactSubject] = useState<string>('');
  const [contactMessage, setContactMessage] = useState<string>('');

  const [isRespondModalOpen, setIsRespondModalOpen] = useState<boolean>(false);
  const [respondPaper, setRespondPaper] = useState<any | null>(null);
  const [respondLetter, setRespondLetter] = useState<string>('');
  const [respondFileName, setRespondFileName] = useState<string>('reconciled_manuscript.docx');

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

  // Maps the 12 detailed stages to 5 compact milestones for space-efficient grid rendering in table row
  const getCompactMilestones = (detailedStages: WorkflowStageDetail[], isRejected: boolean) => {
    const milestones = [
      { name: 'Intake', stages: ['submitted', 'editor_assigned'] },
      { name: 'Evaluation', stages: ['reviewer_invited', 'under_review', 'reviews_received'] },
      { name: 'Revision', stages: ['decision_pending', 'revision_required', 'revised_submitted', 'final_review'] },
      { name: 'Production', stages: ['accepted', 'production'] },
      { name: 'Published', stages: ['published'] }
    ];

    return milestones.map(m => {
      const groupStages = detailedStages.filter(st => m.stages.includes(st.id));
      const hasActive = groupStages.some(st => st.status === 'active');
      const allCompleted = groupStages.length > 0 && groupStages.every(st => st.status === 'completed' || st.status === 'skipped');
      const allSkipped = groupStages.length > 0 && groupStages.every(st => st.status === 'skipped');

      let status: 'completed' | 'active' | 'upcoming' | 'skipped' | 'rejected' = 'upcoming';
      
      if (isRejected && m.name === 'Revision') {
        const rejectedStage = detailedStages.find(st => st.id === 'rejected');
        if (rejectedStage) {
          status = 'rejected';
        }
      } else if (hasActive) {
        status = 'active';
      } else if (allSkipped) {
        status = 'skipped';
      } else if (allCompleted) {
        status = 'completed';
      }

      return {
        name: m.name,
        status
      };
    });
  };

  // Switch tabs helper (synchronizes sidebar navigation tabs with interactive queues)
  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setIsCreatingSubmission(false);
    setSelectedPaper(null);
    if (tabId === 'ACTIVE_SUBMISSIONS') {
      setSelectedQueue('SUBMITTED');
    } else if (tabId === 'REVISIONS_REQUESTED') {
      setSelectedQueue('REVISION_REQUIRED');
    } else if (tabId === 'REVISIONS_SUBMITTED') {
      setSelectedQueue('REVISION_PROCESSING');
    } else if (tabId === 'SCHEDULED') {
      setSelectedQueue('ACCEPTED');
    } else if (tabId === 'PUBLISHED') {
      setSelectedQueue('PUBLISHED');
    } else if (tabId === 'DECLINED') {
      setSelectedQueue('REJECTED');
    } else if (tabId === 'INCOMPLETE_SUBMISSIONS') {
      setSelectedQueue('INCOMPLETE');
    }
  };

  // Clickable queue card selection helper (synchronizes interactive queues with sidebar tabs)
  const handleSelectQueue = (queueId: string) => {
    setSelectedQueue(queueId);
    setIsCreatingSubmission(false);
    setSelectedPaper(null);
    if (queueId === 'SUBMITTED') {
      setActiveTab('ACTIVE_SUBMISSIONS');
    } else if (queueId === 'UNDER_REVIEW') {
      setActiveTab('ACTIVE_SUBMISSIONS');
    } else if (queueId === 'REVISION_REQUIRED') {
      setActiveTab('REVISIONS_REQUESTED');
    } else if (queueId === 'REVISION_PROCESSING') {
      setActiveTab('REVISIONS_SUBMITTED');
    } else if (queueId === 'ACCEPTED') {
      setActiveTab('SCHEDULED');
    } else if (queueId === 'PUBLISHED') {
      setActiveTab('PUBLISHED');
    } else if (queueId === 'REJECTED') {
      setActiveTab('DECLINED');
    } else if (queueId === 'INCOMPLETE') {
      setActiveTab('INCOMPLETE_SUBMISSIONS');
    }
  };

  // Contact Journal handler: adds an author discussion message in local & full-stack memory
  const handleAddDiscussionMessage = (paperId: string, subject: string, messageText: string) => {
    const paper = papers.find(p => p.id === paperId);
    if (!paper) return;

    const newMessageId = "msg-" + Math.random().toString(36).substr(2, 9);
    const newMsg = {
      id: newMessageId,
      sender: authorName,
      senderRole: 'Author',
      text: messageText,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      files: []
    };

    let updatedDiscussions = [...(paper.discussions || [])];
    const existingThread = updatedDiscussions.find(t => t.subject === subject);

    if (existingThread) {
      existingThread.messages = [...existingThread.messages, newMsg];
    } else {
      updatedDiscussions.push({
        id: "thread-" + Math.random().toString(36).substr(2, 9),
        subject: subject,
        initiator: authorName,
        participants: [authorName, "Kellye Milhorn (Editor)"],
        messages: [newMsg],
        createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        isClosed: false
      });
    }

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
        t.messages.map((msg: any) => ({
          id: msg.id,
          senderName: msg.sender,
          senderEmail: msg.sender === authorName ? authorEmail : 'editor@jms.org',
          senderRole: (msg.senderRole === 'Author' ? 'AUTHOR' : 'EDITOR') as any,
          text: msg.text,
          timestamp: msg.timestamp,
          fileName: msg.files?.[0]?.name || null,
          fileSize: msg.files?.[0]?.size || null
        }))
      );

      onSaveManuscript({
        ...matchManuscript,
        discussions: mappedMsgs
      });
    }
  };

  // Respond to Editorial Decision handler: transitions paper to revision processing
  const handleRespondToDecision = (paperId: string, letter: string, fileName: string) => {
    const paper = papers.find(p => p.id === paperId);
    if (!paper) return;

    const newMessageId = "msg-" + Math.random().toString(36).substr(2, 9);
    const newMsg = {
      id: newMessageId,
      sender: authorName,
      senderRole: 'Author',
      text: `RECONCILIATION STATEMENT / AUTHOR RESPONSE:\n\n${letter}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      files: fileName ? [{ name: fileName, size: "1.8 MB" }] : []
    };

    let updatedDiscussions = [...(paper.discussions || [])];
    updatedDiscussions.push({
      id: "thread-" + Math.random().toString(36).substr(2, 9),
      subject: "Author Revision Submitted",
      initiator: authorName,
      participants: [authorName, "Kellye Milhorn (Editor)"],
      messages: [newMsg],
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      isClosed: false
    });

    const updatedPapers = papers.map(p =>
      p.id === paperId ? { 
        ...p, 
        stage: 'Revisions Submitted',
        fileName: fileName || p.fileName,
        discussions: updatedDiscussions 
      } : p
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
        t.messages.map((msg: any) => ({
          id: msg.id,
          senderName: msg.sender,
          senderEmail: msg.sender === authorName ? authorEmail : 'editor@jms.org',
          senderRole: (msg.senderRole === 'Author' ? 'AUTHOR' : 'EDITOR') as any,
          text: msg.text,
          timestamp: msg.timestamp,
          fileName: msg.files?.[0]?.name || null,
          fileSize: msg.files?.[0]?.size || null
        }))
      );

      let updatedNotes = matchManuscript.editorsNotes || '';
      if (!updatedNotes.includes('[revision uploaded]')) {
        updatedNotes = updatedNotes ? `${updatedNotes}\n[revision uploaded]` : '[revision uploaded]';
      }

      let updatedRevisions = matchManuscript.revisions ? [...matchManuscript.revisions] : [];
      const newFileObj = {
        id: `file_${Date.now()}`,
        name: fileName || 'revised_manuscript.docx',
        type: 'Author Revision Document',
        size: '1.8 MB',
        date: new Date().toISOString().split('T')[0]
      };

      if (updatedRevisions.length > 0) {
        const lastIdx = updatedRevisions.length - 1;
        const lastRev = updatedRevisions[lastIdx];
        updatedRevisions[lastIdx] = {
          ...lastRev,
          status: 'REVISION_SUBMITTED',
          uploadedFiles: [...(lastRev.uploadedFiles || []), newFileObj]
        };
      } else {
        updatedRevisions.push({
          id: `rev_${Date.now()}`,
          revisionNumber: 1,
          requestedBy: "Editor",
          requestedAt: new Date().toISOString(),
          decisionLetter: matchManuscript.editorsNotes || "Revisions requested.",
          status: 'REVISION_SUBMITTED',
          uploadedFiles: [newFileObj]
        });
      }

      onSaveManuscript({
        ...matchManuscript,
        status: 'UNDER_REVIEW',
        revisions: updatedRevisions,
        uploadedFiles: [...(matchManuscript.uploadedFiles || []), newFileObj],
        discussions: mappedMsgs,
        fileName: fileName || matchManuscript.fileName,
        editorsNotes: updatedNotes
      });
    }
  };

  // Filters papers depending on selected queue card
  const getFilteredPapers = () => {
    let matchesQueue = (p: any) => {
      const status = p.raw?.status;
      switch (selectedQueue) {
        case 'SUBMITTED':
          return p.stage === 'Submission' && (!status || status === 'SUBMITTED');
        case 'UNDER_REVIEW':
          return status === 'UNDER_REVIEW' && p.stage !== 'Revisions Requested' && p.stage !== 'Revisions Submitted';
        case 'REVISION_REQUIRED':
          return p.stage === 'Revisions Requested';
        case 'REVISION_PROCESSING':
          return p.stage === 'Revisions Submitted';
        case 'ACCEPTED':
          return status === 'ACCEPTED' || p.stage === 'Scheduled';
        case 'PUBLISHED':
          return status === 'PUBLISHED' || p.stage === 'Published';
        case 'REJECTED':
          return status === 'REJECTED' || p.stage === 'Declined';
        case 'INCOMPLETE':
          return p.stage === 'Incomplete' || status === 'DRAFT';
        default:
          return true;
      }
    };

    return papers.filter(p => {
      if (!matchesQueue(p)) return false;
      
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
                  {papers.length > 0 ? (
                    papers.slice(0, 5).map((paper) => (
                      <div key={paper.id} className="px-4 py-2.5 hover:bg-slate-50 transition">
                        <p className="text-slate-700 font-normal leading-relaxed">
                          Submission <span className="font-semibold text-slate-900">#{paper.id}</span> is synced.
                        </p>
                        <span className="text-[9px] text-gray-400 block mt-1 font-mono">Stage: {paper.stage}</span>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-4 text-center text-gray-400">
                      No active task alerts.
                    </div>
                  )}
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
      <div className="flex-grow w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-stretch">
        
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
            <div className="w-full text-left font-sans space-y-6">
              
              {/* Premium Interactive Queue Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { id: 'SUBMITTED', label: 'Submitted', count: countSubmitted, color: 'emerald', icon: Inbox },
                  { id: 'UNDER_REVIEW', label: 'Under Review', count: countUnderReview, color: 'blue', icon: Eye },
                  { id: 'REVISION_REQUIRED', label: 'Revision Required', count: countRevisionRequired, color: 'amber', icon: AlertCircle },
                  { id: 'REVISION_PROCESSING', label: 'Revision Processing', count: countRevisionProcessing, color: 'indigo', icon: RefreshCw },
                  { id: 'ACCEPTED', label: 'Accepted/Production', count: countAcceptedProduction, color: 'teal', icon: FileCheck },
                  { id: 'PUBLISHED', label: 'Published', count: countPublished, color: 'sky', icon: CheckCircle2 },
                  { id: 'REJECTED', label: 'Rejected', count: countRejected, color: 'rose', icon: XCircle }
                ].map((q) => {
                  const IconComponent = q.icon;
                  const isSelected = selectedQueue === q.id;
                  
                  // Color styling mapping
                  let borderClass = 'border-slate-200 hover:border-slate-300';
                  let bgClass = 'bg-white';
                  let textClass = 'text-slate-800';
                  let countBadgeClass = 'bg-slate-100 text-slate-700';
                  
                  if (isSelected) {
                    if (q.color === 'emerald') { borderClass = 'border-[#008751]'; bgClass = 'bg-emerald-50/40'; textClass = 'text-[#008751] font-bold'; countBadgeClass = 'bg-[#008751] text-white'; }
                    else if (q.color === 'blue') { borderClass = 'border-blue-500'; bgClass = 'bg-blue-50/40'; textClass = 'text-blue-700 font-bold'; countBadgeClass = 'bg-blue-500 text-white'; }
                    else if (q.color === 'amber') { borderClass = 'border-amber-500'; bgClass = 'bg-amber-50/40'; textClass = 'text-amber-700 font-bold'; countBadgeClass = 'bg-amber-500 text-white'; }
                    else if (q.color === 'indigo') { borderClass = 'border-indigo-500'; bgClass = 'bg-indigo-50/40'; textClass = 'text-indigo-700 font-bold'; countBadgeClass = 'bg-indigo-500 text-white'; }
                    else if (q.color === 'teal') { borderClass = 'border-teal-500'; bgClass = 'bg-teal-50/40'; textClass = 'text-teal-700 font-bold'; countBadgeClass = 'bg-teal-500 text-white'; }
                    else if (q.color === 'sky') { borderClass = 'border-sky-500'; bgClass = 'bg-sky-50/40'; textClass = 'text-sky-700 font-bold'; countBadgeClass = 'bg-sky-500 text-white'; }
                    else if (q.color === 'rose') { borderClass = 'border-rose-500'; bgClass = 'bg-rose-50/40'; textClass = 'text-rose-700 font-bold'; countBadgeClass = 'bg-rose-500 text-white'; }
                  }
                  
                  return (
                    <button
                      key={q.id}
                      onClick={() => handleSelectQueue(q.id)}
                      className={`flex flex-col items-start p-3 rounded-2xl border text-left cursor-pointer transition duration-150 relative overflow-hidden group shadow-xs ${borderClass} ${bgClass}`}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <span className={`p-1.5 rounded-lg ${isSelected ? 'bg-white shadow-tiny border border-slate-100' : 'bg-slate-50'}`}>
                          <IconComponent className={`w-4 h-4 ${isSelected ? textClass : 'text-slate-450'}`} />
                        </span>
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${countBadgeClass}`}>
                          {q.count}
                        </span>
                      </div>
                      <span className={`text-[11px] font-bold leading-tight tracking-tight uppercase ${isSelected ? textClass : 'text-slate-500'}`}>
                        {q.label}
                      </span>
                    </button>
                  );
                })}
              </div>

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
                  <span className="text-emerald-800/80 text-sm pl-2 font-mono font-bold">
                    /queue/{selectedQueue.toLowerCase()}
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
                      placeholder="Search papers, authors..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full sm:w-64 bg-white border border-[#cfdde5] rounded pl-9 pr-3 py-1.5 text-sm focus:ring-1 focus:ring-[#008751] focus:border-[#008751] focus:outline-none placeholder:text-gray-400 text-slate-850 font-semibold text-slate-800"
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
                      <th className="px-4 py-3 w-40 font-mono">Manuscript ID</th>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3 w-36">Date Submitted</th>
                      <th className="px-4 py-3 w-44">Current Status</th>
                      <th className="px-4 py-3 w-72">Progress Timeline</th>
                      <th className="px-4 py-3 w-48 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#efefef] text-sm">
                    {filteredList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center text-slate-400 italic font-medium bg-slate-50/10">
                          No manuscripts found in the selected queue matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredList.map((paper) => {
                        const isExpanded = expandedRowId === paper.id;
                        return (
                          <React.Fragment key={paper.id}>
                            <tr className={`hover:bg-slate-50/50 transition duration-100 ${isExpanded ? 'bg-slate-50/30' : ''}`}>
                              
                              {/* Manuscript ID */}
                              <td className="px-4 py-4 text-slate-500 font-mono font-semibold text-xs whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setExpandedRowId(isExpanded ? null : paper.id)}
                                    className="p-1 text-slate-400 hover:text-[#008751] hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                    title={isExpanded ? "Hide detailed tracking roadmap" : "Expand Amazon-style tracking roadmap"}
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#008751]" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                  <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded shadow-tiny">
                                    {paper.id.startsWith('OJS-') || paper.id.startsWith('JMS-') ? paper.id : `OJS-${paper.id}`}
                                  </span>
                                </div>
                              </td>

                              {/* Title */}
                              <td className="px-4 py-4">
                                <div className="flex flex-col gap-0.5 text-left">
                                  <span className="font-bold text-[#002b3d] hover:text-[#008751] transition cursor-pointer text-sm leading-snug" onClick={() => setSelectedPaper(paper)}>
                                    {paper.title}
                                  </span>
                                  <span className="text-xs text-slate-500 font-medium">
                                    By <strong className="text-slate-700 font-bold">{paper.author}</strong> • Section: {paper.section || 'Articles'} • Doc: {paper.fileName}
                                  </span>
                                </div>
                              </td>

                              {/* Date Submitted */}
                              <td className="px-4 py-4 text-xs font-mono font-semibold text-slate-500 whitespace-nowrap">
                                {paper.receivedAt}
                              </td>

                              {/* Current Status */}
                              <td className="px-4 py-4 whitespace-nowrap">
                                {(() => {
                                  const rawStatus = paper.raw?.status || 'SUBMITTED';
                                  const isRejected = rawStatus === 'REJECTED';
                                  let label = paper.stage;
                                  let badgeClass = 'bg-emerald-50 text-[#008751] border-emerald-100';
                                  if (rawStatus === 'REVISION_REQUESTED' || paper.stage === 'Revisions Requested') {
                                    label = 'Revision Requested';
                                    badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                                  } else if (rawStatus === 'UNDER_REVIEW') {
                                    if (paper.stage === 'Revisions Requested') {
                                      label = 'Revision Required';
                                      badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
                                    } else if (paper.stage === 'Revisions Submitted') {
                                      label = 'Revision Processing';
                                      badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-100';
                                    } else {
                                      label = 'Under Review';
                                      badgeClass = 'bg-blue-50 text-blue-700 border-blue-100';
                                    }
                                  } else if (rawStatus === 'AWAITING_DECISION') {
                                    label = 'Decision Pending';
                                    badgeClass = 'bg-purple-50 text-purple-700 border-purple-100';
                                  } else if (rawStatus === 'ACCEPTED') {
                                    label = 'Accepted / In Production';
                                    badgeClass = 'bg-teal-50 text-teal-700 border-teal-100';
                                  } else if (rawStatus === 'PUBLISHED') {
                                    label = 'Published';
                                    badgeClass = 'bg-emerald-50 text-[#008751] border-emerald-150';
                                  } else if (isRejected) {
                                    label = 'Rejected';
                                    badgeClass = 'bg-rose-50 text-rose-750 text-rose-700 border-rose-100';
                                  }
                                  
                                  return (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold border ${badgeClass}`}>
                                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                                      {label}
                                    </span>
                                  );
                                })()}
                              </td>

                              {/* Progress Timeline (Compact Milestones) */}
                              <td className="px-4 py-4">
                                {(() => {
                                  const detailed = getDetailedWorkflowState(paper);
                                  const isRejected = paper.raw?.status === 'REJECTED';
                                  const milestones = getCompactMilestones(detailed, isRejected);
                                  
                                  return (
                                    <div className="flex flex-col gap-1 w-64">
                                      {/* Progress Bar Line */}
                                      <div className="flex items-center justify-between relative px-1 mt-1">
                                        {/* Connecting line */}
                                        <div className="absolute left-2 right-2 top-2 h-0.5 bg-slate-100 -z-10 w-full max-w-[96%]"></div>
                                        {/* Active colored line segment */}
                                        <div 
                                          className="absolute left-2 top-2 h-0.5 bg-[#008751] -z-10 transition-all duration-300"
                                          style={{ 
                                            width: `${
                                              milestones.filter(m => m.status === 'completed').length === 5 ? '100%' :
                                              milestones.filter(m => m.status === 'completed').length === 4 ? '75%' :
                                              milestones.filter(m => m.status === 'completed').length === 3 ? '50%' :
                                              milestones.filter(m => m.status === 'completed').length === 2 ? '25%' : '0%'
                                            }`
                                          }}
                                        ></div>
                                        
                                        {milestones.map((mil) => {
                                          let dotClass = 'bg-slate-200 border-slate-300 text-slate-400';
                                          if (mil.status === 'completed') dotClass = 'bg-[#008751] border-[#008751] text-white';
                                          else if (mil.status === 'active') dotClass = 'bg-white border-blue-500 ring-4 ring-blue-50 text-blue-500 animate-pulse';
                                          else if (mil.status === 'rejected') dotClass = 'bg-rose-500 border-rose-500 text-white';
                                          else if (mil.status === 'skipped') dotClass = 'bg-slate-150 border-dashed border-slate-300 text-slate-300';
                                          
                                          return (
                                            <div key={mil.name} className="flex flex-col items-center relative group/mil">
                                              <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center text-[9px] font-bold z-10 shadow-tiny ${dotClass}`}>
                                                {mil.status === 'completed' && <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />}
                                                {mil.status === 'rejected' && <X className="w-2.5 h-2.5 text-white" />}
                                                {mil.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                                              </div>
                                              <span className="text-[8px] font-bold tracking-wider uppercase text-slate-400 mt-1 font-mono group-hover/mil:text-slate-600 transition">
                                                {mil.name}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-4 text-center whitespace-nowrap font-bold text-xs">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => setSelectedPaper(paper)}
                                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md shadow-tiny transition flex items-center gap-1 cursor-pointer font-bold"
                                    title="View Details"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    View
                                  </button>
                                  <button
                                    onClick={() => {
                                      setContactPaper(paper);
                                      setContactSubject(`Inquiry regarding Manuscript: ${paper.title.slice(0, 30)}...`);
                                      setIsContactModalOpen(true);
                                    }}
                                    className="px-2 py-1 bg-white hover:bg-emerald-50 hover:text-[#008751] border border-slate-200 text-slate-700 rounded-md shadow-tiny transition flex items-center gap-1 cursor-pointer font-bold"
                                    title="Contact Journal"
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                    Contact
                                  </button>
                                  {paper.stage === 'Revisions Requested' ? (
                                    <button
                                      onClick={() => {
                                        setRespondPaper(paper);
                                        setRespondLetter('');
                                        setIsRespondModalOpen(true);
                                      }}
                                      className="px-2 py-1 bg-[#008751] hover:bg-[#007043] text-white rounded-md shadow-xs transition flex items-center gap-1 cursor-pointer font-bold animate-pulse"
                                      title="Respond to Decision"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                      Respond
                                    </button>
                                  ) : (
                                    <button
                                      disabled
                                      className="px-2 py-1 bg-slate-100 text-slate-450 border border-slate-200 text-slate-400 rounded-md cursor-not-allowed flex items-center gap-1 font-bold"
                                      title="No decision pending response"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                      Respond
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeletePaper(paper.id)}
                                    className="px-2 py-1 bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-slate-700 rounded-md shadow-tiny transition flex items-center gap-1 cursor-pointer font-bold"
                                    title="Delete Submission"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                    Delete
                                  </button>
                                </div>
                              </td>

                            </tr>

                            {/* EXPANSE AREA FOR AMAZON TIMELINE */}
                            {isExpanded && (
                              <tr key={`${paper.id}-expanded`}>
                                <td colSpan={6} className="bg-slate-50/50 px-6 py-4 border-b border-slate-200">
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 max-w-4xl mx-auto">
                                    <div className="border-b pb-2.5 flex items-center justify-between">
                                      <div className="flex flex-col text-left">
                                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 font-mono">
                                          Manuscript Progress Tracking Map
                                        </span>
                                        <h4 className="font-sans font-bold text-slate-850 text-sm">
                                          Amazon-Style Execution Milestones
                                        </h4>
                                      </div>
                                      <span className="text-[11px] font-mono bg-emerald-50 text-[#008751] px-2.5 py-1 rounded-full border border-emerald-100 font-bold flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#008751] animate-pulse"></span>
                                        Stage: {paper.stage}
                                      </span>
                                    </div>

                                    {/* Vertical Step Stepper (Classic Amazon style) */}
                                    <div className="relative pl-6 space-y-5 text-left">
                                      {/* Vertical Track line */}
                                      <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-slate-100"></div>

                                      {getDetailedWorkflowState(paper).map((st) => {
                                        const isCompleted = st.status === 'completed';
                                        const isActive = st.status === 'active';
                                        const isSkipped = st.status === 'skipped';
                                        const isUpcoming = st.status === 'upcoming';

                                        let indicatorBg = 'bg-slate-100 ring-slate-100 border-slate-300';
                                        let textTitleColor = 'text-slate-500 font-medium';
                                        let textDescColor = 'text-slate-400';

                                        if (isCompleted) {
                                          indicatorBg = 'bg-[#008751] border-[#008751] ring-4 ring-emerald-50 text-white';
                                          textTitleColor = 'text-[#002b3d] font-bold';
                                          textDescColor = 'text-slate-600 font-medium';
                                        } else if (isActive) {
                                          if (st.id === 'rejected') {
                                            indicatorBg = 'bg-rose-500 border-rose-500 ring-4 ring-rose-50 text-white';
                                            textTitleColor = 'text-rose-700 font-extrabold';
                                            textDescColor = 'text-rose-600 font-medium';
                                          } else {
                                            indicatorBg = 'bg-blue-500 border-blue-500 ring-4 ring-blue-50 text-white';
                                            textTitleColor = 'text-blue-700 font-extrabold';
                                            textDescColor = 'text-slate-700 font-semibold';
                                          }
                                        } else if (isSkipped) {
                                          indicatorBg = 'bg-slate-50 border-dashed border-slate-250';
                                          textTitleColor = 'text-slate-400 font-medium line-through decoration-slate-200';
                                          textDescColor = 'text-slate-300 italic';
                                        }

                                        return (
                                          <div key={st.id} className={`relative flex items-start gap-3 transition duration-150 ${isSkipped ? 'opacity-55' : ''}`}>
                                            {/* Bullet */}
                                            <div className={`absolute -left-[19px] w-4.5 h-4.5 rounded-full border flex items-center justify-center text-[10px] z-10 ${indicatorBg}`}>
                                              {isCompleted && <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />}
                                              {isActive && (st.id === 'rejected' ? <X className="w-2.5 h-2.5 text-white" /> : <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>)}
                                              {isSkipped && <span className="text-[8px] font-bold text-slate-400 font-mono">/</span>}
                                              {isUpcoming && <span className="w-1.5 h-1.5 rounded-full bg-slate-350 bg-slate-300"></span>}
                                            </div>

                                            <div className="flex flex-col text-left">
                                              <div className="flex items-center gap-2">
                                                <span className={`text-xs ${textTitleColor}`}>
                                                  {st.label}
                                                </span>
                                                {isActive && (
                                                  <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${st.id === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700 animate-pulse'}`}>
                                                    {st.id === 'rejected' ? 'Declined' : 'Active Stage'}
                                                  </span>
                                                )}
                                                {isCompleted && (
                                                  <span className="text-[8px] font-mono font-bold bg-emerald-100 text-[#008751] px-1.5 py-0.5 rounded-full uppercase">
                                                    Completed
                                                  </span>
                                                )}
                                                {isSkipped && (
                                                  <span className="text-[8px] font-mono font-semibold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full uppercase">
                                                    Not Applicable
                                                  </span>
                                                )}
                                              </div>
                                              <p className={`text-[11px] leading-normal ${textDescColor} mt-0.5`}>
                                                {st.description}
                                              </p>
                                              {st.dateCompleted && isCompleted && (
                                                <span className="text-[9px] font-mono text-slate-400 mt-0.5 font-semibold">
                                                  Date Completed: {st.dateCompleted}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {/* Grid list Table footer */}
                <div className="bg-[#f5f8fa] border-t border-[#cfdde5] px-4 py-3 text-xs text-slate-600 font-mono flex items-center justify-between">
                  <span>Showing <strong>{filteredList.length}</strong> to <strong>{filteredList.length}</strong> of <strong>{filteredList.length}</strong> manuscripts</span>
                  <span className="text-slate-400">Queue: {selectedQueue}</span>
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

      {/* ----------------- D. CONTACT JOURNAL MODAL ----------------- */}
      {isContactModalOpen && contactPaper && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-scale-up text-left">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-50 text-[#008751] rounded-lg border border-emerald-100">
                  <Mail className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-sans font-bold text-slate-900 text-sm">
                    Contact Journal Office
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Manuscript ID: {contactPaper.id}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsContactModalOpen(false)}
                className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs">
                <label className="block text-slate-500 font-semibold mb-1">
                  Subject Thread
                </label>
                <input
                  type="text"
                  value={contactSubject}
                  onChange={(e) => setContactSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-[#008751] focus:outline-none font-semibold text-slate-800"
                  placeholder="Subject of message thread"
                />
              </div>

              <div className="text-xs">
                <label className="block text-slate-500 font-semibold mb-1">
                  Message Body
                </label>
                <textarea
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  rows={5}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-[#008751] focus:outline-none text-slate-800 leading-relaxed"
                  placeholder="Write your query to the journal managing editor here..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t pt-3">
              <button
                onClick={() => setIsContactModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!contactMessage.trim()) {
                    alert("Please write a message before sending.");
                    return;
                  }
                  handleAddDiscussionMessage(contactPaper.id, contactSubject, contactMessage);
                  setIsContactModalOpen(false);
                  setContactMessage('');
                  alert(`Message successfully dispatched under thread: "${contactSubject}"`);
                }}
                className="px-4.5 py-2 bg-[#008751] hover:bg-[#007043] text-white rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                Dispatch Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- E. RESPOND TO DECISION MODAL ----------------- */}
      {isRespondModalOpen && respondPaper && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-4 animate-scale-up text-left">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">
                  <RefreshCw className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-sans font-bold text-slate-900 text-sm">
                    Respond to Editorial Decision
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Manuscript: {respondPaper.title.slice(0, 50)}...
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsRespondModalOpen(false)}
                className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed space-y-1.5">
              <strong className="block text-amber-850 font-bold uppercase tracking-wide text-[10px]">
                Editorial Assessment Notes:
              </strong>
              <p className="font-medium text-amber-800">
                {respondPaper.raw?.editorsNotes || "Revisions requested. Please upload your revised manuscript files and provide a point-by-point reconciliation statement explaining the modifications made according to referee feedback."}
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-xs">
                <label className="block text-slate-500 font-semibold mb-1">
                  Point-by-Point Reconciliation Letter
                </label>
                <textarea
                  value={respondLetter}
                  onChange={(e) => setRespondLetter(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-[#008751] focus:outline-none text-slate-800 leading-relaxed font-mono"
                  placeholder="Dear Editor, in response to reviewer comments, we have addressed all issues as follows..."
                />
              </div>

              <div className="text-xs">
                <label className="block text-slate-500 font-semibold mb-1">
                  Upload Revised Manuscript Document
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={respondFileName}
                    onChange={(e) => setRespondFileName(e.target.value)}
                    className="flex-grow bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-[#008751] focus:outline-none font-semibold text-slate-800"
                    placeholder="reconciled_manuscript.docx"
                  />
                  <button 
                    onClick={() => {
                      const name = prompt("Enter revised manuscript filename:", respondFileName);
                      if (name) setRespondFileName(name);
                    }}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Select File
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t pt-3">
              <button
                onClick={() => setIsRespondModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!respondLetter.trim()) {
                    alert("Please write a point-by-point reconciliation letter before submitting.");
                    return;
                  }
                  handleRespondToDecision(respondPaper.id, respondLetter, respondFileName);
                  setIsRespondModalOpen(false);
                  setRespondLetter('');
                  alert(`Success! Revision files and reconciliation letter successfully logged. Status updated to 'Revision Processing'.`);
                }}
                className="px-4.5 py-2 bg-[#008751] hover:bg-[#007043] text-white rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                Transmit Revision
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
