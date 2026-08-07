import React, { useState, useEffect, useRef } from 'react';
import FilePreviewModal from './FilePreviewModal';
import {
  uploadManuscriptFile,
  syncManuscriptFilesToSupabase,
  syncManuscriptDiscussionsToSupabase,
  subscribeToManuscriptsRealtime,
  supabase
} from '../lib/supabase';
import {
  fetchAuthorManuscriptDetails,
  subscribeToManuscriptDetails,
  formatDateTime,
  formatDate,
  AuthorManuscriptDetails,
  ManuscriptFileRow,
  ProfileData
} from '../lib/authorManuscriptDetails';
import {
  getEditorAssignments,
  getReviewerAssignments,
  getStatusHistory,
  postDiscussionMessage
} from '../lib/workflow';
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
  Mail,
  Bell,
  Calendar,
  User,
  Info,
  Pin,
  Lock,
  Filter
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
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Real-time data from Supabase
  const [manuscriptDetails, setManuscriptDetails] = useState<AuthorManuscriptDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  // File Preview States
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewFileType, setPreviewFileType] = useState<string>("");
  const [previewFileSize, setPreviewFileSize] = useState<string>("");

  // Real discussion messages from Supabase
  const [allMessages, setAllMessages] = useState<any[]>([]);
  const [whatsappMessages, setWhatsappMessages] = useState<any[]>([]);
  const [whatsappInput, setWhatsappInput] = useState("");

  // Discussion forum list and filter states
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeDiscussionTab, setActiveDiscussionTab] = useState<'ALL' | 'OFFICIAL' | 'DIRECT'>('ALL');
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Thread-specific messages (filtered from allMessages based on thread type)
  const [techCheckMessages, setTechCheckMessages] = useState<any[]>([]);
  const [techCheckInput, setTechCheckInput] = useState("");

  const [formattingMessages, setFormattingMessages] = useState<any[]>([]);
  const [formattingInput, setFormattingInput] = useState("");

  // User profiles map for quick lookup
  const [userProfiles, setUserProfiles] = useState<Map<string, ProfileData>>(new Map());

  const handleSendWhatsappMessage = async () => {
    if (!whatsappInput.trim() || !paper?.id || !currentUser?.email) return;

    try {
      // Get current user's ID from Supabase (for sender_id)
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user || userError) {
        console.error('Could not get current user');
        return;
      }

      // Post message to Supabase
      await postDiscussionMessage(paper.id, user.id, whatsappInput.trim());

      // Clear input - the real-time subscription will update the messages
      setWhatsappInput("");
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleSendTechCheckMessage = async () => {
    if (!techCheckInput.trim() || !paper?.id || !currentUser?.email) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user || userError) {
        console.error('Could not get current user');
        return;
      }

      await postDiscussionMessage(paper.id, user.id, `[Technical Check] ${techCheckInput.trim()}`);
      setTechCheckInput("");
    } catch (error) {
      console.error('Error sending technical check message:', error);
    }
  };

  const handleSendFormattingMessage = async () => {
    if (!formattingInput.trim() || !paper?.id || !currentUser?.email) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user || userError) {
        console.error('Could not get current user');
        return;
      }

      await postDiscussionMessage(paper.id, user.id, `[Formatting & Style] ${formattingInput.trim()}`);
      setFormattingInput("");
    } catch (error) {
      console.error('Error sending formatting message:', error);
    }
  };

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
    if (paper?.discussions && Array.isArray(paper.discussions) && paper.discussions.length > 0) {
      return paper.discussions;
    }
    const key = `ojs_discussions_paper_${paper.id}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return []; // Empty list per typical default empty state
  });

  // Fetch real manuscript details from Supabase on mount or when paper ID changes
  useEffect(() => {
    if (!paper?.id) return;

    let isMounted = true;
    const loadDetails = async () => {
      try {
        setLoadingDetails(true);
        setDetailsError('');
        const details = await fetchAuthorManuscriptDetails(paper.id);
        if (isMounted) {
          setManuscriptDetails(details);
          setUserProfiles(details.profiles);

          // Update uploaded files with real data
          const formattedFiles = details.files.map((f: ManuscriptFileRow) => ({
            id: f.id,
            name: f.file_name,
            type: f.file_type,
            size: f.file_size,
            date: formatDate(f.uploaded_at),
            uploadedAt: f.uploaded_at,
            uploadedBy: f.uploaded_by,
            storagePath: f.storage_path,
            publicUrl: f.public_url
          }));
          setUploadedFiles(formattedFiles);

          // Convert discussions to message format
          const messageList = details.discussions.map((d) => ({
            id: d.id,
            sender: details.profiles.get(d.sender_id)?.name || 'Unknown',
            senderEmail: details.profiles.get(d.sender_id)?.email || '',
            senderRole: details.profiles.get(d.sender_id)?.role || 'User',
            avatar: (details.profiles.get(d.sender_id)?.name || 'U').substring(0, 2).toUpperCase(),
            avatarBg: 'bg-slate-500',
            text: d.message,
            timestamp: formatDateTime(d.created_at),
            isMe: currentUser?.email === details.profiles.get(d.sender_id)?.email,
            fileName: d.file_name,
            fileSize: d.file_size
          }));
          setAllMessages(messageList);
          setWhatsappMessages(messageList);
        }
      } catch (error: any) {
        if (isMounted) {
          setDetailsError(error.message || 'Failed to load manuscript details');
          console.error('Error loading manuscript details:', error);
        }
      } finally {
        if (isMounted) {
          setLoadingDetails(false);
        }
      }
    };

    loadDetails();

    // Subscribe to real-time updates
    const unsubscribe = subscribeToManuscriptDetails(paper.id, (updates) => {
      if (!isMounted) return;

      if (updates.manuscript) {
        setManuscriptDetails((prev) => prev ? { ...prev, manuscript: updates.manuscript } : null);
      }
      if (updates.discussions) {
        const messageList = updates.discussions.map((d) => ({
          id: d.id,
          sender: userProfiles.get(d.sender_id)?.name || 'Unknown',
          senderEmail: userProfiles.get(d.sender_id)?.email || '',
          senderRole: userProfiles.get(d.sender_id)?.role || 'User',
          avatar: (userProfiles.get(d.sender_id)?.name || 'U').substring(0, 2).toUpperCase(),
          avatarBg: 'bg-slate-500',
          text: d.message,
          timestamp: formatDateTime(d.created_at),
          isMe: currentUser?.email === userProfiles.get(d.sender_id)?.email,
          fileName: d.file_name,
          fileSize: d.file_size
        }));
        setAllMessages(messageList);
        setWhatsappMessages(messageList);
      }
      if (updates.files) {
        const formattedFiles = updates.files.map((f: ManuscriptFileRow) => ({
          id: f.id,
          name: f.file_name,
          type: f.file_type,
          size: f.file_size,
          date: formatDate(f.uploaded_at),
          uploadedAt: f.uploaded_at,
          uploadedBy: f.uploaded_by,
          storagePath: f.storage_path,
          publicUrl: f.public_url
        }));
        setUploadedFiles(formattedFiles);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [paper?.id, currentUser?.email]);

  // Keep uploaded files in sync with the latest selected paper
  useEffect(() => {
    if (Array.isArray(paper?.uploadedFiles) && paper.uploadedFiles.length > 0 && uploadedFiles.length === 0) {
      setUploadedFiles(paper.uploadedFiles);
    }
  }, [paper?.uploadedFiles]);

  // Keep discussions in sync with the latest selected paper
  useEffect(() => {
    if (Array.isArray(paper?.discussions) && paper.discussions.length > 0) {
      setDiscussionThreads(paper.discussions);
    }
  }, [paper?.discussions]);

  // Real-time synchronization of uploaded files to Supabase
  useEffect(() => {
    if (paper?.id) {
      syncManuscriptFilesToSupabase(paper.id, uploadedFiles);
    }
  }, [uploadedFiles, paper?.id]);

  // Real-time synchronization of discussion threads to Supabase
  useEffect(() => {
    const key = `ojs_discussions_paper_${paper.id}`;
    localStorage.setItem(key, JSON.stringify(discussionThreads));
    if (paper?.id) {
      syncManuscriptDiscussionsToSupabase(paper.id, discussionThreads);
    }
    if (onUpdatePaperDiscussions) {
      onUpdatePaperDiscussions(paper.id, discussionThreads);
    }
  }, [discussionThreads, paper.id]);

  // Realtime subscription for live database synchronization
  useEffect(() => {
    const unsubscribe = subscribeToManuscriptsRealtime((updatedMs) => {
      if (updatedMs.id === paper?.id || updatedMs.id === `OJS-${paper?.id}` || updatedMs.id.replace('OJS-', '') === paper?.id) {
        if (updatedMs.uploadedFiles && Array.isArray(updatedMs.uploadedFiles) && updatedMs.uploadedFiles.length > 0) {
          setUploadedFiles(updatedMs.uploadedFiles);
        }
        if (updatedMs.discussions && Array.isArray(updatedMs.discussions) && updatedMs.discussions.length > 0) {
          setDiscussionThreads(updatedMs.discussions);
        }
      }
    });
    return () => {
      unsubscribe();
    };
  }, [paper?.id]);

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

  // Real file upload handler connected to Supabase
  const handleRealFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsUploading(true);
    try {
      let fileType = "Supplementary File";
      if (file.name.endsWith('.pdf') || file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        fileType = "Manuscript";
      } else if (file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') || file.name.endsWith('.svg')) {
        fileType = "Figures";
      }

      const formattedSize = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

      let uploadResult = null;
      try {
        uploadResult = await uploadManuscriptFile(file, paper.id || 'manuscript-general');
      } catch (err) {
        console.warn("[Supabase Storage] Storage upload warning, preserving record in Supabase database:", err);
      }

      const newFileObj = {
        id: 'file-' + Date.now(),
        name: file.name,
        type: fileType,
        size: formattedSize,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        url: uploadResult?.publicUrl || null,
        storagePath: uploadResult?.path || null
      };

      const updatedList = [newFileObj, ...uploadedFiles];
      setUploadedFiles(updatedList);
      await syncManuscriptFilesToSupabase(paper.id, updatedList);
    } catch (err: any) {
      console.error("Error uploading file:", err);
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  // Simulation upload file helper
  const handleSimulateUpload = (forReply = false, forMainList = false) => {
    const mockFiles = [
      { name: "supplementary_charts_v2.pdf", size: "1.4 MB", type: "Supplementary File" },
      { name: "response_to_reviewers.docx", size: "625 KB", type: "Manuscript" },
      { name: "experimental_dataset.xlsx", size: "3.1 MB", type: "Supplementary File" },
      { name: "high_res_methodology_flow.png", size: "900 KB", type: "Figures" }
    ];
    const picked = mockFiles[Math.floor(Math.random() * mockFiles.length)];
    const filename = `${Date.now().toString().slice(-4)}_${picked.name}`;

    if (forReply) {
      setThreadReplyAttached([...threadReplyAttached, { name: filename, size: picked.size }]);
    } else if (forMainList) {
      const newFile = {
        name: filename,
        type: picked.type,
        size: picked.size,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      };
      setUploadedFiles(prev => [...prev, newFile]);
      alert(`Successfully uploaded "${filename}" into active files database.`);
    } else {
      setAttachedFiles([...attachedFiles, { name: filename, size: picked.size }]);
    }
  };

  const isSubmissionDashboard = activeTab === 'SUBMISSION' && viewState === 'DASHBOARD';

  return (
    <div id="ojs-submission-detail-container" className="w-full bg-[#e8f3ed] min-h-screen text-slate-950 flex flex-col md:flex-row items-stretch border-t border-slate-200">
      
      {/* ======= COLUMN 1: LEFT WORKFLOW & PUBLICATION SIDEBAR ======= */}
      <aside id="ojs-left-sidebar-navigation" className="w-full md:w-64 bg-white border-r border-[#d1e7dd] flex flex-col shrink-0 p-5 space-y-7 text-left font-sans">
        
        {/* Section A: Workflow headings and items */}
        <div className="space-y-3">
          <span className="block text-[11px] font-semibold uppercase tracking-widest text-[#004d2e] font-mono">
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
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-[15px] font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-emerald-100/75 text-[#005a36] border-l-[4px] border-[#008751] shadow-3xs'
                      : 'text-slate-900 hover:bg-emerald-50/50 hover:text-emerald-950'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComp className={`w-4 h-4 ${isActive ? 'text-[#008751]' : 'text-slate-700'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== null && (
                    <span className={`text-[11px] font-semibold font-mono px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-[#008751] text-white' : 'bg-slate-200 text-slate-900'
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
            <span className="block text-[11px] font-semibold uppercase tracking-widest text-[#004d2e] font-mono">
              Publication
            </span>
            <ChevronUp className="w-3.5 h-3.5 text-[#004d2e] font-bold" />
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
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-[15px] font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-emerald-100/75 text-[#005a36] border-l-[4px] border-[#008751] shadow-3xs'
                      : 'text-slate-900 hover:bg-emerald-50/50 hover:text-emerald-950'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`w-4 h-4 ${isActive ? 'text-[#008751]' : 'text-slate-700'}`} />
                    <span>{item.label}</span>
                  </div>
                  
                  {/* Circular check mark badge inside a green ring or indicator */}
                  <div className="w-4 h-4 rounded-full bg-[#008751] text-white flex items-center justify-center shadow-3xs">
                    <Check className="w-2.5 h-2.5 stroke-[4.5]" />
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
        
        {isSubmissionDashboard ? (
          /* ======================= PREMIUM IMAGE-MATCHING DASHBOARD ======================= */
          <div className="space-y-6 w-full animate-in fade-in duration-200">
            {/* Top Header Row with dynamic/stat values matching screenshot */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-emerald-200 gap-4">
              <div className="text-left">
                <h1 className="text-[24px] font-semibold text-black tracking-tight leading-none">Submission</h1>
                <p className="text-[14px] text-[#005e38] mt-1.5 font-medium">Track and manage your manuscript submission.</p>
              </div>
              <div className="flex items-center gap-3">
                {/* + New Submission Button */}
                <button
                  onClick={() => alert("Simulating launching a new academic manuscript submission workflow in TULITICS Author Workspace.")}
                  className="bg-[#008751] hover:bg-[#007043] text-white text-[14px] font-bold px-5 py-2.5 rounded-full flex items-center gap-1.5 transition duration-150 shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4 text-white font-bold stroke-[3]" />
                  <span>New Submission</span>
                </button>
                {/* Notification Bell */}
                <div className="relative p-2.5 bg-white border border-emerald-200 hover:bg-emerald-50 rounded-full transition cursor-pointer shadow-2xs">
                  <div className="absolute right-1 top-1 w-2 h-2 bg-red-600 rounded-full border border-white" />
                  <Bell className="w-4 h-4 text-slate-900 stroke-[2.5]" />
                </div>
                {/* Profile Avatar Block */}
                <div className="flex items-center gap-2 cursor-pointer hover:opacity-90 select-none pl-2 border-l border-emerald-200">
                  <div className="w-9 h-9 rounded-full bg-[#008751] text-white font-bold text-xs flex items-center justify-center font-mono shadow-xs border border-white">
                    AG
                  </div>
                  <span className="text-[14px] font-semibold text-black font-sans hidden sm:inline">Akshaya G</span>
                  <ChevronDown className="w-4 h-4 text-slate-900 stroke-[2.5]" />
                </div>
              </div>
            </div>

            {/* TWO-COLUMN STACK (Center Column + Right Details Sidebar) */}
            <div className="w-full flex flex-col lg:flex-row items-start gap-6">

              {/* CENTER CORE COLUMN (COLUMN 2) */}
              <div id="ojs-column-center-main" className="flex-grow space-y-6 w-full lg:max-w-[70%]">
                
                {/* Manuscript Detail Banner */}
                <div className="bg-gradient-to-br from-[#022c22] via-[#047857] to-[#065f46] border border-[#047857]/40 rounded-2xl p-6 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-md text-white">
                  {/* Decorative background radial glow */}
                  <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
                  
                  <div className="space-y-2 text-left relative z-10 flex-grow">
                    <span className="text-emerald-200 text-[13px] font-medium uppercase tracking-widest block font-mono">
                      Manuscript ID: #{paper.id || "N/A"}
                    </span>
                    <h2 className="text-white text-[24px] font-semibold font-sans tracking-tight leading-snug drop-shadow-xs">
                      {paper.title || "Artificial Intelligence in Healthcare: Opportunities and Challenges"}
                    </h2>
                    
                    {/* Metadata line */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3 text-[13px] text-emerald-100 font-medium">
                      <div className="flex items-center gap-2 bg-black/15 px-3 py-1.5 rounded-lg border border-white/5">
                        <Calendar className="w-4 h-4 text-emerald-300 shrink-0" />
                        <span>Submitted On <strong className="text-white font-semibold ml-1 text-[14px]">{paper.receivedAt || "08 June 2026"}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 bg-black/15 px-3 py-1.5 rounded-lg border border-white/5">
                        <BookOpen className="w-4 h-4 text-emerald-300 shrink-0" />
                        <span>Journal <strong className="text-white font-semibold ml-1 text-[14px]">Journal of AI in Medicine</strong></span>
                      </div>
                      <div className="flex items-center gap-2 bg-black/15 px-3 py-1.5 rounded-lg border border-white/5">
                        <User className="w-4 h-4 text-emerald-300 shrink-0" />
                        <span>Author <strong className="text-white font-semibold ml-1 text-[14px]">{paper.author || "Akshaya G"}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 bg-black/15 px-3 py-1.5 rounded-lg border border-white/5">
                        <User className="w-4 h-4 text-emerald-300 shrink-0" />
                        <span>Corresponding Author <strong className="text-white font-semibold ml-1 text-[14px]">{paper.author || "Akshaya G"}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Current Status sub-card on the right */}
                  <div className="shrink-0 flex items-center gap-4 relative z-10 bg-white border border-emerald-500/20 p-5 rounded-2xl shadow-lg self-stretch md:self-auto flex-row justify-between md:justify-start">
                    <div className="space-y-1 text-left">
                      <span className="text-slate-800 text-[11px] font-semibold uppercase tracking-widest block">Current Status</span>
                      <span className="bg-[#e6f7ef] text-[#008751] border-2 border-emerald-500/30 px-3.5 py-1.5 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 shadow-3xs">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#008751]" />
                        Submitted
                      </span>
                    </div>
                    
                    {/* Cute document sheet with green check overlay */}
                    <div className="relative">
                      <div className="w-12 h-14 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center shadow-xs relative">
                        <FileText className="w-6 h-6 text-[#008751]" />
                        <div className="absolute -bottom-1 -right-1 bg-[#008751] text-white rounded-full p-0.5 border-2 border-white shadow-2xs">
                          <Check className="w-3 h-3 stroke-[3.5]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4-Metric Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Files */}
                  <div className="bg-gradient-to-br from-white to-[#f0fbf5] border border-[#a7f3d0] rounded-xl p-5 shadow-xs flex items-center gap-4 hover:border-[#008751] hover:shadow-sm transition duration-150">
                    <div className="w-11 h-11 rounded-full bg-[#d1f2e1] flex items-center justify-center text-[#004d2e] shrink-0 shadow-3xs border border-[#a7f3d0]">
                      <FolderOpen className="w-5.5 h-5.5 stroke-[2.5]" />
                    </div>
                    <div className="text-left space-y-0.5">
                      <span className="text-black text-[13px] font-normal uppercase tracking-wider block">Files</span>
                      <div className="text-2xl font-semibold text-black leading-none">{uploadedFiles.length}</div>
                      <span className="text-slate-900 text-[11px] block font-medium">Files Uploaded</span>
                      <button 
                        onClick={() => document.getElementById("uploaded-files-card")?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-[#008751] hover:text-[#007043] hover:underline font-normal text-[11px] block mt-1.5 flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>View Files</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Discussions */}
                  <div className="bg-gradient-to-br from-white to-[#f0fbf5] border border-[#a7f3d0] rounded-xl p-5 shadow-xs flex items-center gap-4 hover:border-[#008751] hover:shadow-sm transition duration-150">
                    <div className="w-11 h-11 rounded-full bg-[#d1f2e1] flex items-center justify-center text-[#004d2e] shrink-0 shadow-3xs border border-[#a7f3d0]">
                      <MessageSquare className="w-5.5 h-5.5 stroke-[2.5]" />
                    </div>
                    <div className="text-left space-y-0.5">
                      <span className="text-black text-[13px] font-normal uppercase tracking-wider block">Discussions</span>
                      <div className="text-2xl font-semibold text-black leading-none">2</div>
                      <span className="text-slate-900 text-[11px] block font-medium">New Messages</span>
                      <button 
                        onClick={() => document.getElementById("discussions-card")?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-[#008751] hover:text-[#007043] hover:underline font-normal text-[11px] block mt-1.5 flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>Open</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 3: Editorial Team */}
                  <div className="bg-gradient-to-br from-white to-[#f0fbf5] border border-[#a7f3d0] rounded-xl p-5 shadow-xs flex items-center gap-4 hover:border-[#008751] hover:shadow-sm transition duration-150">
                    <div className="w-11 h-11 rounded-full bg-[#d1f2e1] flex items-center justify-center text-[#004d2e] shrink-0 shadow-3xs border border-[#a7f3d0]">
                      <User className="w-5.5 h-5.5 stroke-[2.5]" />
                    </div>
                    <div className="text-left space-y-0.5 overflow-hidden">
                      <span className="text-black text-[13px] font-normal uppercase tracking-wider block">Editorial Team</span>
                      {manuscriptDetails?.editorAssignments && manuscriptDetails.editorAssignments.length > 0 ? (
                        <>
                          <div className="text-sm font-semibold text-black leading-none truncate font-sans" title={userProfiles.get(manuscriptDetails.editorAssignments[0].editor_id)?.name || 'Assigned'}>
                            {userProfiles.get(manuscriptDetails.editorAssignments[0].editor_id)?.name || 'Editor Assigned'}
                          </div>
                          <span className="text-slate-900 text-[11px] block font-medium">
                            {manuscriptDetails.editorAssignments[0].status === 'ACCEPTED' ? 'Editor Confirmed' : 'Awaiting Acceptance'}
                          </span>
                          <button
                            onClick={() => {
                              const editor = userProfiles.get(manuscriptDetails.editorAssignments[0].editor_id);
                              alert(`Editor: ${editor?.name}\nEmail: ${editor?.email}\nStatus: ${manuscriptDetails.editorAssignments[0].status}`);
                            }}
                            className="text-[#008751] hover:text-[#007043] hover:underline font-normal text-[11px] block mt-1.5 flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>View Details</span>
                            <span>→</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-slate-400">No editor assigned yet</div>
                          <span className="text-slate-500 text-[11px] block font-medium">Pending assignment</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Card 4: Important Dates */}
                  <div className="bg-gradient-to-br from-white to-[#f0fbf5] border border-[#a7f3d0] rounded-xl p-5 shadow-xs flex items-center gap-4 hover:border-[#008751] hover:shadow-sm transition duration-150">
                    <div className="w-11 h-11 rounded-full bg-[#d1f2e1] flex items-center justify-center text-[#004d2e] shrink-0 shadow-3xs border border-[#a7f3d0]">
                      <Calendar className="w-5.5 h-5.5 stroke-[2.5]" />
                    </div>
                    <div className="text-left space-y-0.5">
                      <span className="text-black text-[13px] font-normal uppercase tracking-wider block">Important Dates</span>
                      <div className="text-[11px] font-medium text-slate-900 leading-tight">
                        <div>
                          Submitted <strong className="text-black font-semibold">
                            {manuscriptDetails?.manuscript?.submitted_at
                              ? formatDate(manuscriptDetails.manuscript.submitted_at)
                              : '--'}
                          </strong>
                        </div>
                        {manuscriptDetails?.revisions && manuscriptDetails.revisions.length > 0 && (
                          <div className="mt-0.5">
                            Last Revision <strong className="text-black font-semibold">
                              {formatDate(manuscriptDetails.revisions[manuscriptDetails.revisions.length - 1].requested_at)}
                            </strong>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const dates = manuscriptDetails ? {
                            submitted: manuscriptDetails.manuscript?.submitted_at ? formatDateTime(manuscriptDetails.manuscript.submitted_at) : 'N/A',
                            status: manuscriptDetails.manuscript?.status || 'N/A'
                          } : {};
                          alert(`Manuscript Timeline:\nSubmitted: ${dates.submitted}\nCurrent Status: ${dates.status}`);
                        }}
                        className="text-[#008751] hover:text-[#007043] hover:underline font-normal text-[11px] block mt-1 flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>View Calendar</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submission Workflow horizontal stepper */}
                <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-2xl p-6 shadow-xs text-left">
                  <h3 className="text-black text-[18px] font-semibold tracking-tight mb-6">Submission Workflow</h3>
                  
                  <div className="relative flex items-center justify-between">
                    {/* Background connecting line */}
                    <div className="absolute top-4 left-4 right-4 h-0.5 bg-emerald-200 z-0">
                      {/* Completed progress fill */}
                      <div className="absolute top-0 left-0 w-[20%] h-full bg-[#008751]" />
                    </div>
                    
                    {[
                      { label: "Submitted", sub: "08 Jun 2026", status: "completed" },
                      { label: "Editor Assigned", sub: "In Progress", status: "active" },
                      { label: "Reviewer Invited", sub: "Pending", status: "pending" },
                      { label: "Under Review", sub: "Pending", status: "pending" },
                      { label: "Decision", sub: "Pending", status: "pending" },
                      { label: "Production", sub: "Pending", status: "pending" }
                    ].map((step, idx) => {
                      let circleStyle = "bg-white border-emerald-200 text-[#004d2e]";
                      let labelStyle = "text-slate-800 font-medium";
                      let subStyle = "text-slate-900 font-normal";
                      
                      if (step.status === "completed") {
                        circleStyle = "bg-[#008751] border-[#008751] text-white shadow-3xs";
                        labelStyle = "text-black font-bold text-[12px]";
                        subStyle = "text-slate-800 font-medium text-[11px]";
                      } else if (step.status === "active") {
                        circleStyle = "border-2 border-[#008751] bg-[#eefcf5] text-[#008751] ring-2 ring-[#008751]/10";
                        labelStyle = "text-[#005a36] font-bold text-[12px] bg-emerald-100/70 px-1.5 py-0.5 rounded border border-emerald-200 shadow-3xs";
                        subStyle = "text-emerald-800 font-bold text-[11px]";
                      } else {
                        circleStyle = "bg-slate-50 border-emerald-100 text-slate-500";
                        labelStyle = "text-slate-900 font-medium text-[11px]";
                        subStyle = "text-slate-600 font-normal text-[10px]";
                      }
                      
                      return (
                        <div key={idx} className="relative z-10 flex flex-col items-center flex-1 text-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs transition duration-150 ${circleStyle}`}>
                            {step.status === "completed" ? (
                              <Check className="w-4 h-4 stroke-[4]" />
                            ) : step.status === "active" ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-[#008751]" />
                            ) : (
                              <span className="w-2 h-2 bg-slate-300 rounded-full" />
                            )}
                          </div>
                          <span className={`text-[10px] sm:text-[11px] mt-2 block tracking-tight ${labelStyle}`}>{step.label}</span>
                          <span className={`text-[9px] sm:text-[10px] mt-0.5 block ${subStyle}`}>{step.sub}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Uploaded Files and Pre-Review Discussions Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Uploaded Files Panel */}
                  <div id="uploaded-files-card" className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-2xl p-5 shadow-xs text-left flex flex-col justify-between">
                    <div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleRealFileUpload} 
                        className="hidden" 
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-emerald-100">
                        <div className="flex items-center gap-2">
                          <h3 className="text-black text-[18px] font-semibold tracking-tight">Uploaded Files</h3>
                          <span className="text-[10px] font-mono font-semibold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Supabase Connected
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="border border-emerald-600 bg-[#008751] hover:bg-[#007043] text-white text-[13px] font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-3xs disabled:opacity-50"
                          >
                            <Plus className="w-4 h-4 text-white stroke-[3]" />
                            <span>{isUploading ? "Uploading..." : "Upload New File"}</span>
                          </button>
                          
                          <button
                            onClick={() => handleSimulateUpload(false, true)}
                            title="Simulate adding sample file"
                            className="border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[#005a36] text-[12px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer shadow-3xs"
                          >
                            <span>+ Demo</span>
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-4 overflow-x-auto rounded-xl border border-emerald-50">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="text-[13px] font-normal uppercase tracking-wider text-[#004d2e] border-b border-emerald-200 bg-emerald-50/50">
                              <th className="p-3 font-bold">File Name</th>
                              <th className="p-3 font-bold">Type</th>
                              <th className="p-3 font-bold">Size</th>
                              <th className="p-3 font-bold">Uploaded On</th>
                              <th className="p-3 text-center font-bold">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50 bg-white">
                            {uploadedFiles.map((file, i) => {
                              // Icon coloring depending on file type extension
                              let fileIconColor = "text-rose-600";
                              if (file.name.endsWith(".docx")) fileIconColor = "text-blue-600";
                              else if (file.name.endsWith(".zip")) fileIconColor = "text-amber-600";
                              
                              return (
                                <tr key={file.id || i} className="hover:bg-emerald-50/30 transition">
                                  <td className="p-3">
                                    <button 
                                      onClick={() => {
                                        setPreviewFileName(file.name);
                                        setPreviewFileType(file.type || 'Document');
                                        setPreviewFileSize(file.size || '1.2 MB');
                                        setPreviewModalOpen(true);
                                      }}
                                      className="flex items-center gap-2 max-w-[150px] sm:max-w-none text-left hover:underline cursor-pointer group"
                                    >
                                      <FileText className={`w-4.5 h-4.5 ${fileIconColor} shrink-0 stroke-[2]`} />
                                      <span className="text-[14px] font-semibold text-black truncate group-hover:text-[#008751]" title={file.name}>{file.name}</span>
                                    </button>
                                  </td>
                                  <td className="p-3 text-[14px] font-medium text-slate-900">{file.type}</td>
                                  <td className="p-3 text-[14px] font-medium text-slate-950 font-mono">{file.size}</td>
                                  <td className="p-3 text-[14px] font-medium text-slate-950 font-mono">{file.date}</td>
                                  <td className="p-3">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button 
                                        onClick={() => {
                                          setPreviewFileName(file.name);
                                          setPreviewFileType(file.type || 'Document');
                                          setPreviewFileSize(file.size || '1.2 MB');
                                          setPreviewModalOpen(true);
                                        }}
                                        className="p-1.5 hover:bg-emerald-50 rounded text-slate-900 hover:text-[#008751] transition border border-transparent hover:border-emerald-200 cursor-pointer"
                                        title="View file"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      <a 
                                        href={file.url || '#'} 
                                        download={file.name}
                                        onClick={(e) => {
                                          if (!file.url) {
                                            e.preventDefault();
                                            alert(`Downloading document file: ${file.name}`);
                                          }
                                        }}
                                        className="p-1.5 hover:bg-emerald-50 rounded text-slate-900 hover:text-[#008751] transition border border-transparent hover:border-emerald-200 cursor-pointer"
                                        title="Download file"
                                      >
                                        <Download className="w-4.5 h-4.5" />
                                      </a>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
 
                    <div className="border-t pt-4 border-emerald-100 mt-4">
                      <button
                        onClick={() => alert("Downloading all matching document publication files recursively as a single zip file.")}
                        className="inline-flex items-center gap-2 text-[13px] font-bold text-[#008751] hover:text-[#007043] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-xl transition cursor-pointer shadow-3xs"
                      >
                        <Download className="w-4.5 h-4.5 text-[#008751] stroke-[2.5]" />
                        <span>Download All Files</span>
                      </button>
                    </div>
                  </div>

                  {/* Discussions Column */}
                  <div className="flex flex-col gap-3.5">
                    
                    {activeThreadId === null ? (
                      /* ========== DISCUSSION FORUM THREAD LIST (SECOND IMAGE) ========== */
                      <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-2xl overflow-hidden shadow-xs text-left p-5 flex flex-col justify-between h-[540px] relative">
                        
                        {/* Header Row */}
                        <div className="flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-[#008751]"></span>
                            <h3 className="text-black text-[18px] font-semibold tracking-tight">
                              Discussions
                            </h3>
                            <span className="text-[10px] font-mono font-semibold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              Supabase Synced
                            </span>
                          </div>
                          
                          <button
                            onClick={() => setViewState('ADD_DISCUSSION')}
                            className="bg-[#eefcf4] border-2 border-[#008751]/30 text-[#004d2e] hover:bg-[#e1f9eb] px-4 py-2 rounded-xl text-[14px] font-bold flex items-center gap-1.5 cursor-pointer transition shadow-3xs"
                          >
                            <Plus className="w-4 h-4 text-[#008751] stroke-[3]" />
                            <span>New Discussion</span>
                          </button>
                        </div>

                        {/* Tabs Row */}
                        <div className="flex items-center justify-between border-b border-emerald-100 pb-0.5 mt-4 shrink-0">
                          <div className="flex gap-4 text-[14px] font-semibold text-slate-800">
                            <button
                              onClick={() => setActiveDiscussionTab('ALL')}
                              className={`pb-2.5 px-0.5 relative cursor-pointer ${
                                activeDiscussionTab === 'ALL'
                                  ? 'text-black border-b-2 border-[#008751] font-bold'
                                  : 'text-slate-700 hover:text-[#008751]'
                              }`}
                            >
                              All
                            </button>
                            <button
                              onClick={() => setActiveDiscussionTab('OFFICIAL')}
                              className={`pb-2.5 px-0.5 relative cursor-pointer flex items-center gap-1.5 ${
                                activeDiscussionTab === 'OFFICIAL'
                                  ? 'text-black border-b-2 border-[#008751] font-bold'
                                  : 'text-slate-700 hover:text-[#008751]'
                              }`}
                            >
                              <span>Official Threads</span>
                              <span className="w-5 h-5 bg-[#004d2b] text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                1
                              </span>
                            </button>
                            <button
                              onClick={() => setActiveDiscussionTab('DIRECT')}
                              className={`pb-2.5 px-0.5 relative cursor-pointer ${
                                activeDiscussionTab === 'DIRECT'
                                  ? 'text-black border-b-2 border-[#008751] font-bold'
                                  : 'text-slate-700 hover:text-[#008751]'
                              }`}
                            >
                              Direct Messages
                            </button>
                          </div>

                          <div className="flex items-center gap-2 pb-1.5">
                            <button
                              onClick={() => {
                                setShowSearch(!showSearch);
                                if (showSearch) setSearchQuery("");
                              }}
                              className={`w-8.5 h-8.5 rounded-xl border text-slate-900 flex items-center justify-center hover:bg-emerald-50 transition cursor-pointer ${
                                showSearch ? 'bg-emerald-100/50 border-[#008751]' : 'border-emerald-200 bg-white'
                              }`}
                              title="Search discussions"
                            >
                              <Search className="w-4 h-4 stroke-[2.5]" />
                            </button>
                            <button
                              onClick={() => {
                                alert("Filter: Showing active discussions. Search to find archived items.");
                              }}
                              className="w-8.5 h-8.5 rounded-xl border border-emerald-200 text-slate-900 flex items-center justify-center hover:bg-emerald-50 bg-white transition cursor-pointer"
                              title="Filter discussions"
                            >
                              <Filter className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </div>
                        </div>

                        {/* Search field if active */}
                        {showSearch && (
                          <div className="pt-2 shrink-0">
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search threads..."
                              className="w-full bg-[#f4fbf7] border-2 border-emerald-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#008751]/20 text-black font-medium placeholder-slate-500"
                            />
                          </div>
                        )}

                        {/* Thread Cards Stack */}
                        <div className="flex-grow overflow-y-auto mt-4 space-y-3 min-h-0 pr-1">
                          
                          {/* Thread 1: Editorial Inquiry (OFFICIAL THREAD) */}
                          {(activeDiscussionTab === 'ALL' || activeDiscussionTab === 'OFFICIAL') &&
                           "Editorial Inquiry".toLowerCase().includes(searchQuery.toLowerCase()) && (
                            <div
                              onClick={() => setActiveThreadId('thread-editorial-inquiry')}
                              className="bg-[#f0faf4] border-2 border-[#b8ebd0] hover:bg-[#e2f7eb] rounded-xl p-4 flex items-start gap-3 cursor-pointer transition duration-150 shadow-3xs text-left"
                            >
                              <div className="shrink-0 pt-1">
                                <Pin className="w-5 h-5 text-[#008751] rotate-45 stroke-[2.5]" />
                              </div>
                              <div className="flex-grow space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="bg-[#004d2e] text-white text-[9px] font-bold px-2 py-0.5 rounded-md tracking-wider uppercase">
                                    OFFICIAL THREAD
                                  </span>
                                  <Lock className="w-3.5 h-3.5 text-slate-900 stroke-[2.5]" />
                                </div>
                                <h4 className="text-[15px] font-bold text-black tracking-tight leading-snug">
                                  Editorial Inquiry
                                </h4>
                                <p className="text-[13px] font-normal text-slate-900 leading-snug line-clamp-1">
                                  <strong className="text-black font-semibold">Dr. John Smith:</strong> Dear Author, Please confirm that the manuscript complies with the guidelines.
                                </p>
                              </div>
                              <div className="shrink-0 flex flex-col items-end justify-between h-full min-h-[40px]">
                                <span className="text-[11px] font-semibold text-black font-mono">10:30 AM</span>
                                <span className="w-5.5 h-5.5 rounded-full bg-[#004d2b] text-white text-[11px] font-bold flex items-center justify-center font-sans mt-1.5">
                                  2
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Thread 2: Technical Check */}
                          {(activeDiscussionTab === 'ALL') &&
                           "Technical Check".toLowerCase().includes(searchQuery.toLowerCase()) && (
                            <div
                              onClick={() => setActiveThreadId('thread-technical-check')}
                              className="bg-white border border-emerald-100 hover:border-[#008751] rounded-xl p-4 flex items-start gap-3 cursor-pointer transition duration-150 shadow-3xs text-left"
                            >
                              <div className="shrink-0 pt-0.5">
                                <div className="w-8.5 h-8.5 rounded-full border border-emerald-200 text-[#004d2e] flex items-center justify-center bg-emerald-50">
                                  <Lock className="w-4 h-4 text-[#004d2e] stroke-[2.5]" />
                                </div>
                              </div>
                              <div className="flex-grow space-y-0.5">
                                <h4 className="text-[15px] font-bold text-black tracking-tight leading-snug">
                                  Technical Check
                                </h4>
                                <p className="text-[13px] font-normal text-slate-900 leading-snug line-clamp-1">
                                  <strong className="text-black font-semibold">System:</strong> Your file "Manuscript.pdf" has been successfully checked.
                                </p>
                              </div>
                              <div className="shrink-0 flex flex-col items-end justify-between h-full min-h-[40px]">
                                <span className="text-[11px] font-semibold text-black font-mono">Yesterday</span>
                                <span className="w-5.5 h-5.5 rounded-full bg-[#004d2b] text-white text-[11px] font-bold flex items-center justify-center font-sans mt-1.5">
                                  1
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Thread 3: Formatting & Style */}
                          {(activeDiscussionTab === 'ALL' || activeDiscussionTab === 'DIRECT') &&
                           "Formatting & Style".toLowerCase().includes(searchQuery.toLowerCase()) && (
                            <div
                              onClick={() => setActiveThreadId('thread-formatting-style')}
                              className="bg-white border border-emerald-100 hover:border-[#008751] rounded-xl p-4 flex items-start gap-3 cursor-pointer transition duration-150 shadow-3xs text-left"
                            >
                              <div className="shrink-0 pt-0.5">
                                <div className="w-8.5 h-8.5 rounded-full border border-emerald-200 text-[#004d2e] flex items-center justify-center bg-emerald-50">
                                  <User className="w-4 h-4 text-[#004d2e] stroke-[2.5]" />
                                </div>
                              </div>
                              <div className="flex-grow space-y-0.5">
                                <h4 className="text-[15px] font-bold text-black tracking-tight leading-snug">
                                  Formatting & Style
                                </h4>
                                <p className="text-[13px] font-normal text-slate-900 leading-snug line-clamp-1">
                                  <strong className="text-black font-semibold">Editor:</strong> Please ensure all references follow the journal format.
                                </p>
                              </div>
                              <div className="shrink-0 flex flex-col items-end justify-between h-full min-h-[40px]">
                                <span className="text-[11px] font-semibold text-black font-mono">2 Jun 2026</span>
                              </div>
                            </div>
                          )}

                          {/* Render custom threads added by user */}
                          {discussionThreads.length > 0 && (activeDiscussionTab === 'ALL' || activeDiscussionTab === 'DIRECT') && (
                            discussionThreads
                              .filter(t => t.subject.toLowerCase().includes(searchQuery.toLowerCase()))
                              .map(thread => (
                                <div
                                  key={thread.id}
                                  onClick={() => setActiveThreadId(thread.id)}
                                  className="bg-white border border-emerald-100 hover:border-[#008751] rounded-xl p-4 flex items-start gap-3 cursor-pointer transition duration-150 shadow-3xs text-left"
                                >
                                  <div className="shrink-0 pt-0.5">
                                    <div className="w-8.5 h-8.5 rounded-full border border-emerald-200 text-[#004d2e] flex items-center justify-center bg-emerald-50 font-semibold text-xs">
                                      {thread.initiator ? thread.initiator.substring(0, 2).toUpperCase() : "UT"}
                                    </div>
                                  </div>
                                  <div className="flex-grow space-y-0.5">
                                    <h4 className="text-[15px] font-semibold text-black tracking-tight leading-snug">
                                      {thread.subject}
                                    </h4>
                                    <p className="text-[13px] font-bold text-slate-950 leading-snug line-clamp-1">
                                      <strong className="text-black font-semibold">{thread.initiator}:</strong> {thread.messages[0]?.text || "No messages yet."}
                                    </p>
                                  </div>
                                  <div className="shrink-0 flex flex-col items-end justify-between h-full min-h-[40px]">
                                    <span className="text-[11px] font-semibold text-black font-mono">
                                      {new Date(thread.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                              ))
                          )}

                          {/* Fallback Empty State */}
                          {((activeDiscussionTab === 'OFFICIAL' && searchQuery !== "" && !"Editorial Inquiry".toLowerCase().includes(searchQuery.toLowerCase())) ||
                           (activeDiscussionTab === 'DIRECT' && searchQuery !== "" && !"Formatting & Style".toLowerCase().includes(searchQuery.toLowerCase()) && discussionThreads.length === 0)) && (
                            <div className="text-center py-10 text-slate-900 font-bold text-xs">
                              No discussions match your filter or search.
                            </div>
                          )}

                        </div>

                        {/* View All footer link */}
                        <div className="pt-3 border-t border-emerald-100 flex justify-center mt-auto shrink-0 bg-white">
                          <button
                            onClick={() => {
                              setActiveDiscussionTab('ALL');
                              setSearchQuery('');
                              alert("Showing all discussions. Click on any discussion item to enter its dedicated communication channel.");
                            }}
                            className="text-[#008751] hover:text-[#007043] font-semibold hover:underline text-[13px] flex items-center gap-1 cursor-pointer bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl"
                          >
                            <span>View All Discussions</span>
                            <span className="font-extrabold">→</span>
                          </button>
                        </div>

                      </div>
                    ) : activeThreadId === 'thread-editorial-inquiry' ? (
                      /* ========== PROFESSIONAL ACADEMIC PEER FORUM DISCUSSION PANEL ========== */
                      <div id="discussions-card" className="bg-[#fafdfb] border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-2xl overflow-hidden shadow-xs text-left flex flex-col justify-between h-[540px] relative">
                        
                        {/* Elegant Academic Header Bar */}
                        <div className="bg-gradient-to-r from-[#004d2e] to-[#047857] text-white px-4 py-3.5 flex items-center justify-between shrink-0 shadow-sm z-10">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setActiveThreadId(null)}
                              className="mr-1 hover:bg-white/10 p-2 rounded-xl transition cursor-pointer flex items-center justify-center"
                              title="Back to Discussions list"
                            >
                              <ChevronLeft className="w-5 h-5 text-white stroke-[4]" />
                            </button>
                            
                            {/* Group Icon Avatar */}
                            <div className="w-9 h-9 rounded-full bg-[#d1f2e1] text-[#004d2e] font-bold text-xs flex items-center justify-center border-2 border-white shadow-xs">
                              FI
                            </div>
                            <div>
                              <h4 className="font-semibold text-[14px] text-white tracking-tight flex items-center gap-1.5">
                                Editorial Inquiry Forum
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              </h4>
                              <p className="text-[11.5px] text-emerald-100/90 font-medium">
                                Editorial Board Panel • Active Conversation
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setViewState('ADD_DISCUSSION')}
                              className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl transition cursor-pointer"
                              title="New Thread Inquiry"
                            >
                              <Plus className="w-4 h-4 text-white font-bold stroke-[3]" />
                            </button>
                          </div>
                        </div>

                        {/* Academic Message Scroll Pane */}
                        <div className="flex-grow p-4 overflow-y-auto space-y-4 flex flex-col justify-start bg-[#f3faf5] relative min-h-0">
                          <div className="mx-auto bg-emerald-100 border-2 border-[#b8deb3] text-[#004d2e] text-[11px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider text-center select-none shadow-3xs z-10 font-mono">
                            OFFICIAL PEER COMMUNICATION STREAM
                          </div>

                          {/* Base messages */}
                          <div className="flex flex-col max-w-[90%] rounded-2xl p-4 shadow-sm relative leading-relaxed z-10 transition self-start bg-white text-black rounded-tl-none border-2 border-emerald-100/50 text-left">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[12px] font-bold block text-sky-800">Dr. John Smith</span>
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded font-sans tracking-wider border-2 bg-emerald-50 border-emerald-200 text-[#004d2e]">EDITOR</span>
                            </div>
                            <p className="text-[14px] font-medium text-black leading-relaxed font-sans">
                              Dear Author, Please confirm that the manuscript complies with the journal guidelines.
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-2 text-slate-800 select-none border-t pt-1.5 border-emerald-50">
                              <span className="text-[10px] font-medium font-mono">10:30 AM</span>
                            </div>
                          </div>

                          <div className="flex flex-col max-w-[90%] rounded-2xl p-4 shadow-sm relative leading-relaxed z-10 transition self-end bg-[#e8fbf1] text-black rounded-tr-none border-2 border-[#b8ebd0] text-left">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[12px] font-bold block text-[#004d2e]">Akshaya G</span>
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded font-sans tracking-wider border-2 bg-[#d1f2e1] border-[#a2ecd5] text-emerald-800">AUTHOR</span>
                            </div>
                            <p className="text-[14px] font-medium text-black leading-relaxed font-sans">
                              Thank you for your message. Yes, the manuscript follows all the guidelines.
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-2 text-slate-800 select-none border-t pt-1.5 border-emerald-100">
                              <span className="text-[10px] font-medium font-mono">11:02 AM</span>
                              <span className="text-[#008751] text-[12px] leading-none font-bold tracking-tighter" title="Read status">✓✓</span>
                            </div>
                          </div>

                          {/* Additional dynamic user messages */}
                          {whatsappMessages.slice(2).map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex flex-col max-w-[90%] rounded-2xl p-4 shadow-sm relative leading-relaxed z-10 transition text-left ${
                                msg.isMe
                                  ? 'self-end bg-[#e8fbf1] text-black rounded-tr-none border-2 border-[#b8ebd0]'
                                  : 'self-start bg-white text-black rounded-tl-none border-2 border-emerald-100/50'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[12px] font-bold block ${msg.isMe ? 'text-[#004d2e]' : 'text-sky-800'}`}>
                                  {msg.sender}
                                </span>
                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded font-sans tracking-wider border-2 ${
                                  msg.isMe
                                    ? 'bg-[#d1f2e1] border-[#a2ecd5] text-emerald-800'
                                    : 'bg-emerald-50 border-emerald-200 text-[#004d2e]'
                                }`}>
                                  {msg.senderRole}
                                </span>
                              </div>
                              <p className="text-[14px] font-medium text-black leading-relaxed font-sans">{msg.text}</p>
                              <div className="flex items-center justify-end gap-1 mt-2 text-slate-800 select-none border-t pt-1.5 border-emerald-50">
                                <span className="text-[10px] font-medium font-mono">{msg.timestamp}</span>
                                {msg.isMe && (
                                  <span className="text-[#008751] text-[12px] leading-none font-bold tracking-tighter" title="Read status">✓✓</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Professional Thread Message Input Bar */}
                        <div className="bg-[#eefcf4] px-4 py-3.5 border-t border-emerald-100 flex items-center gap-2 shrink-0 z-10">
                          <button
                            onClick={() => {
                              alert("This is a secure peer-to-peer discussion workspace for certified author-editor communication.");
                            }}
                            className="text-slate-900 hover:text-emerald-700 transition cursor-pointer p-1.5 rounded-lg hover:bg-emerald-100"
                            title="Discussion Information"
                          >
                            <Info className="w-5 h-5" />
                          </button>

                          <button
                            onClick={() => handleSimulateUpload(false, true)}
                            className="text-slate-900 hover:text-emerald-700 transition cursor-pointer p-1.5 rounded-lg hover:bg-emerald-100"
                            title="Attach manuscript file"
                          >
                            <Paperclip className="w-5 h-5 rotate-45" />
                          </button>

                          <input
                            type="text"
                            value={whatsappInput}
                            onChange={(e) => setWhatsappInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSendWhatsappMessage();
                            }}
                            placeholder="Type an official response..."
                            className="flex-grow bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#008751]/20 text-black font-medium placeholder-slate-500 shadow-3xs"
                          />

                          <button
                            onClick={handleSendWhatsappMessage}
                            className="bg-[#008751] hover:bg-[#007043] text-white px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-bold text-[13px] shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                            title="Send Message"
                          >
                            <span>Send</span>
                            <Send className="w-3.5 h-3.5 text-white stroke-[3]" />
                          </button>
                        </div>

                        {/* Pre-review custom links footer bar */}
                        <div className="bg-white px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[10.5px] font-mono shrink-0">
                          <button
                            onClick={() => setViewState('ADD_DISCUSSION')}
                            className="text-[#008751] hover:underline font-extrabold flex items-center gap-1 cursor-pointer"
                          >
                            <span>+ Official Thread Inquiry</span>
                          </button>
                          
                          <button
                            onClick={() => setActiveThreadId(null)}
                            className="text-slate-500 hover:text-slate-800 transition font-bold"
                          >
                            ← Back to Discussions
                          </button>
                        </div>

                      </div>
                    ) : activeThreadId === 'thread-technical-check' ? (
                      /* ========== TECHNICAL CHECK SYSTEM LOG CHAT ========== */
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-xs text-left flex flex-col justify-between h-[540px] relative">
                        
                        {/* Header Bar */}
                        <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-10">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setActiveThreadId(null)}
                              className="mr-1 hover:bg-slate-700/60 p-1.5 rounded-full transition cursor-pointer flex items-center justify-center"
                              title="Back to Discussions list"
                            >
                              <ChevronLeft className="w-5 h-5 text-white stroke-[3.5]" />
                            </button>
                            
                            <div className="w-9 h-9 rounded-full bg-slate-600 text-white font-extrabold text-xs flex items-center justify-center border border-slate-500/20 shadow-inner">
                              SYS
                            </div>
                            <div>
                              <h4 className="font-bold text-xs text-slate-100 tracking-tight flex items-center gap-1">
                                Technical Check System
                              </h4>
                              <p className="text-[10px] text-slate-300 font-medium">
                                automated verification report log
                              </p>
                            </div>
                          </div>
                          
                          <span className="text-[10px] bg-slate-700 text-slate-300 font-mono font-bold px-2.5 py-1 rounded-full uppercase border border-slate-600">
                            SYSTEM RUNNER
                          </span>
                        </div>

                        {/* Chat Scroll Pane */}
                        <div className="flex-grow p-4 overflow-y-auto space-y-3 flex flex-col justify-start bg-[#f8fafc] relative min-h-0">
                          {techCheckMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex flex-col max-w-[85%] rounded-xl px-3 py-2 shadow-xs relative leading-relaxed z-10 transition text-left ${
                                msg.isMe
                                  ? 'self-end bg-[#d9fdd3] text-slate-900 rounded-tr-none border border-[#c6ecbf]'
                                  : 'self-start bg-white text-slate-900 rounded-tl-none border border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-[11px] font-bold block ${msg.isMe ? 'text-[#075e54]' : 'text-slate-700'}`}>
                                  {msg.sender}
                                </span>
                                <span className={`text-[8px] font-semibold uppercase px-1 py-0.2 rounded font-sans tracking-wide border ${
                                  msg.isMe
                                    ? 'bg-[#e9f7e5] border-[#b0e2a7] text-emerald-700'
                                    : 'bg-slate-100 border-slate-200 text-slate-500'
                                }`}>
                                  {msg.senderRole}
                                </span>
                              </div>
                              <p className="text-[13px] sm:text-[14px] font-bold text-slate-800 leading-relaxed font-sans">{msg.text}</p>
                              <div className="flex items-center justify-end gap-1 mt-1 text-slate-400 select-none">
                                <span className="text-[9px] font-mono font-medium">{msg.timestamp}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Input bar */}
                        <div className="bg-[#f1f5f9] px-3 py-2.5 border-t border-slate-200 flex items-center gap-2 shrink-0 z-10">
                          <input
                            type="text"
                            value={techCheckInput}
                            onChange={(e) => setTechCheckInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSendTechCheckMessage();
                            }}
                            placeholder="Ask System or write confirmation notes..."
                            className="flex-grow bg-white border border-slate-200 rounded-lg px-3.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-slate-600 text-slate-800 font-bold shadow-3xs"
                          />

                          <button
                            onClick={handleSendTechCheckMessage}
                            className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-full transition flex items-center justify-center cursor-pointer shadow-sm"
                            title="Send Note"
                          >
                            <Send className="w-3.5 h-3.5 text-white" />
                          </button>
                        </div>

                        {/* Footer bar */}
                        <div className="bg-white px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[10.5px] font-mono shrink-0">
                          <span className="text-slate-400">Automated Security Audit</span>
                          <button
                            onClick={() => setActiveThreadId(null)}
                            className="text-slate-500 hover:text-slate-800 transition font-bold"
                          >
                            ← Back to Discussions
                          </button>
                        </div>

                      </div>
                    ) : activeThreadId === 'thread-formatting-style' ? (
                      /* ========== FORMATTING & STYLE DIRECT CHAT ========== */
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs text-left flex flex-col justify-between h-[540px] relative">
                        
                        {/* Header Bar */}
                        <div className="bg-sky-800 text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-10">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setActiveThreadId(null)}
                              className="mr-1 hover:bg-sky-700/60 p-1.5 rounded-full transition cursor-pointer flex items-center justify-center"
                              title="Back to Discussions list"
                            >
                              <ChevronLeft className="w-5 h-5 text-white stroke-[3.5]" />
                            </button>
                            
                            <div className="w-9 h-9 rounded-full bg-sky-600 text-white font-extrabold text-xs flex items-center justify-center border border-sky-500/20 shadow-inner">
                              FS
                            </div>
                            <div>
                              <h4 className="font-bold text-xs text-slate-100 tracking-tight flex items-center gap-1">
                                Formatting & Style Desk
                              </h4>
                              <p className="text-[10px] text-sky-200 font-medium">
                                Kellye Milhorn (Editor) • Away
                              </p>
                            </div>
                          </div>
                          
                          <span className="text-[10px] bg-sky-900 text-sky-200 font-mono font-bold px-2.5 py-1 rounded-full uppercase border border-sky-700">
                            EDITOR INQUIRY
                          </span>
                        </div>

                        {/* Chat Scroll Pane */}
                        <div className="flex-grow p-4 overflow-y-auto space-y-3 flex flex-col justify-start bg-[#f0f4f8] relative min-h-0">
                          {formattingMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex flex-col max-w-[85%] rounded-xl px-3 py-2 shadow-xs relative leading-relaxed z-10 transition text-left ${
                                msg.isMe
                                  ? 'self-end bg-[#d9fdd3] text-slate-900 rounded-tr-none border border-[#c6ecbf]'
                                  : 'self-start bg-white text-slate-900 rounded-tl-none border border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-[11px] font-bold block ${msg.isMe ? 'text-[#075e54]' : 'text-sky-700'}`}>
                                  {msg.sender}
                                </span>
                                <span className={`text-[8px] font-semibold uppercase px-1 py-0.2 rounded font-sans tracking-wide border ${
                                  msg.isMe
                                    ? 'bg-[#e9f7e5] border-[#b0e2a7] text-emerald-700'
                                    : 'bg-slate-100 border-slate-200 text-slate-500'
                                }`}>
                                  {msg.senderRole}
                                </span>
                              </div>
                              <p className="text-[13px] sm:text-[14px] font-bold text-slate-800 leading-relaxed font-sans">{msg.text}</p>
                              <div className="flex items-center justify-end gap-1 mt-1 text-slate-400 select-none">
                                <span className="text-[9px] font-mono font-medium">{msg.timestamp}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Input bar */}
                        <div className="bg-[#f0f4f8] px-3 py-2.5 border-t border-slate-200 flex items-center gap-2 shrink-0 z-10">
                          <input
                            type="text"
                            value={formattingInput}
                            onChange={(e) => setFormattingInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSendFormattingMessage();
                            }}
                            placeholder="Type a response to Formatting Desk..."
                            className="flex-grow bg-white border border-slate-200 rounded-lg px-3.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-sky-600 text-slate-800 font-bold shadow-3xs"
                          />

                          <button
                            onClick={handleSendFormattingMessage}
                            className="bg-sky-800 hover:bg-sky-700 text-white p-2 rounded-full transition flex items-center justify-center cursor-pointer shadow-sm"
                            title="Send Response"
                          >
                            <Send className="w-3.5 h-3.5 text-white" />
                          </button>
                        </div>

                        {/* Footer bar */}
                        <div className="bg-white px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[10.5px] font-mono shrink-0">
                          <span className="text-slate-400">Layout Desk Channel</span>
                          <button
                            onClick={() => setActiveThreadId(null)}
                            className="text-slate-500 hover:text-slate-800 transition font-bold"
                          >
                            ← Back to Discussions
                          </button>
                        </div>

                      </div>
                    ) : (
                      /* ========== GENERIC CHAT CHANNELS FOR CUSTOM USER CREATED THREADS ========== */
                      (() => {
                        const thread = discussionThreads.find(t => t.id === activeThreadId);
                        if (!thread) return null;
                        return (
                          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs text-left flex flex-col justify-between h-[540px] relative">
                            
                            {/* Header Bar */}
                            <div className="bg-emerald-800 text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-10">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setActiveThreadId(null)}
                                  className="mr-1 hover:bg-emerald-700/60 p-1.5 rounded-full transition cursor-pointer flex items-center justify-center"
                                  title="Back to Discussions list"
                                >
                                  <ChevronLeft className="w-5 h-5 text-white stroke-[3.5]" />
                                </button>
                                
                                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center border border-emerald-500/20 shadow-inner">
                                  {thread.initiator ? thread.initiator.substring(0, 2).toUpperCase() : "UT"}
                                </div>
                                <div>
                                  <h4 className="font-bold text-xs text-slate-100 tracking-tight flex items-center gap-1">
                                    {thread.subject}
                                  </h4>
                                  <p className="text-[10px] text-emerald-200 font-medium">
                                    Initiated by {thread.initiator}
                                  </p>
                                </div>
                              </div>
                              
                              <span className="text-[10px] bg-emerald-900 text-emerald-200 font-mono font-bold px-2.5 py-1 rounded-full uppercase border border-emerald-700">
                                USER DISCUSSION
                              </span>
                            </div>

                            {/* Chat Scroll Pane */}
                            <div className="flex-grow p-4 overflow-y-auto space-y-3 flex flex-col justify-start bg-slate-50 relative min-h-0">
                              {thread.messages.map((msg: any) => (
                                <div
                                  key={msg.id}
                                  className={`flex flex-col max-w-[85%] rounded-xl px-3 py-2 shadow-xs relative leading-relaxed z-10 transition text-left ${
                                    msg.sender === (currentUser?.name || "Akshaya G")
                                      ? 'self-end bg-[#d9fdd3] text-slate-900 rounded-tr-none border border-[#c6ecbf]'
                                      : 'self-start bg-white text-slate-900 rounded-tl-none border border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-[11px] font-bold block text-slate-700">
                                      {msg.sender}
                                    </span>
                                    <span className="text-[8px] font-semibold uppercase px-1 py-0.2 rounded font-sans tracking-wide border bg-slate-100 border-slate-200 text-slate-500">
                                      {msg.sender === (currentUser?.name || "Akshaya G") ? "AUTHOR" : "PARTICIPANT"}
                                    </span>
                                  </div>
                                  <p className="text-[13px] sm:text-[14px] font-bold text-slate-800 leading-relaxed font-sans">{msg.text}</p>
                                  <div className="flex items-center justify-end gap-1 mt-1 text-slate-400 select-none">
                                    <span className="text-[9px] font-mono font-medium">
                                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Reply Input block */}
                            <div className="bg-slate-100 px-3 py-2.5 border-t border-slate-200 flex items-center gap-2 shrink-0 z-10">
                              <input
                                type="text"
                                placeholder="Type a response message..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = (e.target as HTMLInputElement).value;
                                    if (!val.trim()) return;
                                    
                                    // Append reply to selected thread
                                    const updatedThreads = discussionThreads.map(t => {
                                      if (t.id === thread.id) {
                                        return {
                                          ...t,
                                          messages: [
                                            ...t.messages,
                                            {
                                              id: "msg-" + Date.now(),
                                              sender: currentUser?.name || "Akshaya G",
                                              senderRole: "Author",
                                              text: val.trim(),
                                              timestamp: new Date().toISOString()
                                            }
                                          ]
                                        };
                                      }
                                      return t;
                                    });
                                    setDiscussionThreads(updatedThreads);
                                    (e.target as HTMLInputElement).value = "";
                                  }
                                }}
                                className="flex-grow bg-white border border-slate-200 rounded-lg px-3.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-600 text-slate-800 font-bold shadow-3xs"
                              />
                            </div>

                            {/* Footer bar */}
                            <div className="bg-white px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[10.5px] font-mono shrink-0">
                              <span className="text-slate-400">Secure Channel</span>
                              <button
                                onClick={() => setActiveThreadId(null)}
                                className="text-slate-500 hover:text-slate-800 transition font-bold"
                              >
                                ← Back to Discussions
                              </button>
                            </div>

                          </div>
                        );
                      })()
                    )}

                  </div>
                </div>

              </div>

               {/* RIGHT DETAILS SIDEBAR (COLUMN 3) */}
              <aside id="ojs-column-right-details-dashboard" className="w-full lg:w-80 shrink-0 space-y-6 text-left leading-normal">
                
                {/* Submission Timeline */}
                <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-2xl p-5 shadow-xs text-left">
                  <h3 className="text-black text-[18px] font-semibold tracking-tight mb-5 border-b pb-3 border-emerald-100">Submission Timeline</h3>
                  
                  <div className="relative pl-5 ml-2.5 space-y-6 text-xs border-l-2 border-emerald-100">
                    {[
                      { label: "Manuscript Submitted", sub: "08 June 2026, 10:20 AM", status: "completed" },
                      { label: "Editor Assigned", sub: "08 June 2026, 11:15 AM", status: "active" },
                      { label: "Reviewer Invited", sub: "Pending", status: "pending" },
                      { label: "Under Review", sub: "Pending", status: "pending" },
                      { label: "Decision", sub: "Pending", status: "pending" },
                      { label: "Production", sub: "Pending", status: "pending" }
                    ].map((item, idx) => {
                      let markerStyle = "bg-white border-slate-300 text-slate-400";
                      let textStyle = "text-slate-950 font-bold text-[14px]";
                      let subStyle = "text-slate-700 font-bold text-[12px] font-mono";
                      
                      if (item.status === "completed") {
                        markerStyle = "bg-[#008751] border-[#008751] text-white";
                        textStyle = "text-black font-semibold text-[14px]";
                        subStyle = "text-[#004d2b] font-bold text-[12px] font-mono";
                      } else if (item.status === "active") {
                        markerStyle = "border-2 border-[#008751] bg-[#eefcf5] text-[#008751]";
                        textStyle = "text-[#008751] font-semibold text-[14px]";
                        subStyle = "text-emerald-800 font-bold text-[12px] font-mono";
                      }
                      
                      return (
                        <div key={idx} className="relative">
                          {/* Timeline marker */}
                          <div className={`absolute -left-[30.5px] top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 transition duration-150 ${markerStyle}`}>
                            {item.status === "completed" ? (
                              <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                            ) : item.status === "active" ? (
                              <span className="w-1.5 h-1.5 bg-[#008751] rounded-full" />
                            ) : (
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                            )}
                          </div>
                          
                          <div className="space-y-0.5 text-left">
                            <span className={`block ${textStyle}`}>{item.label}</span>
                            <span className={`block ${subStyle}`}>{item.sub}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-2xl p-5 shadow-xs text-left space-y-4">
                  <h3 className="text-black text-[18px] font-semibold tracking-tight border-b pb-3 border-emerald-100">Recent Activity</h3>

                  <div className="space-y-3.5 text-xs">
                    {manuscriptDetails && manuscriptDetails.statusHistory && manuscriptDetails.statusHistory.length > 0 ? (
                      manuscriptDetails.statusHistory.slice(-5).reverse().map((entry, i) => {
                        const getActivityDetails = (status: string) => {
                          const statusMap: { [key: string]: { label: string; icon: any; color: string } } = {
                            SUBMITTED: { label: 'Manuscript submitted', icon: FileText, color: 'bg-[#eefcf4] text-[#008751] border border-emerald-100' },
                            EDITOR_REVIEW: { label: 'Editor review started', icon: User, color: 'bg-[#eefcf4] text-[#008751] border border-emerald-100' },
                            UNDER_REVIEW: { label: 'Sent to reviewers', icon: Mail, color: 'bg-blue-50 text-blue-700 border border-blue-100' },
                            REVISION_REQUESTED: { label: 'Revision requested', icon: AlertCircle, color: 'bg-orange-50 text-orange-700 border border-orange-100' },
                            AWAITING_DECISION: { label: 'Awaiting editor decision', icon: Clock, color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                            ACCEPTED: { label: 'Manuscript accepted', icon: Check, color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
                            PUBLISHED: { label: 'Published', icon: BookOpen, color: 'bg-[#eefcf4] text-[#008751] border border-emerald-100' },
                            REJECTED: { label: 'Rejected', icon: X, color: 'bg-red-50 text-red-700 border border-red-100' }
                          };
                          return statusMap[status] || { label: status, icon: FileText, color: 'bg-slate-50 text-slate-700 border border-slate-100' };
                        };

                        const details = getActivityDetails(entry.to_status);
                        const Icon = details.icon;
                        const date = new Date(entry.created_at);
                        const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                        return (
                          <div key={i} className="flex items-center justify-between gap-3 hover:bg-emerald-50/40 p-1.5 rounded-lg transition">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className={`w-7 h-7 rounded-lg ${details.color} flex items-center justify-center shrink-0`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-semibold text-black truncate">{details.label}</span>
                            </div>
                            <span className="text-[11px] text-black font-mono shrink-0 font-extrabold">{time}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-slate-500 text-sm">No activity yet</div>
                    )}
                  </div>
                </div>

                {/* Need Help? */}
                <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-2xl p-5 shadow-xs text-left space-y-3">
                  <h3 className="text-black text-[18px] font-semibold tracking-tight border-b pb-3 border-emerald-100">Need Help?</h3>
                  <p className="text-[14px] text-slate-950 leading-relaxed font-bold">
                    If you have any questions, please contact the editorial office.
                  </p>
                  <button
                    onClick={() => alert("Connecting you with TULITICS Scholarly Publishing Editorial Desk. A support ticket is logged.")}
                    className="bg-[#008751] text-white hover:bg-[#007043] border-2 border-[#004d2e] px-4 py-2.5 text-[14.5px] font-semibold rounded-xl transition duration-150 cursor-pointer w-full flex items-center justify-center gap-2 mt-2 shadow-xs hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <HelpCircle className="w-4 h-4 text-white stroke-[2.5]" />
                    <span>Contact Support</span>
                  </button>
                </div>

              </aside>

            </div>

          </div>
        ) : (
          /* ======================= ORIGINAL DEFAULT WORKFLOW LAYOUT ======================= */
          <>
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
                <span className="text-2xl font-bold text-emerald-200 tracking-tight font-sans">
                  {paper.id || "N/A"}
                </span>
                <h1 className="text-xl font-bold tracking-tight text-white line-clamp-1">
                  {paper.author || "Anonymous"} — {paper.title || "Untitled"}
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
                                    onClick={() => {
                                      setPreviewFileName(editingFileName);
                                      setPreviewFileType('Manuscript');
                                      setPreviewFileSize('1.24 MB');
                                      setPreviewModalOpen(true);
                                    }}
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
                                  onClick={() => {
                                    setPreviewFileName(editingFileName);
                                    setPreviewFileType('Manuscript');
                                    setPreviewFileSize('1.24 MB');
                                    setPreviewModalOpen(true);
                                  }}
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
                          className="inline-flex items-center gap-2 text-xs font-semibold text-[#008751] hover:text-[#007043] hover:underline cursor-pointer select-none transition"
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
                                    <button
                                      onClick={() => {
                                        setPreviewFileName(file.name);
                                        setPreviewFileType('Supplementary File');
                                        setPreviewFileSize(file.size || '1.2 MB');
                                        setPreviewModalOpen(true);
                                      }}
                                      className="flex items-center gap-1.5 font-bold text-[#008751] hover:underline cursor-pointer text-left"
                                    >
                                      <FileText className="w-4 h-4 text-rose-500" />
                                      {file.name}
                                    </button>
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
                          textColor = "text-[#008751] font-semibold";
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
                  <strong className="text-slate-800 font-extrabold font-mono text-[13px]">{paper.id || "N/A"}</strong>
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
      </>
    )}

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

      {/* Dynamic interactive Document & Sandbox Asset Previewer */}
      {previewModalOpen && (
        <FilePreviewModal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          fileName={previewFileName}
          fileType={previewFileType}
          fileSize={previewFileSize}
        />
      )}

    </div>
  );
}
