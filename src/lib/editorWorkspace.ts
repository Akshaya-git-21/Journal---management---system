import { supabase } from './supabase';
import {
  getManuscript,
  getContributors,
  getDiscussions,
  getReviewerAssignments,
  getStatusHistory,
  getRevisions,
  getSuggestedReviewers,
  ManuscriptRow,
  ContributorRow,
  DiscussionRow,
  EditorAssignmentRow,
  ReviewerAssignmentRow,
  StatusHistoryRow,
  RevisionRow,
  SuggestedReviewerRow,
  respondToEditorAssignment,
  submitEditorAssessment,
  submitEditorRecommendation,
  publishDecision,
  EditorAssessmentInput,
  PublishDecision
} from './workflow';

export interface EditorManuscriptDetails {
  manuscript: ManuscriptRow;
  assignment: EditorAssignmentRow;
  contributors: ContributorRow[];
  discussions: DiscussionRow[];
  reviewers: ReviewerAssignmentRow[];
  statusHistory: StatusHistoryRow[];
  revisions: RevisionRow[];
  suggestedReviewers: SuggestedReviewerRow[];
  files: ManuscriptFileRow[];
  profiles: Map<string, ProfileData>;
}

export interface ManuscriptFileRow {
  id: string;
  manuscript_id: string;
  revision_id: string | null;
  file_name: string;
  file_type: string;
  file_size: string;
  storage_path: string;
  public_url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ProfileData {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export async function getEditorAssignedManuscripts(editorId: string): Promise<EditorManuscriptDetails[]> {
  try {
    const { data: assignments, error: assignError } = await supabase
      .from('editor_assignments')
      .select('*')
      .eq('editor_id', editorId);

    if (assignError) throw new Error(assignError.message);
    if (!assignments || assignments.length === 0) return [];

    const details: EditorManuscriptDetails[] = [];

    for (const assignment of assignments) {
      try {
        const manuscript = await getManuscript(assignment.manuscript_id);
        if (!manuscript) continue;

        const [
          contributors,
          discussions,
          reviewers,
          statusHistory,
          revisions,
          suggestedReviewers
        ] = await Promise.all([
          getContributors(assignment.manuscript_id),
          getDiscussions(assignment.manuscript_id),
          getReviewerAssignments(assignment.manuscript_id),
          getStatusHistory(assignment.manuscript_id),
          getRevisions(assignment.manuscript_id),
          getSuggestedReviewers(assignment.manuscript_id)
        ]);

        const { data: filesData } = await supabase
          .from('manuscript_files')
          .select('*')
          .eq('manuscript_id', assignment.manuscript_id)
          .order('uploaded_at', { ascending: false });

        const userIds = new Set<string>();
        userIds.add(manuscript.author_id);
        userIds.add(assignment.editor_id);
        discussions.forEach(d => userIds.add(d.sender_id));
        reviewers.forEach(r => userIds.add(r.reviewer_id));
        statusHistory.forEach(s => s.actor_id && userIds.add(s.actor_id));

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name, email, role')
          .in('id', Array.from(userIds));

        const profiles = new Map<string, ProfileData>();
        if (profilesData) {
          profilesData.forEach((p: any) => {
            profiles.set(p.id, {
              id: p.id,
              name: p.name,
              email: p.email,
              role: p.role
            });
          });
        }

        details.push({
          manuscript,
          assignment: assignment as EditorAssignmentRow,
          contributors,
          discussions,
          reviewers,
          statusHistory,
          revisions,
          suggestedReviewers,
          files: (filesData || []) as ManuscriptFileRow[],
          profiles
        });
      } catch (error) {
        console.error(`Error fetching details for manuscript ${assignment.manuscript_id}:`, error);
        continue;
      }
    }

    return details;
  } catch (error) {
    console.error('Error fetching editor manuscripts:', error);
    throw error;
  }
}

export function subscribeToEditorAssignments(
  editorId: string,
  onUpdate: (details: EditorManuscriptDetails[]) => void
): () => void {
  // The sidebar's stage counts (Reviews Submitted, Reviews Overdue, Revisions
  // Submitted, In Review Stage, Copyediting Stage, ...) are computed from
  // reviewer_assignments/manuscripts/manuscript_revisions, not just
  // editor_assignments -- listening only to editor_assignments left those
  // counts stale until a manual reload whenever e.g. a reviewer submitted a
  // review. RLS already scopes what this editor can see on each table, so a
  // broad "any change" listener re-fetches only when something relevant to
  // them could have changed.
  const refresh = async () => {
    const details = await getEditorAssignedManuscripts(editorId);
    onUpdate(details);
  };

  const channel = supabase
    .channel(`editor:${editorId}:assignments`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'editor_assignments', filter: `editor_id=eq.${editorId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscripts' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reviewer_assignments' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_revisions' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_status_history' }, refresh)
    .subscribe();

  return () => channel.unsubscribe();
}

export async function respondToAssignment(
  assignmentId: string,
  accept: boolean
): Promise<void> {
  return respondToEditorAssignment(assignmentId, accept);
}

export async function saveDraftEvaluation(
  assignmentId: string,
  input: Partial<EditorAssessmentInput>
): Promise<void> {
  const key = `editor_draft_${assignmentId}`;
  localStorage.setItem(key, JSON.stringify(input));
}

export function getDraftEvaluation(assignmentId: string): Partial<EditorAssessmentInput> | null {
  const key = `editor_draft_${assignmentId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

export async function submitAssessment(
  assignmentId: string,
  input: EditorAssessmentInput
): Promise<void> {
  await submitEditorAssessment(assignmentId, input);
  const key = `editor_draft_${assignmentId}`;
  localStorage.removeItem(key);
}

export async function submitRecommendation(
  manuscriptId: string,
  recommendation: string
): Promise<void> {
  return submitEditorRecommendation(manuscriptId, recommendation as any);
}

export async function publishFinalDecision(
  manuscriptId: string,
  decision: PublishDecision,
  letter: string
): Promise<void> {
  return publishDecision(manuscriptId, decision, letter);
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '--';
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateTime(isoDate: string | null): string {
  if (!isoDate) return '--';
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** PHASE 2: Reviewer Management Functions */

export async function getReviewerFeedback(
  assignmentId: string
): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('reviewer_assignments')
      .select('*')
      .eq('id', assignmentId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data || null;
  } catch (error) {
    console.error('Error fetching reviewer feedback:', error);
    return null;
  }
}

export async function subscribeToReviewerChanges(
  manuscriptId: string,
  onUpdate: (reviewers: ReviewerAssignmentRow[]) => void
): Promise<() => void> {
  const channel = supabase
    .channel(`manuscript:${manuscriptId}:reviewers`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reviewer_assignments',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async () => {
        const reviewers = await getReviewerAssignments(manuscriptId);
        onUpdate(reviewers);
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}

/** PHASE 3: Collaboration Functions */

export async function postDiscussion(
  manuscriptId: string,
  senderId: string,
  message: string,
  discussionType: 'GENERAL' | 'EDITORIAL' | 'REVIEWER_SUGGESTION' = 'GENERAL'
): Promise<void> {
  try {
    const { error } = await supabase
      .from('manuscript_discussions')
      .insert({
        manuscript_id: manuscriptId,
        sender_id: senderId,
        message: message,
        created_at: new Date().toISOString()
      });

    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('Error posting discussion:', error);
    throw error;
  }
}

export async function subscribeToDiscussions(
  manuscriptId: string,
  onUpdate: (discussions: DiscussionRow[]) => void
): Promise<() => void> {
  const channel = supabase
    .channel(`manuscript:${manuscriptId}:discussions`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscript_discussions',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async () => {
        const discussions = await getDiscussions(manuscriptId);
        onUpdate(discussions);
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}

export async function postInternalNote(
  manuscriptId: string,
  editorId: string,
  note: string
): Promise<void> {
  return postDiscussion(
    manuscriptId,
    editorId,
    note,
    'EDITORIAL'
  );
}

export async function submitReviewerSuggestion(
  manuscriptId: string,
  reviewerId: string,
  suggestion: string,
  confidence: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from('reviewer_suggestions')
      .insert({
        manuscript_id: manuscriptId,
        reviewer_id: reviewerId,
        suggestion_text: suggestion,
        confidence_score: confidence,
        submitted_at: new Date().toISOString()
      });

    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('Error submitting reviewer suggestion:', error);
    throw error;
  }
}

/** Persists a single editor-suggested reviewer immediately (independent of
 * submit_editor_assessment) -- used by the Editor workspace's standalone
 * "Suggestions" tab. Requires the caller to be the manuscript's accepted
 * editor; see add_suggested_reviewer() in 0012_editor_suggest_reviewer.sql. */
export async function addSuggestedReviewer(
  manuscriptId: string,
  reviewer: { name: string; email: string; note?: string }
): Promise<SuggestedReviewerRow> {
  try {
    const { data, error } = await supabase.rpc('add_suggested_reviewer', {
      p_manuscript_id: manuscriptId,
      p_name: reviewer.name,
      p_email: reviewer.email,
      p_note: reviewer.note ?? ''
    }).single();

    if (error) throw new Error(error.message);
    return data as SuggestedReviewerRow;
  } catch (error) {
    console.error('Error adding suggested reviewer:', error);
    throw error;
  }
}

export async function notifyCoordinator(
  manuscriptId: string,
  editorId: string,
  messageType: 'READY_FOR_REVIEW' | 'REVIEWS_COMPLETE' | 'DECISION_READY',
  details?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('editor_notifications')
      .insert({
        manuscript_id: manuscriptId,
        sender_id: editorId,
        notification_type: messageType,
        message: details || `Notification: ${messageType}`,
        created_at: new Date().toISOString()
      });

    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
}

/** PHASE 4: Real-Time Updates & Polish */

// Validation functions
export function validateManuscriptData(manuscript: ManuscriptRow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manuscript.id) errors.push('Manuscript ID is required');
  if (!manuscript.title || manuscript.title.trim().length === 0) errors.push('Manuscript title is required');
  if (!manuscript.status) errors.push('Manuscript status is required');

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateAssignmentData(assignment: EditorAssignmentRow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!assignment.id) errors.push('Assignment ID is required');
  if (!assignment.manuscript_id) errors.push('Manuscript ID is required');
  if (!assignment.editor_id) errors.push('Editor ID is required');
  if (!assignment.status) errors.push('Assignment status is required');

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateReviewerAssignment(reviewer: ReviewerAssignmentRow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!reviewer.id) errors.push('Reviewer assignment ID is required');
  if (!reviewer.manuscript_id) errors.push('Manuscript ID is required');
  if (!reviewer.reviewer_id) errors.push('Reviewer ID is required');
  if (!reviewer.review_status) errors.push('Review status is required');

  return {
    valid: errors.length === 0,
    errors
  };
}

// Real-time subscription manager
export function subscribeToAllManuscriptUpdates(
  manuscriptId: string,
  callbacks: {
    onManuscriptChange?: (manuscript: ManuscriptRow) => void;
    onReviewerChange?: (reviewers: ReviewerAssignmentRow[]) => void;
    onDiscussionChange?: (discussions: DiscussionRow[]) => void;
    onStatusChange?: (history: StatusHistoryRow[]) => void;
    onAssignmentChange?: () => void;
  }
): () => void {
  const unsubscribers: (() => void)[] = [];

  // Subscribe to manuscript changes
  const manuscriptChannel = supabase
    .channel(`manuscript:${manuscriptId}:updates`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'manuscripts',
        filter: `id=eq.${manuscriptId}`
      },
      async (payload) => {
        try {
          const manuscript = await getManuscript(manuscriptId);
          if (manuscript) {
            const validation = validateManuscriptData(manuscript);
            if (validation.valid && callbacks.onManuscriptChange) {
              callbacks.onManuscriptChange(manuscript);
            } else {
              console.warn('Invalid manuscript data received:', validation.errors);
            }
          }
        } catch (error) {
          console.error('Error processing manuscript update:', error);
        }
      }
    )
    .subscribe();

  unsubscribers.push(() => manuscriptChannel.unsubscribe());

  // Subscribe to reviewer changes
  const reviewerChannel = supabase
    .channel(`manuscript:${manuscriptId}:reviewers_rt`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reviewer_assignments',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async () => {
        try {
          const reviewers = await getReviewerAssignments(manuscriptId);
          if (callbacks.onReviewerChange) {
            callbacks.onReviewerChange(reviewers);
          }
        } catch (error) {
          console.error('Error processing reviewer update:', error);
        }
      }
    )
    .subscribe();

  unsubscribers.push(() => reviewerChannel.unsubscribe());

  // Subscribe to discussion changes
  const discussionChannel = supabase
    .channel(`manuscript:${manuscriptId}:discussions_rt`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscript_discussions',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async () => {
        try {
          const discussions = await getDiscussions(manuscriptId);
          if (callbacks.onDiscussionChange) {
            callbacks.onDiscussionChange(discussions);
          }
        } catch (error) {
          console.error('Error processing discussion update:', error);
        }
      }
    )
    .subscribe();

  unsubscribers.push(() => discussionChannel.unsubscribe());

  // Subscribe to status history changes
  const statusChannel = supabase
    .channel(`manuscript:${manuscriptId}:status_rt`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscript_status_history',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async () => {
        try {
          const history = await getStatusHistory(manuscriptId);
          if (callbacks.onStatusChange) {
            callbacks.onStatusChange(history);
          }
        } catch (error) {
          console.error('Error processing status update:', error);
        }
      }
    )
    .subscribe();

  unsubscribers.push(() => statusChannel.unsubscribe());

  // Subscribe to editor assignment changes (assessment/recommendation updates)
  const assignmentChannel = supabase
    .channel(`manuscript:${manuscriptId}:editor_assignments_rt`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'editor_assignments',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      () => {
        if (callbacks.onAssignmentChange) {
          callbacks.onAssignmentChange();
        }
      }
    )
    .subscribe();

  unsubscribers.push(() => assignmentChannel.unsubscribe());

  // Return unified cleanup function
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}

// Retry logic for failed operations
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw new Error(`Operation failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// Error categorization
export function categorizeError(error: any): {
  category: 'network' | 'auth' | 'validation' | 'permission' | 'database' | 'unknown';
  message: string;
  recoverable: boolean;
} {
  const message = error?.message || String(error);

  if (message.includes('auth') || message.includes('unauthorized')) {
    return { category: 'auth', message: 'Authentication failed. Please log in again.', recoverable: false };
  }

  if (message.includes('network') || message.includes('failed to fetch')) {
    return { category: 'network', message: 'Network error. Please check your connection.', recoverable: true };
  }

  if (message.includes('validation') || message.includes('constraint')) {
    return { category: 'validation', message: 'Invalid data submitted.', recoverable: false };
  }

  if (message.includes('permission') || message.includes('policy')) {
    return { category: 'permission', message: 'You do not have permission to perform this action.', recoverable: false };
  }

  if (message.includes('database') || message.includes('PGRST')) {
    return { category: 'database', message: 'Database error occurred.', recoverable: true };
  }

  return { category: 'unknown', message: 'An unexpected error occurred.', recoverable: true };
}
