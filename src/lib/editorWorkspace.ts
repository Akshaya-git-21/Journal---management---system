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
  const channel = supabase
    .channel(`editor:${editorId}:assignments`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'editor_assignments',
        filter: `editor_id=eq.${editorId}`
      },
      async () => {
        const details = await getEditorAssignedManuscripts(editorId);
        onUpdate(details);
      }
    )
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
