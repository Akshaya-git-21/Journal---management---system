import { supabase } from './supabase';
import { ManuscriptStatus, ReviewerRecommendation } from '../types';

/**
 * Typed client wrapper around the Module 2 RPCs (see
 * supabase/migrations/0002_manuscripts_workflow.sql). This is the only
 * supported way to move a manuscript through the workflow -- there is no
 * direct-UPDATE path for status-bearing columns, so every transition here
 * is re-validated server-side regardless of what the UI allows.
 */

export interface EditorAssignmentRow {
  id: string;
  manuscript_id: string;
  editor_id: string;
  assigned_by: string | null;
  status: 'INVITED' | 'ACCEPTED' | 'DECLINED';
  assigned_at: string;
  responded_at: string | null;
  scientific_merit: number | null;
  novelty_innovation: number | null;
  methodology_quality: number | null;
  literature_adequacy: number | null;
  ethical_compliance: number | null;
  data_reliability: number | null;
  writing_quality: number | null;
  strengths: string | null;
  weaknesses: string | null;
  mandatory_revisions: string | null;
  comments_to_coordinator: string | null;
  assessment_status: 'NOT_STARTED' | 'SUBMITTED';
  assessment_submitted_at: string | null;
  recommendation: ReviewerRecommendation | null;
  recommendation_submitted_at: string | null;
}

export interface ReviewerAssignmentRow {
  id: string;
  manuscript_id: string;
  reviewer_id: string;
  assigned_by: string | null;
  status: 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'SUBMITTED';
  invited_at: string;
  responded_at: string | null;
  due_date: string | null;
  recommendation: ReviewerRecommendation | null;
  comments_to_author: string | null;
  comments_to_editor: string | null;
  scientific_merit: number | null;
  novelty_innovation: number | null;
  methodology_quality: number | null;
  literature_adequacy: number | null;
  ethical_compliance: number | null;
  data_reliability: number | null;
  writing_quality: number | null;
  submitted_at: string | null;
}

export interface StatusHistoryRow {
  id: string;
  manuscript_id: string;
  from_status: ManuscriptStatus | null;
  to_status: ManuscriptStatus;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  recipient_id: string;
  type: string;
  manuscript_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

function rpcOrThrow<T>(promise: PromiseLike<{ data: T; error: any }>): Promise<T> {
  return Promise.resolve(promise).then(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  });
}

export const submitManuscript = (manuscriptId: string) =>
  rpcOrThrow(supabase.rpc('submit_manuscript', { p_manuscript_id: manuscriptId }));

export const assignEditor = (manuscriptId: string, editorId: string) =>
  rpcOrThrow(supabase.rpc('assign_editor', { p_manuscript_id: manuscriptId, p_editor_id: editorId }));

export const respondToEditorAssignment = (assignmentId: string, accept: boolean) =>
  rpcOrThrow(supabase.rpc('respond_to_editor_assignment', { p_assignment_id: assignmentId, p_accept: accept }));

export interface EditorAssessmentInput {
  scientificMerit: number;
  noveltyInnovation: number;
  methodologyQuality: number;
  literatureAdequacy: number;
  ethicalCompliance: number;
  dataReliability: number;
  writingQuality: number;
  strengths: string;
  weaknesses: string;
  mandatoryRevisions: string;
  commentsToCoordinator: string;
  suggestedReviewers?: { name: string; email?: string; note?: string }[];
}

export const submitEditorAssessment = (assignmentId: string, input: EditorAssessmentInput) =>
  rpcOrThrow(supabase.rpc('submit_editor_assessment', {
    p_assignment_id: assignmentId,
    p_scientific_merit: input.scientificMerit,
    p_novelty_innovation: input.noveltyInnovation,
    p_methodology_quality: input.methodologyQuality,
    p_literature_adequacy: input.literatureAdequacy,
    p_ethical_compliance: input.ethicalCompliance,
    p_data_reliability: input.dataReliability,
    p_writing_quality: input.writingQuality,
    p_strengths: input.strengths,
    p_weaknesses: input.weaknesses,
    p_mandatory_revisions: input.mandatoryRevisions,
    p_comments_to_coordinator: input.commentsToCoordinator,
    p_suggested_reviewers: input.suggestedReviewers ?? []
  }));

export const assignReviewers = (manuscriptId: string, reviewerIds: [string, string]) =>
  rpcOrThrow(supabase.rpc('assign_reviewers', { p_manuscript_id: manuscriptId, p_reviewer_ids: reviewerIds }));

export const respondToReviewInvite = (assignmentId: string, accept: boolean) =>
  rpcOrThrow(supabase.rpc('respond_to_review_invite', { p_assignment_id: assignmentId, p_accept: accept }));

export interface ReviewSubmissionInput {
  recommendation: ReviewerRecommendation;
  commentsToAuthor: string;
  commentsToEditor: string;
  scientificMerit: number;
  noveltyInnovation: number;
  methodologyQuality: number;
  literatureAdequacy: number;
  ethicalCompliance: number;
  dataReliability: number;
  writingQuality: number;
}

export const submitReview = (assignmentId: string, input: ReviewSubmissionInput) =>
  rpcOrThrow(supabase.rpc('submit_review', {
    p_assignment_id: assignmentId,
    p_recommendation: input.recommendation,
    p_comments_to_author: input.commentsToAuthor,
    p_comments_to_editor: input.commentsToEditor,
    p_scientific_merit: input.scientificMerit,
    p_novelty_innovation: input.noveltyInnovation,
    p_methodology_quality: input.methodologyQuality,
    p_literature_adequacy: input.literatureAdequacy,
    p_ethical_compliance: input.ethicalCompliance,
    p_data_reliability: input.dataReliability,
    p_writing_quality: input.writingQuality
  }));

export const submitEditorRecommendation = (manuscriptId: string, recommendation: ReviewerRecommendation) =>
  rpcOrThrow(supabase.rpc('submit_editor_recommendation', { p_manuscript_id: manuscriptId, p_recommendation: recommendation }));

export type PublishDecision = 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT';

export const publishDecision = (manuscriptId: string, decision: PublishDecision, decisionLetter: string) =>
  rpcOrThrow(supabase.rpc('publish_decision', { p_manuscript_id: manuscriptId, p_decision: decision, p_decision_letter: decisionLetter }));

export const submitRevision = (manuscriptId: string, responseNote: string = '') =>
  rpcOrThrow(supabase.rpc('submit_revision', { p_manuscript_id: manuscriptId, p_response_note: responseNote }));

export const markPublished = (manuscriptId: string, doi: string, volume: string, issue: string) =>
  rpcOrThrow(supabase.rpc('mark_published', { p_manuscript_id: manuscriptId, p_doi: doi, p_volume: volume, p_issue: issue }));

// ------------------------------------------
// Reads (RLS-scoped -- each caller only ever sees rows they're allowed to)
// ------------------------------------------

export async function getEditorAssignments(manuscriptId: string): Promise<EditorAssignmentRow[]> {
  const { data, error } = await supabase.from('editor_assignments').select('*').eq('manuscript_id', manuscriptId).order('assigned_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getReviewerAssignments(manuscriptId: string): Promise<ReviewerAssignmentRow[]> {
  const { data, error } = await supabase.from('reviewer_assignments').select('*').eq('manuscript_id', manuscriptId).order('invited_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStatusHistory(manuscriptId: string): Promise<StatusHistoryRow[]> {
  const { data, error } = await supabase.from('manuscript_status_history').select('*').eq('manuscript_id', manuscriptId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMyNotifications(unreadOnly: boolean = false): Promise<NotificationRow[]> {
  let query = supabase.from('workflow_notifications').select('*').order('created_at', { ascending: false });
  if (unreadOnly) query = query.is('read_at', null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ------------------------------------------
// Manuscripts, contributors, suggested reviewers, discussions, profile pickers
// ------------------------------------------

export interface ManuscriptFileRow {
  id: string;
  manuscript_id: string;
  revision_id: string | null;
  file_name: string;
  file_type: string;
  file_size: string | null;
  storage_path: string | null;
  public_url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ManuscriptRow {
  id: string;
  title: string;
  abstract: string;
  references: string;
  is_double_blind: boolean;
  cover_letter: string;
  language: string;
  status: ManuscriptStatus;
  author_id: string;
  author_name: string;
  author_email: string;
  assigned_editor_id: string | null;
  submission_step: number;
  editors_notes: string;
  doi: string | null;
  volume: string | null;
  issue: string | null;
  submitted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  files?: ManuscriptFileRow[];
}

export interface ContributorRow {
  id: string;
  manuscript_id: string;
  name: string;
  email: string;
  affiliation: string;
  contributor_role: string;
  position: number;
}

export interface SuggestedReviewerRow {
  id: string;
  manuscript_id: string;
  suggested_by: 'AUTHOR' | 'EDITOR';
  suggested_by_user: string | null;
  name: string;
  email: string;
  note: string;
  created_at: string;
}

export interface DiscussionRow {
  id: string;
  manuscript_id: string;
  sender_id: string;
  message: string;
  file_name: string | null;
  file_size: string | null;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  requested_role?: string | null;
  status: string;
}

export interface RevisionRow {
  id: string;
  manuscript_id: string;
  revision_number: number;
  requested_by: string | null;
  decision_letter: string;
  status: string;
  requested_at: string;
  submitted_at: string | null;
}

/** RLS scopes this to whatever the caller is allowed to see: their own
 * manuscripts (Author), assigned ones (Editor/Reviewer), or all (Coordinator). */
export async function listManuscripts(): Promise<ManuscriptRow[]> {
  const { data, error } = await supabase.from('manuscripts').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getManuscript(id: string): Promise<ManuscriptRow | null> {
  const { data, error } = await supabase.from('manuscripts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getManuscriptFiles(manuscriptId: string): Promise<ManuscriptFileRow[]> {
  const { data, error } = await supabase.from('manuscript_files').select('*').eq('manuscript_id', manuscriptId).is('revision_id', null).order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getContributors(manuscriptId: string): Promise<ContributorRow[]> {
  const { data, error } = await supabase.from('manuscript_contributors').select('*').eq('manuscript_id', manuscriptId).order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSuggestedReviewers(manuscriptId: string): Promise<SuggestedReviewerRow[]> {
  const { data, error } = await supabase.from('manuscript_suggested_reviewers').select('*').eq('manuscript_id', manuscriptId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDiscussions(manuscriptId: string): Promise<DiscussionRow[]> {
  const { data, error } = await supabase.from('manuscript_discussions').select('*').eq('manuscript_id', manuscriptId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function postDiscussionMessage(manuscriptId: string, senderId: string, message: string): Promise<void> {
  const { error } = await supabase.from('manuscript_discussions').insert({ manuscript_id: manuscriptId, sender_id: senderId, message });
  if (error) throw new Error(error.message);
}

export async function getRevisions(manuscriptId: string): Promise<RevisionRow[]> {
  const { data, error } = await supabase.from('manuscript_revisions').select('*').eq('manuscript_id', manuscriptId).order('revision_number', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRevisionById(revisionId: string): Promise<RevisionRow | null> {
  const { data, error } = await supabase.from('manuscript_revisions').select('*').eq('id', revisionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
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

export async function getRevisionFiles(revisionId: string): Promise<ManuscriptFileRow[]> {
  const { data, error } = await supabase.from('manuscript_files').select('*').eq('revision_id', revisionId).order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function uploadRevisionFile(revisionId: string, file: File, fileType: string): Promise<ManuscriptFileRow> {
  const fileName = `${revisionId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage.from('manuscripts').upload(fileName, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: fileRecord, error: dbError } = await supabase.from('manuscript_files').insert({
    revision_id: revisionId,
    file_name: file.name,
    file_type: fileType,
    file_size: (file.size / 1024).toFixed(2) + ' KB',
    storage_path: fileName
  }).select().single();

  if (dbError) throw new Error(dbError.message);
  return fileRecord as ManuscriptFileRow;
}

export async function updateRevisionStatus(revisionId: string, status: 'AWAITING_AUTHOR_UPLOAD' | 'REVISION_SUBMITTED' | 'UNDER_REVIEW' | 'COMPLETED'): Promise<RevisionRow> {
  const { data, error } = await supabase.from('manuscript_revisions').update({ status }).eq('id', revisionId).select().single();
  if (error) throw new Error(error.message);
  return data as RevisionRow;
}

export async function assignRevisedManuscriptToEditor(manuscriptId: string, editorId: string): Promise<EditorAssignmentRow> {
  const { data, error } = await supabase.rpc('assign_editor', { p_manuscript_id: manuscriptId, p_editor_id: editorId });
  if (error) throw new Error(error.message);
  return data as EditorAssignmentRow;
}

/** Active accounts for a given role -- used by Coordinator's editor/reviewer pickers. */
export async function listActiveProfilesByRole(role: 'EDITOR' | 'REVIEWER'): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('id, name, email, role, status').eq('role', role).eq('status', 'ACTIVE').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPendingApprovals(): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('id, name, email, role, requested_role, status').eq('status', 'PENDING_APPROVAL').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function approveUserRole(targetId: string, approve: boolean): Promise<ProfileRow> {
  const decision = approve ? 'APPROVE' : 'REJECT';
  const { data, error } = await supabase.rpc('approve_user_role', { target_id: targetId, decision });
  if (error) throw new Error(error.message);
  return data as ProfileRow;
}

export async function getProfilesByIds(ids: string[]): Promise<Record<string, ProfileRow>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select('id, name, email, role, status').in('id', Array.from(new Set(ids)));
  if (error) throw new Error(error.message);
  const map: Record<string, ProfileRow> = {};
  (data ?? []).forEach((p) => { map[p.id] = p; });
  return map;
}

export interface DraftManuscriptInput {
  title: string;
  abstract: string;
  references: string;
  isDoubleBlind: boolean;
  coverLetter: string;
  language: string;
  contributors: { name: string; email: string; affiliation: string; role: string }[];
  suggestedReviewers: { name: string; email: string; note?: string }[];
}

/** Creates a DRAFT manuscript (id auto-generated) with its contributors and
 * author-suggested reviewers, ready for submit_manuscript() to submit. */
export async function createDraftManuscript(input: DraftManuscriptInput): Promise<string> {
  const id = `JMS-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { error: insertErr } = await supabase.from('manuscripts').insert({
    id,
    title: input.title,
    abstract: input.abstract,
    references: input.references,
    is_double_blind: input.isDoubleBlind,
    cover_letter: input.coverLetter,
    language: input.language,
    status: 'DRAFT'
  });
  if (insertErr) throw new Error(insertErr.message);

  if (input.contributors.length > 0) {
    const { error } = await supabase.from('manuscript_contributors').insert(
      input.contributors.map((c, i) => ({
        manuscript_id: id, name: c.name, email: c.email, affiliation: c.affiliation, contributor_role: c.role, position: i
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (input.suggestedReviewers.length > 0) {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('manuscript_suggested_reviewers').insert(
      input.suggestedReviewers.map((r) => ({
        manuscript_id: id, suggested_by: 'AUTHOR' as const, suggested_by_user: userData.user?.id ?? null,
        name: r.name, email: r.email, note: r.note ?? ''
      }))
    );
    if (error) throw new Error(error.message);
  }

  return id;
}

export function subscribeToManuscripts(onChange: () => void): () => void {
  const channel = supabase
    .channel('manuscripts-workflow-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscripts' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'editor_assignments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reviewer_assignments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_revisions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_files' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_status_history' }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.from('workflow_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
  if (error) throw new Error(error.message);
}
