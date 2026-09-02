export type Role = 'AUTHOR' | 'EDITOR' | 'REVIEWER' | 'PUBLISHER' | 'COORDINATOR' | 'GD_MEMBER';

export type ProfileStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED';

export type ManuscriptStatus =
  | 'DRAFT'
  | 'SUBMITTED'       // Unassigned (waiting for Editor)
  | 'EDITOR_REVIEW'   // Assigned to an Editor: accept/decline, evaluate, suggest reviewers
  | 'UNDER_REVIEW'    // In Review (2 reviewers assigned and invited)
  | 'REVISION_REQUESTED' // Editor requested author revisions
  | 'AWAITING_DECISION'
  | 'ACCEPTED'        // In Production
  | 'PUBLISHED'       // Archived
  | 'REJECTED';       // Archived

export type ReviewStatus = 'INVITED' | 'ACCEPTED' | 'SUBMITTED' | 'DECLINED';

export type ReviewerRecommendation = 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | 'ADDITIONAL_REVIEW';

export interface SuggestedReviewer {
  id: string;
  name: string;
  email: string;
  approved?: boolean;
}

export interface DiscussionMessage {
  id: string;
  senderName: string;
  senderEmail: string;
  senderRole: Role;
  text: string;
  timestamp: string;
  fileName?: string | null;
  fileSize?: string | null;
}

export interface Contributor {
  id: string;
  name: string;
  email: string;
  affiliation: string;
  role: string; // e.g., "Primary Author", "Co-Author"
}

export interface ReviewerEvaluation {
  expertiseArea: string;
  scientificMerit: number; // 1–10
  noveltyInnovation: number; // 1–10
  methodologyQuality: number; // 1–10
  literatureAdequacy: number; // 1–10
  ethicalCompliance: number; // 1–10
  dataReliability: number; // 1–10
  writingQuality: number; // 1–10
  strengths: string;
  weaknesses: string;
  mandatoryRevisions: string;
  overallRecommendationScore?: number | null;
}

export interface ReviewerAssignment {
  id: string;
  name: string;
  email: string;
  status: ReviewStatus;
  recommendation: ReviewerRecommendation | null;
  commentsToAuthor: string;
  commentsToEditor: string;
  assignedAt: string;
  completedAt?: string;
  evaluation?: ReviewerEvaluation;
  dueDate?: string;
  invitedOn?: string;
  reminderSent?: boolean;
  isOverdueForce?: boolean;
  type?: string;
  // Dynamic custom questions:
  answers?: {
    scientificSound: string;
    methodology: string;
    literature: string;
    conclusions: string;
  };
}

export interface UploadedFile {
  id?: string;
  name: string;
  type: string; // e.g. "Manuscript", "Figures", "Supplementary File"
  size: string;
  date: string;
  url?: string | null;
  storagePath?: string | null;
}

export interface RevisionRecord {
  id: string;
  revisionNumber: number; // e.g. 1, 2, 3...
  requestedBy: string; // e.g., "Dr. Cynthia Dwork"
  requestedByEmail?: string;
  requestedAt: string; // ISO date-time or formatted timestamp
  decisionLetter: string; // Comments / decision letter
  status: 'AWAITING_AUTHOR_UPLOAD' | 'REVISION_SUBMITTED' | 'UNDER_REVIEW' | 'COMPLETED' | string;
  uploadedFiles: UploadedFile[];
}

export interface Manuscript {
  id: string;
  title: string;
  abstract: string;
  references: string;
  isDoubleBlind: boolean; // ANONYMITY SAFEGUARD check
  coverLetter: string; // Restricted to Editors only
  fileName: string | null;
  fileSize: string | null;
  uploadedAt: string | null;
  storagePath?: string | null;
  publicUrl?: string | null;
  uploadedFiles?: UploadedFile[];
  revisions?: RevisionRecord[];
  contributors: Contributor[];
  status: ManuscriptStatus;
  submittedAt: string | null;
  reviewers: ReviewerAssignment[];
  suggestedReviewers: SuggestedReviewer[];
  discussions: DiscussionMessage[];
  doi: string | null;
  volume: string | null;
  issue: string | null;
  publishedAt: string | null;
  authorId: string;
  authorName: string;
  authorEmail: string;
  submissionStep: number; // For the Author wizard (1 to 5)
  editorsNotes: string; // Editors notes section
  language?: string;
  assignedEditor?: string | null;
  assignedEditorEmail?: string | null;
}

