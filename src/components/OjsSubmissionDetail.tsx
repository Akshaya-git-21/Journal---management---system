import React, { useState, useEffect, useRef } from 'react';
import FilePreviewModal from './FilePreviewModal';
import SubmissionSidebar from './SubmissionSidebar';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import ViewSubmissionContent from './ViewSubmissionContent';
import {
  uploadManuscriptFile,
  syncManuscriptFilesToSupabase,
  syncManuscriptDiscussionsToSupabase,
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
  Clock,
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
  const [previewPublicUrl, setPreviewPublicUrl] = useState<string>("");

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

  // Coordinator chat state
  const [coordinatorMessages, setCoordinatorMessages] = useState<any[]>([
    {
      id: 'init-1',
      sender: 'Coordinator',
      senderRole: 'COORDINATOR',
      text: "Hello! I'm here to assist with your manuscript submission. How can I help you today?",
      timestamp: new Date().toISOString(),
      isMe: false
    }
  ]);
  const [coordinatorInput, setCoordinatorInput] = useState("");

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

  const handleSendCoordinatorMessage = async () => {
    if (!coordinatorInput.trim() || !paper?.id || !currentUser?.email) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user || userError) {
        console.error('Could not get current user');
        return;
      }

      // Add user message
      const userMessage = {
        id: 'msg-' + Date.now(),
        sender: currentUser?.name || 'Author',
        senderRole: 'AUTHOR',
        text: coordinatorInput.trim(),
        timestamp: new Date().toISOString(),
        isMe: true
      };

      setCoordinatorMessages([...coordinatorMessages, userMessage]);

      // Post to discussion messages
      await postDiscussionMessage(paper.id, user.id, `[Coordinator Chat] ${coordinatorInput.trim()}`);
      setCoordinatorInput("");
    } catch (error) {
      console.error('Error sending coordinator message:', error);
    }
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
          console.log('[FILE_DEBUG] Formatted files:', formattedFiles.map(f => ({ name: f.name, type: f.type, publicUrl: f.publicUrl })));
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

  // Real-time subscription to coordinator messages
  useEffect(() => {
    if (!paper?.id) return;

    const channel = supabase
      .channel(`coordinator-messages-${paper.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'discussion_messages',
          filter: `manuscript_id=eq.${paper.id}`
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (newMsg.message && newMsg.message.includes('[Coordinator Chat]')) {
            const coordinatorMsg = {
              id: newMsg.id,
              sender: newMsg.sender_name || 'Coordinator',
              senderRole: 'COORDINATOR',
              text: newMsg.message.replace('[Coordinator Chat] ', '').trim(),
              timestamp: newMsg.created_at,
              isMe: false
            };
            setCoordinatorMessages(prev => [...prev, coordinatorMsg]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [paper?.id]);

  // Note: file/discussion realtime sync is already handled by the
  // manuscript-id-filtered subscribeToManuscriptDetails() effect above
  // (dedicated files/discussions channels) -- a second unfiltered
  // manuscripts-table subscription here would be a duplicate.

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

  // Derived user roles & labels -- sourced from real assignment/profile data,
  // never a placeholder person's name.
  const assignedEditorProfile = manuscriptDetails?.editorAssignments?.[0]
    ? userProfiles.get(manuscriptDetails.editorAssignments[0].editor_id)
    : null;
  const authorDisplayLabel = currentUser ? `${currentUser.name}, Author` : 'Author';
  const editorDisplayLabel = assignedEditorProfile ? `${assignedEditorProfile.name}, Editor` : 'No editor assigned yet';

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
      initiator: currentUser?.name || 'Author',
      participants: [
        ...(participants.author ? [currentUser?.name || 'Author'] : []),
        ...(participants.editor && assignedEditorProfile ? [`${assignedEditorProfile.name} (Editor)`] : [])
      ],
      messages: [
        {
          id: "msg-" + Date.now(),
          sender: currentUser?.name || 'Author',
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
            sender: currentUser?.name || 'Author',
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

  // Builds the Submission Timeline strictly from real workflow records
  // (manuscript_status_history / editor_assignments / reviewer_assignments).
  // A step only shows a completion date when the underlying record actually
  // has one -- never today's date, never a fabricated placeholder.
  const getRealSubmissionTimeline = (details: AuthorManuscriptDetails | null): { label: string; sub: string; status: 'completed' | 'active' | 'pending' }[] => {
    if (!details) return [];
    const { manuscript, editorAssignments, reviewerAssignments, statusHistory } = details;
    const editorAssignment = editorAssignments[0] || null;
    const reviewersInvited = reviewerAssignments.length > 0;
    const reviewersAccepted = reviewerAssignments.filter((r) => r.status === 'ACCEPTED' || r.status === 'SUBMITTED');
    const reviewsSubmitted = reviewerAssignments.filter((r) => r.status === 'SUBMITTED');
    const allReviewsIn = reviewersInvited && reviewsSubmitted.length === reviewerAssignments.length;
    const decisionEntry = statusHistory.find((h) => ['ACCEPTED', 'REJECTED'].includes(h.to_status));
    const isPublished = manuscript.status === 'PUBLISHED';

    const fmt = (iso: string | null) => (iso ? formatDateTime(iso) : '');

    return [
      {
        label: 'Manuscript Submitted',
        sub: manuscript.submitted_at ? fmt(manuscript.submitted_at) : 'Not Started',
        status: manuscript.submitted_at ? 'completed' : 'pending',
      },
      {
        label: 'Editor Assigned',
        sub: editorAssignment ? fmt(editorAssignment.assigned_at) : 'Not Started',
        status: editorAssignment ? 'completed' : 'pending',
      },
      {
        label: 'Editor Accepted',
        sub: editorAssignment?.status === 'ACCEPTED' ? fmt(editorAssignment.responded_at) : editorAssignment ? 'Awaiting editor response' : 'Not Started',
        status: editorAssignment?.status === 'ACCEPTED' ? 'completed' : editorAssignment ? 'active' : 'pending',
      },
      {
        label: 'Editor Evaluation',
        sub: editorAssignment?.assessment_status === 'SUBMITTED' ? fmt(editorAssignment.assessment_submitted_at) : editorAssignment?.status === 'ACCEPTED' ? 'In Progress' : 'Not Started',
        status: editorAssignment?.assessment_status === 'SUBMITTED' ? 'completed' : editorAssignment?.status === 'ACCEPTED' ? 'active' : 'pending',
      },
      {
        label: 'Reviewers Assigned',
        sub: reviewersInvited
          ? fmt(reviewerAssignments.map((r) => r.invited_at).sort()[0])
          : 'Not Started',
        status: reviewersInvited ? 'completed' : 'pending',
      },
      {
        label: 'Reviewers Accepted',
        sub: reviewersInvited ? `${reviewersAccepted.length} of ${reviewerAssignments.length} accepted` : 'Not Started',
        status: reviewersInvited && reviewersAccepted.length === reviewerAssignments.length ? 'completed' : reviewersInvited ? 'active' : 'pending',
      },
      {
        label: 'Reviews Completed',
        sub: reviewersInvited ? (allReviewsIn ? fmt(reviewsSubmitted.map((r) => r.submitted_at).sort().slice(-1)[0]) : `${reviewsSubmitted.length} of ${reviewerAssignments.length} submitted`) : 'Not Started',
        status: allReviewsIn ? 'completed' : reviewersInvited ? 'active' : 'pending',
      },
      {
        label: 'Decision',
        sub: decisionEntry ? `${decisionEntry.to_status.replace(/_/g, ' ')} – ${fmt(decisionEntry.created_at)}` : 'Pending',
        status: decisionEntry ? 'completed' : 'pending',
      },
      {
        label: 'Published',
        sub: isPublished && manuscript.published_at ? fmt(manuscript.published_at) : 'Not Started',
        status: isPublished ? 'completed' : 'pending',
      },
    ];
  };

  const isSubmissionDashboard = (activeTab === 'SUBMISSION' || activeTab === 'overview') && viewState === 'DASHBOARD';

  return (
    <div id="ojs-submission-detail-container" className="w-full bg-[#e8f3ed] min-h-screen text-slate-950 flex flex-col md:flex-row items-start border-t border-slate-200">
      
      {/* DATA-DRIVEN SIDEBAR - Real submission data */}
      <SubmissionSidebar
        manuscript={manuscriptDetails}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setViewState('DASHBOARD');
        }}
      />

      {/* ======= MAIN VIEWPORTS: HERO HEADER CONTAINER + DOUBLE COLUMN STACKS ======= */}
      <div id="ojs-main-panel-content" className="flex-grow flex flex-col p-4 space-y-4 overflow-y-auto w-full">

        {isSubmissionDashboard ? (
          /* ======================= PREMIUM IMAGE-MATCHING DASHBOARD ======================= */
          <div className="space-y-4 w-full animate-in fade-in duration-200">
            {/* Back Button */}
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-[#008751] hover:text-[#007043] font-semibold text-sm mb-2 hover:bg-emerald-50 px-2 py-1.5 rounded-lg transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Submissions</span>
            </button>

            {/* Top Header Row with dynamic/stat values matching screenshot */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-emerald-200 gap-3">
              <div className="text-left">
                <h1 className="text-[20px] font-semibold text-black tracking-tight leading-none">Submission</h1>
                <p className="text-[12px] text-[#005e38] mt-1 font-medium">Track and manage your manuscript submission.</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Profile Section */}
                <div className="text-right">
                  <span className="text-[14px] font-semibold text-black font-sans block">{currentUser?.name || 'Author'}</span>
                </div>
              </div>
            </div>

            {/* TWO-COLUMN STACK (Center Column + Right Details Sidebar) */}
            <div className="w-full flex flex-col lg:flex-row items-start gap-6 lg:gap-8 -mt-4">

              {/* CENTER CORE COLUMN (COLUMN 2) */}
              <div id="ojs-column-center-main" className="flex-grow space-y-6 w-full lg:min-w-0">
                
                {/* Manuscript Detail Banner */}
                <div className="bg-gradient-to-br from-[#022c22] via-[#047857] to-[#065f46] border border-[#047857]/40 rounded-xl p-4 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm text-white">
                  {/* Decorative background radial glow */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

                  <div className="space-y-1.5 text-left relative z-10 flex-grow">
                    <span className="text-emerald-200 text-[11px] font-medium uppercase tracking-widest block font-mono">
                      Manuscript ID: #{paper.id || "N/A"}
                    </span>
                    <h2 className="text-white text-[18px] font-semibold font-sans tracking-tight leading-snug drop-shadow-xs">
                      {manuscriptDetails?.manuscript.title || paper.title || 'Untitled manuscript'}
                    </h2>

                    {/* Metadata line - compact horizontal layout */}
                    <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-emerald-100 font-medium">
                      <div className="flex items-center gap-1.5 bg-black/15 px-2.5 py-1 rounded-lg border border-white/5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                        <span>{manuscriptDetails?.manuscript.submitted_at ? formatDateTime(manuscriptDetails.manuscript.submitted_at) : 'Not submitted'}</span>
                      </div>
                      {manuscriptDetails?.manuscript.language && (
                        <div className="flex items-center gap-1.5 bg-black/15 px-2.5 py-1 rounded-lg border border-white/5">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                          <span>{manuscriptDetails.manuscript.language}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 bg-black/15 px-2.5 py-1 rounded-lg border border-white/5">
                        <User className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                        <span>{manuscriptDetails?.manuscript.author_name || paper.author || 'Unknown author'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Current Status sub-card on the right */}
                  <div className="shrink-0 flex items-center gap-3 relative z-10 bg-white border border-emerald-500/20 p-3.5 rounded-xl shadow-md self-stretch md:self-auto flex-row justify-between md:justify-start">
                    <div className="space-y-0.5 text-left">
                      <span className="text-slate-800 text-[10px] font-semibold uppercase tracking-wider block">Status</span>
                      <span className="bg-[#e6f7ef] text-[#008751] border border-emerald-500/30 px-3 py-1 rounded-full text-[12px] font-bold inline-flex items-center gap-1 shadow-3xs">
                        <span className="w-2 h-2 rounded-full bg-[#008751]" />
                        {(manuscriptDetails?.manuscript.status || paper.raw?.status || 'SUBMITTED').replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Document icon with check */}
                    <div className="relative">
                      <div className="w-10 h-12 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center shadow-xs relative">
                        <FileText className="w-5 h-5 text-[#008751]" />
                        <div className="absolute -bottom-0.5 -right-0.5 bg-[#008751] text-white rounded-full p-0.5 border-2 border-white shadow-2xs">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4-Metric Grid - Compact, Equal Height */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Card 1: Files */}
                  <div className="bg-white border border-emerald-200 rounded-lg p-4 shadow-xs flex flex-col justify-between h-full hover:border-[#008751] hover:shadow-sm transition duration-150">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-[#004d2e] shrink-0 border border-emerald-200">
                        <FolderOpen className="w-4.5 h-4.5 stroke-[2]" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <span className="text-slate-600 text-[11px] font-semibold uppercase tracking-wider block">Files</span>
                        <div className="text-xl font-bold text-black mt-0.5">{uploadedFiles.length}</div>
                        <span className="text-slate-700 text-[10px] block font-medium">Uploaded</span>
                      </div>
                    </div>
                    <button
                      onClick={() => document.getElementById("uploaded-files-card")?.scrollIntoView({ behavior: 'smooth' })}
                      className="text-[#008751] hover:text-[#007043] text-[10px] font-semibold mt-2 inline-flex items-center gap-0.5"
                    >
                      <span>View Files</span>
                      <span>→</span>
                    </button>
                  </div>

                  {/* Card 2: Discussions */}
                  <div className="bg-white border border-emerald-200 rounded-lg p-4 shadow-xs flex flex-col justify-between h-full hover:border-[#008751] hover:shadow-sm transition duration-150">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-[#004d2e] shrink-0 border border-emerald-200">
                        <MessageSquare className="w-4.5 h-4.5 stroke-[2]" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <span className="text-slate-600 text-[11px] font-semibold uppercase tracking-wider block">Discussions</span>
                        <div className="text-xl font-bold text-black mt-0.5">{manuscriptDetails?.discussions?.length || 0}</div>
                        <span className="text-slate-700 text-[10px] block font-medium">Messages</span>
                      </div>
                    </div>
                    <button
                      onClick={() => document.getElementById("discussions-card")?.scrollIntoView({ behavior: 'smooth' })}
                      className="text-[#008751] hover:text-[#007043] text-[10px] font-semibold mt-2 inline-flex items-center gap-0.5"
                    >
                      <span>{manuscriptDetails?.discussions?.length ? 'Open' : 'Start'}</span>
                      <span>→</span>
                    </button>
                  </div>

                  {/* Card 3: Editorial Team */}
                  <div className="bg-white border border-emerald-200 rounded-lg p-4 shadow-xs flex flex-col justify-between h-full hover:border-[#008751] hover:shadow-sm transition duration-150">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-[#004d2e] shrink-0 border border-emerald-200">
                        <User className="w-4.5 h-4.5 stroke-[2]" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <span className="text-slate-600 text-[11px] font-semibold uppercase tracking-wider block">Editorial Team</span>
                        {manuscriptDetails?.editorAssignments && manuscriptDetails.editorAssignments.length > 0 ? (
                          <>
                            <div className="text-sm font-bold text-black mt-0.5 truncate" title={userProfiles.get(manuscriptDetails.editorAssignments[0].editor_id)?.name || 'Assigned'}>
                              {userProfiles.get(manuscriptDetails.editorAssignments[0].editor_id)?.name || 'Editor'}
                            </div>
                            <span className="text-slate-700 text-[10px] block font-medium">Confirmed</span>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-bold text-slate-400 mt-0.5">No editor</div>
                            <span className="text-slate-600 text-[10px] block font-medium">Pending</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const editor = manuscriptDetails?.editorAssignments?.[0];
                        if (editor) {
                          alert(`Editor: ${userProfiles.get(editor.editor_id)?.name}\nStatus: ${editor.status}`);
                        }
                      }}
                      className="text-[#008751] hover:text-[#007043] text-[10px] font-semibold mt-2 inline-flex items-center gap-0.5"
                    >
                      <span>Details</span>
                      <span>→</span>
                    </button>
                  </div>

                  {/* Card 4: Important Dates */}
                  <div className="bg-white border border-emerald-200 rounded-lg p-4 shadow-xs flex flex-col justify-between h-full hover:border-[#008751] hover:shadow-sm transition duration-150">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-[#004d2e] shrink-0 border border-emerald-200">
                        <Calendar className="w-4.5 h-4.5 stroke-[2]" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <span className="text-slate-600 text-[11px] font-semibold uppercase tracking-wider block">Dates</span>
                        <div className="text-[10px] font-medium text-slate-900 mt-0.5 leading-tight">
                          <div>Submitted: <strong>{manuscriptDetails?.manuscript?.submitted_at ? formatDate(manuscriptDetails.manuscript.submitted_at) : '--'}</strong></div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => alert("View full timeline")}
                      className="text-[#008751] hover:text-[#007043] text-[10px] font-semibold mt-2 inline-flex items-center gap-0.5"
                    >
                      <span>Calendar</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>

                {/* Submission Workflow horizontal stepper */}
                <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-xl p-4 shadow-xs text-left">
                  <h3 className="text-black text-[16px] font-semibold tracking-tight mb-4">Submission Workflow</h3>

                  <div className="relative flex items-center justify-between">
                    {/* Background connecting line */}
                    <div className="absolute top-3 left-3 right-3 h-0.5 bg-emerald-200 z-0">
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
                      let subStyle = "text-slate-700 font-normal";

                      if (step.status === "completed") {
                        circleStyle = "bg-[#008751] border-[#008751] text-white shadow-2xs";
                        labelStyle = "text-black font-bold text-[11px]";
                        subStyle = "text-slate-800 font-medium text-[10px]";
                      } else if (step.status === "active") {
                        circleStyle = "border-2 border-[#008751] bg-[#eefcf5] text-[#008751] ring-2 ring-[#008751]/10";
                        labelStyle = "text-[#005a36] font-bold text-[11px] bg-emerald-100/70 px-1.5 py-0.5 rounded border border-emerald-200 shadow-2xs";
                        subStyle = "text-emerald-800 font-bold text-[10px]";
                      } else {
                        circleStyle = "bg-slate-50 border-emerald-100 text-slate-500";
                        labelStyle = "text-slate-900 font-medium text-[11px]";
                        subStyle = "text-slate-600 font-normal text-[10px]";
                      }
                      
                      return (
                        <div key={idx} className="relative z-10 flex flex-col items-center flex-1 text-center">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 text-xs transition duration-150 ${circleStyle}`}>
                            {step.status === "completed" ? (
                              <Check className="w-3.5 h-3.5 stroke-[4]" />
                            ) : step.status === "active" ? (
                              <span className="w-2 h-2 rounded-full bg-[#008751]" />
                            ) : (
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                            )}
                          </div>
                          <span className={`text-[9px] sm:text-[10px] mt-1.5 block tracking-tight ${labelStyle}`}>{step.label}</span>
                          <span className={`text-[8px] sm:text-[9px] mt-0.5 block ${subStyle}`}>{step.sub}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Uploaded Files and Pre-Review Discussions Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
                  {/* Uploaded Files Panel */}
                  <div id="uploaded-files-card" className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-xl p-4 shadow-xs text-left flex flex-col justify-between min-h-[500px]">
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleRealFileUpload}
                        className="hidden"
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-2.5 border-emerald-100">
                        <div className="flex items-center gap-2">
                          <h3 className="text-black text-[16px] font-semibold tracking-tight">Uploaded Files</h3>
                          <span className="text-[9px] font-mono font-semibold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Synced
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="border border-emerald-600 bg-[#008751] hover:bg-[#007043] text-white text-[12px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5 text-white stroke-[3]" />
                            <span className="hidden sm:inline">{isUploading ? "Uploading..." : "Upload"}</span>
                            <span className="sm:hidden">Upload</span>
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-3 overflow-x-auto rounded-lg border border-emerald-100">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 border-b border-emerald-100 bg-slate-50">
                              <th className="px-3 py-2 font-bold">Name</th>
                              <th className="px-3 py-2 font-bold">Type</th>
                              <th className="px-3 py-2 font-bold">Size</th>
                              <th className="px-3 py-2 font-bold">Date</th>
                              <th className="px-3 py-2 text-center font-bold">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50 bg-white">
                            {uploadedFiles.map((file, i) => {
                              let fileIconColor = "text-rose-600";
                              if (file.name.endsWith(".docx")) fileIconColor = "text-blue-600";
                              else if (file.name.endsWith(".zip")) fileIconColor = "text-amber-600";

                              return (
                                <tr key={file.id || i} className="hover:bg-emerald-50/50 transition">
                                  <td className="px-3 py-2">
                                    <button
                                      onClick={() => {
                                        setPreviewFileName(file.name);
                                        setPreviewFileType(file.type || 'Document');
                                        setPreviewFileSize(file.size || '1.2 MB');
                                        setPreviewPublicUrl(file.publicUrl || '');
                                        setPreviewModalOpen(true);
                                      }}
                                      className="flex items-center gap-2 max-w-[150px] sm:max-w-none text-left hover:underline cursor-pointer group"
                                    >
                                      <FileText className={`w-4 h-4 ${fileIconColor} shrink-0 stroke-[2]`} />
                                      <span className="text-[12px] font-semibold text-black truncate group-hover:text-[#008751]" title={file.name}>{file.name}</span>
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-[12px] font-medium text-slate-700">{file.type}</td>
                                  <td className="px-3 py-2 text-[12px] font-medium text-slate-700 font-mono">{file.size}</td>
                                  <td className="px-3 py-2 text-[12px] font-medium text-slate-700 font-mono">{file.date}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => {
                                          const publicUrlValue = file.publicUrl || '';
                                          console.log('[EYE_ICON] File preview clicked:', {
                                            name: file.name,
                                            type: file.type,
                                            size: file.size,
                                            publicUrl: publicUrlValue,
                                            storagePath: file.storagePath,
                                            hasPublicUrl: !!publicUrlValue
                                          });
                                          setPreviewFileName(file.name);
                                          setPreviewFileType(file.type || 'Document');
                                          setPreviewFileSize(file.size || '1.2 MB');
                                          setPreviewPublicUrl(publicUrlValue);
                                          setPreviewModalOpen(true);
                                        }}
                                        className="p-1 hover:bg-emerald-50 rounded text-slate-600 hover:text-[#008751] transition cursor-pointer"
                                        title="View"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                      <a
                                        href={file.publicUrl || file.url || '#'}
                                        download={file.name}
                                        onClick={(e) => {
                                          if (!file.publicUrl && !file.url) {
                                            e.preventDefault();
                                            alert(`Downloading: ${file.name}`);
                                          }
                                        }}
                                        className="p-1 hover:bg-emerald-50 rounded text-slate-600 hover:text-[#008751] transition cursor-pointer"
                                        title="Download"
                                      >
                                        <Download className="w-3.5 h-3.5" />
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
 
                    <div className="border-t pt-3 border-emerald-100 mt-3">
                      <button
                        onClick={() => alert("Downloading all matching document publication files recursively as a single zip file.")}
                        className="inline-flex items-center gap-2 text-[12px] font-bold text-[#008751] hover:text-[#007043] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition cursor-pointer shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5 text-[#008751] stroke-[2]" />
                        <span>Download All</span>
                      </button>
                    </div>
                  </div>

                  {/* Discussions Column */}
                  <div className="flex flex-col gap-3.5">
                    
                    {activeThreadId === null ? (
                      /* ========== DISCUSSION FORUM THREAD LIST (SECOND IMAGE) ========== */
                      <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-xl overflow-hidden shadow-xs text-left p-4 flex flex-col justify-between h-[500px] relative">

                        {/* Header Row */}
                        <div className="flex items-center justify-between shrink-0 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#008751]"></span>
                            <h3 className="text-black text-[16px] font-semibold tracking-tight">
                              Discussions
                            </h3>
                            <span className="text-[9px] font-mono font-semibold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Synced
                            </span>
                          </div>

                          <button
                            onClick={() => setActiveThreadId('coordinator-chat')}
                            className="bg-[#eefcf4] border border-[#008751]/30 text-[#004d2e] hover:bg-[#e1f9eb] px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#008751] stroke-[3]" />
                            <span className="hidden sm:inline">New</span>
                          </button>
                        </div>

                        {/* Tabs Row */}
                        <div className="flex items-center justify-start border-b border-emerald-100 pb-2 mt-3 shrink-0 gap-4 text-[12px] font-semibold text-slate-700">
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

                        {/* Thread Cards Stack - Real Data from Supabase */}
                        <div className="flex-grow overflow-y-auto mt-4 space-y-3 min-h-0 pr-1">
                          {manuscriptDetails && manuscriptDetails.discussions && manuscriptDetails.discussions.length > 0 ? (
                            manuscriptDetails.discussions
                              .filter(d => d.message.toLowerCase().includes(searchQuery.toLowerCase()))
                              .map((discussion, idx) => {
                                const senderProfile = userProfiles.get(discussion.sender_id);
                                const senderName = senderProfile?.name || 'Unknown';
                                const senderRole = senderProfile?.role || 'User';
                                const isOfficial = ['EDITOR', 'COORDINATOR'].includes(senderRole.toUpperCase());
                                const date = new Date(discussion.created_at);
                                const displayDate = formatDateTime(discussion.created_at);

                                // Filter by tab
                                const shouldShow =
                                  activeDiscussionTab === 'ALL' ||
                                  (activeDiscussionTab === 'OFFICIAL' && isOfficial) ||
                                  (activeDiscussionTab === 'DIRECT' && !isOfficial);

                                if (!shouldShow) return null;

                                return (
                                  <div
                                    key={discussion.id}
                                    onClick={() => setActiveThreadId(discussion.id)}
                                    className={`border rounded-xl p-4 flex items-start gap-3 cursor-pointer transition duration-150 shadow-3xs text-left ${
                                      isOfficial
                                        ? 'bg-[#f0faf4] border-2 border-[#b8ebd0] hover:bg-[#e2f7eb]'
                                        : 'bg-white border border-emerald-100 hover:border-[#008751]'
                                    }`}
                                  >
                                    <div className="shrink-0 pt-0.5">
                                      {isOfficial ? (
                                        <Pin className="w-5 h-5 text-[#008751] rotate-45 stroke-[2.5]" />
                                      ) : (
                                        <div className="w-8.5 h-8.5 rounded-full border border-emerald-200 text-[#004d2e] flex items-center justify-center bg-emerald-50 font-semibold text-xs">
                                          {senderName.substring(0, 2).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-grow space-y-1 min-w-0">
                                      {isOfficial && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="bg-[#004d2e] text-white text-[9px] font-bold px-2 py-0.5 rounded-md tracking-wider uppercase">
                                            {senderRole.toUpperCase()}
                                          </span>
                                          <Lock className="w-3.5 h-3.5 text-slate-900 stroke-[2.5]" />
                                        </div>
                                      )}
                                      <h4 className="text-[15px] font-bold text-black tracking-tight leading-snug">
                                        {senderName}
                                      </h4>
                                      <p className="text-[13px] font-normal text-slate-900 leading-snug line-clamp-2 break-words">
                                        {discussion.message}
                                      </p>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end justify-between h-full min-h-[40px]">
                                      <span className="text-[11px] font-semibold text-black font-mono whitespace-nowrap">{displayDate}</span>
                                    </div>
                                  </div>
                                );
                              })
                          ) : (
                            <div className="text-center py-10 text-slate-500 font-semibold text-sm">
                              No discussions yet. Start the conversation!
                            </div>
                          )}

                        </div>

                        {/* View All footer link */}
                        <div className="pt-3 border-t border-emerald-100 flex justify-center mt-auto shrink-0 bg-white">
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
                              disabled style={{display: 'none'}}
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

                          {/* Real messages loaded from Supabase (manuscript_discussions) */}
                          {whatsappMessages.length === 0 && (
                            <p className="text-center text-xs text-slate-400 py-6">No messages yet.</p>
                          )}
                          {whatsappMessages.map((msg) => (
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
                            onClick={() => fileInputRef.current?.click()}
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
                            disabled style={{display: 'none'}}
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
                                {assignedEditorProfile ? `${assignedEditorProfile.name} (Editor)` : 'No editor assigned yet'}
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
                    ) : activeThreadId === 'coordinator-chat' ? (
                      /* ========== COORDINATOR DIRECT CHAT ========== */
                      <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-xl overflow-hidden shadow-xs text-left p-4 flex flex-col justify-between h-[500px] relative">

                        {/* Header Row */}
                        <div className="flex items-center justify-between shrink-0 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#008751]"></span>
                            <h3 className="text-black text-[16px] font-semibold tracking-tight">
                              Coordinator Chat
                            </h3>
                            <span className="text-[9px] font-mono font-semibold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Live
                            </span>
                          </div>

                          <button
                            onClick={() => setActiveThreadId(null)}
                            className="text-[#008751] hover:text-[#007043] font-bold text-sm transition cursor-pointer"
                            title="Back to Discussions list"
                          >
                            ← Back
                          </button>
                        </div>

                        {/* Chat Messages Area */}
                        <div className="flex-grow overflow-y-auto space-y-3 flex flex-col justify-start bg-[#f8fcf9] relative min-h-0 mt-3">
                          {coordinatorMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex flex-col max-w-[85%] rounded-xl px-3 py-2 shadow-xs relative leading-relaxed z-10 transition text-left ${
                                msg.isMe
                                  ? 'self-end bg-[#d9fdd3] text-slate-900 rounded-tr-none border border-[#c6ecbf]'
                                  : 'self-start bg-white text-slate-900 rounded-tl-none border border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-[11px] font-bold block ${msg.isMe ? 'text-[#075e54]' : 'text-[#008751]'}`}>
                                  {msg.sender}
                                </span>
                                <span className={`text-[8px] font-semibold uppercase px-1 py-0.2 rounded font-sans tracking-wide border ${
                                  msg.isMe
                                    ? 'bg-[#e9f7e5] border-[#b0e2a7] text-emerald-700'
                                    : 'bg-emerald-100 border-emerald-200 text-emerald-700'
                                }`}>
                                  {msg.senderRole}
                                </span>
                              </div>
                              <p className="text-[13px] sm:text-[14px] font-bold text-slate-800 leading-relaxed font-sans">{msg.text}</p>
                              <div className="flex items-center justify-end gap-1 mt-1 text-slate-400 select-none">
                                <span className="text-[9px] font-mono font-medium">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Input bar */}
                        <div className="bg-[#f8fcf9] px-3 py-2.5 border-t border-slate-200 flex items-center gap-2 shrink-0 z-10">
                          <input
                            type="text"
                            value={coordinatorInput}
                            onChange={(e) => setCoordinatorInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSendCoordinatorMessage();
                            }}
                            placeholder="Type your message to coordinator..."
                            className="flex-grow bg-white border border-slate-200 rounded-lg px-3.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#008751] text-slate-800 font-bold shadow-3xs"
                          />
                          <button
                            onClick={handleSendCoordinatorMessage}
                            disabled={!coordinatorInput.trim()}
                            className="bg-[#008751] hover:bg-[#007043] disabled:bg-slate-300 text-white p-2 rounded-lg transition cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
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
                                    msg.sender === (currentUser?.name || 'Author')
                                      ? 'self-end bg-[#d9fdd3] text-slate-900 rounded-tr-none border border-[#c6ecbf]'
                                      : 'self-start bg-white text-slate-900 rounded-tl-none border border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-[11px] font-bold block text-slate-700">
                                      {msg.sender}
                                    </span>
                                    <span className="text-[8px] font-semibold uppercase px-1 py-0.2 rounded font-sans tracking-wide border bg-slate-100 border-slate-200 text-slate-500">
                                      {msg.sender === (currentUser?.name || 'Author') ? "AUTHOR" : "PARTICIPANT"}
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
                                              sender: currentUser?.name || 'Author',
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
              <aside id="ojs-column-right-details-dashboard" className="w-full lg:w-96 shrink-0 space-y-6 text-left leading-normal mt-0">

                {/* Submission Timeline */}
                <div className="bg-white border-t-4 border-t-[#008751] border-x border-b border-emerald-100 rounded-2xl p-5 shadow-xs text-left mt-0">
                  <h3 className="text-black text-[18px] font-semibold tracking-tight mb-5 border-b pb-3 border-emerald-100">Submission Timeline</h3>
                  
                  <div className="relative pl-5 ml-2.5 space-y-6 text-xs border-l-2 border-emerald-100">
                    {loadingDetails ? (
                      <p className="text-slate-400 text-xs">Loading timeline...</p>
                    ) : getRealSubmissionTimeline(manuscriptDetails).length === 0 ? (
                      <p className="text-slate-400 text-xs">No timeline data available.</p>
                    ) : getRealSubmissionTimeline(manuscriptDetails).map((item, idx) => {
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
                          onClick={() => fileInputRef.current?.click()}
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
                          {uploadedFiles.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-5 py-10 text-center text-slate-400 font-medium">
                                No files uploaded
                              </td>
                            </tr>
                          ) : uploadedFiles.map((file, idx) => (
                            <tr key={file.id || idx} className="hover:bg-slate-50/50 transition duration-100">

                              {/* file index */}
                              <td className="px-5 py-5 text-center font-mono font-bold text-slate-400">
                                {idx + 1}
                              </td>

                              {/* file link details */}
                              <td className="px-5 py-5">
                                <div className="flex items-center gap-3">
                                  <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                                  <div className="text-left">
                                    <button
                                      id="download-asset-handle-btn"
                                      onClick={() => {
                                        setPreviewFileName(file.name);
                                        setPreviewFileType(file.type || 'Manuscript');
                                        setPreviewFileSize(file.size || '');
                                        setPreviewPublicUrl(file.publicUrl || file.url || '');
                                        setPreviewModalOpen(true);
                                      }}
                                      className="text-[#008751] hover:text-[#007043] hover:underline font-extrabold text-sm text-left transition"
                                    >
                                      {file.name}
                                    </button>
                                    <span className="block text-[10px] text-slate-400 font-medium mt-0.5">{file.size ? `Size: ${file.size}` : ''}</span>
                                  </div>
                                </div>
                              </td>

                              {/* upload date */}
                              <td className="px-5 py-5 text-center font-mono text-slate-450 font-semibold text-slate-500">
                                {file.date || (file.uploadedAt ? formatDate(file.uploadedAt) : '--')}
                              </td>

                              {/* File type badge */}
                              <td className="px-5 py-5 text-center">
                                <span className="inline-block bg-[#eefcf4] text-[#008751] border border-emerald-100 px-3 py-1 font-bold text-[10.5px] rounded-full uppercase tracking-wider font-mono">
                                  {file.type || 'File'}
                                </span>
                              </td>

                              {/* Options ellipsis */}
                              <td className="px-5 py-5 text-center relative">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    id="view-file-quick"
                                    onClick={() => {
                                      setPreviewFileName(file.name);
                                      setPreviewFileType(file.type || 'Manuscript');
                                      setPreviewFileSize(file.size || '');
                                      setPreviewPublicUrl(file.publicUrl || file.url || '');
                                      setPreviewModalOpen(true);
                                    }}
                                    className="p-1.5 bg-slate-100 hover:bg-[#eefcf4] text-slate-500 hover:text-[#008751] rounded-lg transition cursor-pointer"
                                    title="View file"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>

                            </tr>
                          ))}
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
                          disabled style={{display: 'none'}}
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
                              onClick={() => fileInputRef.current?.click()}
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
                              onClick={() => fileInputRef.current?.click()}
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
                              onClick={() => fileInputRef.current?.click()}
                              className="bg-white hover:bg-slate-100 border text-[#008751] px-2.5 py-1 rounded shadow-inner font-mono font-bold tracking-wide cursor-pointer transition flex items-center gap-0.5"
                            >
                              <Search className="w-3 h-3 text-[#008751]" />
                              <span>Search</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="bg-white hover:bg-slate-100 border text-[#008751] px-2.5 py-1 rounded shadow-inner font-mono font-bold tracking-wide cursor-pointer transition"
                            >
                              <span>Upload File</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
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
            ) : activeTab === 'REVISION_HISTORY' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-left space-y-4 animate-in fade-in duration-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b pb-2.5 font-mono">Revision History</h2>
                {paper?.id ? (
                  <RevisionHistoryPanel
                    manuscriptId={paper.id}
                    profiles={Object.fromEntries(manuscriptDetails?.profiles || new Map())}
                  />
                ) : (
                  <p className="text-slate-500">No manuscript selected</p>
                )}
              </div>
            ) : (
              <ViewSubmissionContent
                activeTab={activeTab}
                manuscriptDetails={manuscriptDetails}
                currentUserId={currentUser?.email}
                onRefreshData={() => {
                  if (manuscriptDetails) {
                    fetchAuthorManuscriptDetails(manuscriptDetails.manuscript.id)
                      .then(setManuscriptDetails)
                      .catch(console.error);
                  }
                }}
              />
            )}

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
                      {getRealSubmissionTimeline(manuscriptDetails).map((realStage) => {
                        const stage = {
                          id: realStage.label,
                          label: realStage.label,
                          description: realStage.sub,
                          dateCompleted: realStage.status === 'completed' ? realStage.sub : null,
                        };
                        const isDone = realStage.status === 'completed';
                        const isActive = realStage.status === 'active';
                        const isUpcoming = realStage.status === 'pending';
                        const isSkipped = false;

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
                  <strong className="text-slate-800 font-extrabold font-mono text-xs">{manuscriptDetails?.manuscript.submitted_at ? formatDate(manuscriptDetails.manuscript.submitted_at) : '--'}</strong>
                </div>

                <div className="flex flex-col space-y-1 text-left">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold font-mono">Last Updated</span>
                  <strong className="text-slate-800 font-extrabold font-mono text-xs">{manuscriptDetails?.manuscript.updated_at ? formatDate(manuscriptDetails.manuscript.updated_at) : '--'}</strong>
                </div>

                <div className="flex flex-col space-y-1 text-left">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold font-mono">Submission Files</span>
                  <strong className="text-slate-800 font-extrabold font-mono text-xs">{uploadedFiles.length} file{uploadedFiles.length === 1 ? '' : 's'}</strong>
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
          publicUrl={previewPublicUrl}
        />
      )}

    </div>
  );
}
