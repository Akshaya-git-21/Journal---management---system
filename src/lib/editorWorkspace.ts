import { supabase } from './supabase';
import {
  getManuscript,
  getContributors,
  getEditorAssignments,
  getReviewerAssignments,
  getStatusHistory,
  getDiscussions,
  respondToEditorAssignment,
  submitEditorAssessment,
  ManuscriptRow,
  ContributorRow,
  EditorAssignmentRow,
  ReviewerAssignmentRow,
  DiscussionRow,
  StatusHistoryRow,
  EditorAssessmentInput
} from './workflow';

export interface EditorDashboardData {
  manuscript: ManuscriptRow;
  assignment: EditorAssignmentRow;
  contributors: ContributorRow[];
  reviewers: ReviewerAssignmentRow[];
  discussions: DiscussionRow[];
  statusHistory: StatusHistoryRow[];
  profiles: Map<string, ProfileData>;
}

export interface ProfileData {
  id: string;
  name: string;
  email: string;
  role?: string;
}

/** Load all editor assignments for the current user */
export async function loadEditorAssignments(editorId: string) {
  try {
    const { data: manuscriptsData, error: manuscriptsError } = await supabase
      .from('manuscripts')
      .select('*')
      .order('created_at', { ascending: false });

    if (manuscriptsError) throw new Error(manuscriptsError.message);

    const assignments: Array<{ manuscript: ManuscriptRow; assignment: EditorAssignmentRow }> = [];

    for (const manuscript of manuscriptsData || []) {
      const manuscriptAssignments = await getEditorAssignments(manuscript.id);
      const myAssignment = manuscriptAssignments.find((a) => a.editor_id === editorId);
      if (myAssignment) {
        assignments.push({
          manuscript,
          assignment: myAssignment
        });
      }
    }

    return assignments;
  } catch (error) {
    console.error('Error loading editor assignments:', error);
    throw error;
  }
}

/** Load complete dashboard data for a manuscript assignment */
export async function loadEditorDashboardData(
  manuscriptId: string,
  editorId: string
): Promise<EditorDashboardData> {
  try {
    const [
      manuscript,
      contributors,
      reviewers,
      discussions,
      statusHistory,
      assignments
    ] = await Promise.all([
      getManuscript(manuscriptId),
      getContributors(manuscriptId),
      getReviewerAssignments(manuscriptId),
      getDiscussions(manuscriptId),
      getStatusHistory(manuscriptId),
      getEditorAssignments(manuscriptId)
    ]);

    if (!manuscript) {
      throw new Error('Manuscript not found');
    }

    const assignment = assignments.find((a) => a.editor_id === editorId);
    if (!assignment) {
      throw new Error('Not assigned to this manuscript');
    }

    // Collect user IDs for profile lookup
    const userIds = new Set<string>();
    if (manuscript.author_id) userIds.add(manuscript.author_id);
    if (assignment.editor_id) userIds.add(assignment.editor_id);
    discussions.forEach((d) => userIds.add(d.sender_id));
    reviewers.forEach((r) => {
      if (r.reviewer_id) userIds.add(r.reviewer_id);
    });
    statusHistory.forEach((h) => {
      if (h.actor_id) userIds.add(h.actor_id);
    });

    // Fetch profiles
    const profiles = new Map<string, ProfileData>();
    if (userIds.size > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .in('id', Array.from(userIds));

      if (!profilesError && profilesData) {
        profilesData.forEach((p: any) => {
          profiles.set(p.id, {
            id: p.id,
            name: p.name,
            email: p.email,
            role: p.role
          });
        });
      }
    }

    return {
      manuscript,
      assignment,
      contributors,
      reviewers,
      discussions,
      statusHistory,
      profiles
    };
  } catch (error) {
    console.error('Error loading editor dashboard data:', error);
    throw error;
  }
}

/** Accept or decline an editor assignment */
export async function handleEditorAssignmentResponse(
  assignmentId: string,
  accept: boolean
): Promise<void> {
  try {
    await respondToEditorAssignment(assignmentId, accept);
  } catch (error) {
    console.error('Error responding to assignment:', error);
    throw error;
  }
}

/** Save editor evaluation as draft */
export async function saveDraftEvaluation(
  assignmentId: string,
  evaluation: Partial<EditorAssessmentInput>
): Promise<void> {
  // Store draft in localStorage for now
  localStorage.setItem(`editor_draft_${assignmentId}`, JSON.stringify(evaluation));
}

/** Submit editor evaluation */
export async function submitEvaluationToSupabase(
  assignmentId: string,
  evaluation: EditorAssessmentInput
): Promise<void> {
  try {
    await submitEditorAssessment(assignmentId, evaluation);
    // Clear draft after submission
    localStorage.removeItem(`editor_draft_${assignmentId}`);
  } catch (error) {
    console.error('Error submitting evaluation:', error);
    throw error;
  }
}

/** Load draft evaluation from localStorage */
export function loadDraftEvaluation(assignmentId: string): Partial<EditorAssessmentInput> | null {
  const draft = localStorage.getItem(`editor_draft_${assignmentId}`);
  return draft ? JSON.parse(draft) : null;
}

/** Subscribe to manuscript updates */
export function subscribeToEditorDashboard(
  manuscriptId: string,
  onUpdate: (updates: Partial<EditorDashboardData>) => void
): () => void {
  const unsubscribers: (() => void)[] = [];

  // Subscribe to manuscript changes
  const manuscriptChannel = supabase
    .channel(`editor_manuscript:${manuscriptId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscripts',
        filter: `id=eq.${manuscriptId}`
      },
      async () => {
        const manuscript = await getManuscript(manuscriptId);
        if (manuscript) onUpdate({ manuscript });
      }
    )
    .subscribe();

  unsubscribers.push(() => manuscriptChannel.unsubscribe());

  // Subscribe to discussions
  const discussionsChannel = supabase
    .channel(`editor_discussions:${manuscriptId}`)
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
        onUpdate({ discussions });
      }
    )
    .subscribe();

  unsubscribers.push(() => discussionsChannel.unsubscribe());

  // Subscribe to reviewer assignments
  const reviewersChannel = supabase
    .channel(`editor_reviewers:${manuscriptId}`)
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
        onUpdate({ reviewers });
      }
    )
    .subscribe();

  unsubscribers.push(() => reviewersChannel.unsubscribe());

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}

/** Format date */
export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '--';
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/** Format date and time */
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
