import { supabase } from './supabase';
import {
  getManuscript,
  getContributors,
  getDiscussions,
  getEditorAssignments,
  getReviewerAssignments,
  getStatusHistory,
  getRevisions,
  ManuscriptRow,
  ContributorRow,
  DiscussionRow,
  EditorAssignmentRow,
  ReviewerAssignmentRow,
  StatusHistoryRow,
  RevisionRow
} from './workflow';

export interface AuthorManuscriptDetails {
  manuscript: ManuscriptRow;
  contributors: ContributorRow[];
  discussions: DiscussionRow[];
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  statusHistory: StatusHistoryRow[];
  files: ManuscriptFileRow[];
  revisions: RevisionRow[];
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

/** Fetch all manuscript details including related data */
export async function fetchAuthorManuscriptDetails(
  manuscriptId: string
): Promise<AuthorManuscriptDetails> {
  try {
    const [
      manuscript,
      contributors,
      discussions,
      editorAssignments,
      reviewerAssignments,
      statusHistory,
      revisions
    ] = await Promise.all([
      getManuscript(manuscriptId),
      getContributors(manuscriptId),
      getDiscussions(manuscriptId),
      getEditorAssignments(manuscriptId),
      getReviewerAssignments(manuscriptId),
      getStatusHistory(manuscriptId),
      getRevisions(manuscriptId)
    ]);

    if (!manuscript) {
      throw new Error('Manuscript not found');
    }

    // Fetch manuscript files (excluding revision files)
    const { data: filesData, error: filesError } = await supabase
      .from('manuscript_files')
      .select('*')
      .eq('manuscript_id', manuscriptId)
      .is('revision_id', null)
      .order('uploaded_at', { ascending: false });

    if (filesError) throw new Error(filesError.message);

    // Collect all user IDs to fetch profiles
    const userIds = new Set<string>();
    if (manuscript.author_id) userIds.add(manuscript.author_id);
    if (manuscript.assigned_editor_id) userIds.add(manuscript.assigned_editor_id);
    discussions.forEach((d) => userIds.add(d.sender_id));
    editorAssignments.forEach((ea) => {
      if (ea.editor_id) userIds.add(ea.editor_id);
      if (ea.assigned_by) userIds.add(ea.assigned_by);
    });
    reviewerAssignments.forEach((ra) => {
      if (ra.reviewer_id) userIds.add(ra.reviewer_id);
      if (ra.assigned_by) userIds.add(ra.assigned_by);
    });
    statusHistory.forEach((sh) => {
      if (sh.actor_id) userIds.add(sh.actor_id);
    });

    // Fetch profile data
    const profiles = new Map<string, ProfileData>();
    if (userIds.size > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .in('id', Array.from(userIds));

      if (profilesError) {
        console.warn('Error fetching profiles:', profilesError);
      } else if (profilesData) {
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
      contributors,
      discussions,
      editorAssignments,
      reviewerAssignments,
      statusHistory,
      files: (filesData || []) as ManuscriptFileRow[],
      revisions,
      profiles
    };
  } catch (error) {
    console.error('Error fetching manuscript details:', error);
    throw error;
  }
}

/** Subscribe to real-time updates on a manuscript */
export function subscribeToManuscriptDetails(
  manuscriptId: string,
  onUpdate: (details: Partial<AuthorManuscriptDetails>) => void
): () => void {
  const unsubscribers: (() => void)[] = [];

  // Subscribe to manuscript changes
  const manuscriptChannel = supabase
    .channel(`manuscript:${manuscriptId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscripts',
        filter: `id=eq.${manuscriptId}`
      },
      async (payload) => {
        const manuscript = await getManuscript(manuscriptId);
        if (manuscript) onUpdate({ manuscript });
      }
    )
    .subscribe();

  unsubscribers.push(() => manuscriptChannel.unsubscribe());

  // Subscribe to discussions changes
  const discussionsChannel = supabase
    .channel(`discussions:${manuscriptId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscript_discussions',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async (payload) => {
        const discussions = await getDiscussions(manuscriptId);
        onUpdate({ discussions });
      }
    )
    .subscribe();

  unsubscribers.push(() => discussionsChannel.unsubscribe());

  // Subscribe to status history changes
  const statusHistoryChannel = supabase
    .channel(`status_history:${manuscriptId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscript_status_history',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async (payload) => {
        const statusHistory = await getStatusHistory(manuscriptId);
        onUpdate({ statusHistory });
      }
    )
    .subscribe();

  unsubscribers.push(() => statusHistoryChannel.unsubscribe());

  // Subscribe to editor assignments
  const editorAssignmentsChannel = supabase
    .channel(`editor_assignments:${manuscriptId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'editor_assignments',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async (payload) => {
        const editorAssignments = await getEditorAssignments(manuscriptId);
        onUpdate({ editorAssignments });
      }
    )
    .subscribe();

  unsubscribers.push(() => editorAssignmentsChannel.unsubscribe());

  // Subscribe to reviewer assignments
  const reviewerAssignmentsChannel = supabase
    .channel(`reviewer_assignments:${manuscriptId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reviewer_assignments',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async (payload) => {
        const reviewerAssignments = await getReviewerAssignments(manuscriptId);
        onUpdate({ reviewerAssignments });
      }
    )
    .subscribe();

  unsubscribers.push(() => reviewerAssignmentsChannel.unsubscribe());

  // Subscribe to revision cycles (requested/submitted/re-reviewed) -- the
  // Author's Submission Workflow stepper and timeline both derive their
  // revision-cycle steps from this table.
  const revisionsChannel = supabase
    .channel(`revisions:${manuscriptId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscript_revisions',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async () => {
        const revisions = await getRevisions(manuscriptId);
        onUpdate({ revisions });
      }
    )
    .subscribe();

  unsubscribers.push(() => revisionsChannel.unsubscribe());

  // Subscribe to manuscript files
  const filesChannel = supabase
    .channel(`files:${manuscriptId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'manuscript_files',
        filter: `manuscript_id=eq.${manuscriptId}`
      },
      async (payload) => {
        const { data: filesData, error } = await supabase
          .from('manuscript_files')
          .select('*')
          .eq('manuscript_id', manuscriptId)
          .order('uploaded_at', { ascending: false });
        if (!error && filesData) {
          onUpdate({ files: filesData as ManuscriptFileRow[] });
        }
      }
    )
    .subscribe();

  unsubscribers.push(() => filesChannel.unsubscribe());

  // Return cleanup function
  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}

/** Get profile data for a user */
export async function fetchProfile(userId: string): Promise<ProfileData | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return data
    ? {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role
      }
    : null;
}

/** Format date for display */
export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '--';
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/** Format time for display */
export function formatTime(isoDate: string | null): string {
  if (!isoDate) return '--';
  const date = new Date(isoDate);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Format date and time for display */
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
