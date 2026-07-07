export type Role = 'AUTHOR' | 'EDITOR' | 'REVIEWER' | 'PUBLISHER' | 'ARCHITECT' | 'COORDINATOR';

export type ManuscriptStatus =
  | 'DRAFT'
  | 'SUBMITTED'       // Unassigned (waiting for Editor)
  | 'UNDER_REVIEW'    // In Review
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
}

