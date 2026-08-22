import { supabase } from './supabase';
import { ManuscriptStatus, ReviewerRecommendation } from '../types';
export type { ReviewerRecommendation };

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
  criteria_reasons: Record<string, string> | null;
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
  criteria_reasons: Record<string, string> | null;
  submitted_at: string | null;
  assigned_at?: string | null;
  due_at?: string | null;
  review_status?: string | null;
  scores?: Record<string, number> | null;
  strengths?: string | null;
  weaknesses?: string | null;
  mandatory_revisions?: string | null;
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

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  manuscript_id: string | null;
  before_status: string | null;
  after_status: string | null;
  metadata: Record<string, unknown>;
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
  criteriaReasons?: Record<string, string>;
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
    p_suggested_reviewers: input.suggestedReviewers ?? [],
    p_criteria_reasons: input.criteriaReasons ?? {}
  }));

export const assignReviewers = (manuscriptId: string, reviewerIds: [string, string]) =>
  rpcOrThrow(supabase.rpc('assign_reviewers', { p_manuscript_id: manuscriptId, p_reviewer_ids: reviewerIds }));

// ------------------------------------------
// New reviewer suggestion workflow RPCs (Phase 8)
// ------------------------------------------

export interface EditorReviewerActionRow {
  id: string;
  manuscript_id: string;
  suggestion_id: string;
  action: 'ACCEPTED' | 'DECLINED' | 'REPLACED';
  replacement_reviewer_id: string | null;
  decline_reason: string | null;
  coordinator_id: string;
  created_at: string;
}

export type CoordinatorAcceptResult =
  | { status: 'ASSIGNED'; action: EditorReviewerActionRow }
  | { status: 'NEEDS_ACCOUNT'; suggestion_id: string; name: string; email: string; note: string | null };

export const coordinatorAcceptSuggestion = (suggestionId: string) =>
  rpcOrThrow<CoordinatorAcceptResult>(supabase.rpc('coordinator_accept_suggestion', { p_suggestion_id: suggestionId }));

export const coordinatorFinalizeReviewerSuggestion = (suggestionId: string, reviewerId: string) =>
  rpcOrThrow<EditorReviewerActionRow>(supabase.rpc('coordinator_finalize_reviewer_suggestion', { p_suggestion_id: suggestionId, p_reviewer_id: reviewerId }));

export const coordinatorReactivateReviewer = (profileId: string) =>
  rpcOrThrow<ProfileRow>(supabase.rpc('coordinator_reactivate_reviewer', { p_profile_id: profileId }));

export const coordinatorDeclineSuggestion = (suggestionId: string, reason: string = '') =>
  rpcOrThrow<EditorReviewerActionRow>(supabase.rpc('coordinator_decline_suggestion', { p_suggestion_id: suggestionId, p_reason: reason }));

export const coordinatorReplaceSuggestion = (suggestionId: string, replacementReviewerId: string) =>
  rpcOrThrow<EditorReviewerActionRow>(supabase.rpc('coordinator_replace_suggestion', { p_suggestion_id: suggestionId, p_replacement_reviewer_id: replacementReviewerId }));

export const coordinatorAssignReviewerDirectly = (manuscriptId: string, reviewerId: string) =>
  rpcOrThrow<ReviewerAssignmentRow>(supabase.rpc('coordinator_assign_reviewer_directly', { p_manuscript_id: manuscriptId, p_reviewer_id: reviewerId }));

export const finalizeReviewerBoard = (manuscriptId: string) =>
  rpcOrThrow(supabase.rpc('finalize_reviewer_board', { p_manuscript_id: manuscriptId }));

/** Coordinator-only: replaces a reviewer who declined after the board was
 * already finalized (manuscript status UNDER_REVIEW) -- the pre-finalization
 * replacement RPCs (coordinator_assign_reviewer_directly,
 * coordinator_replace_suggestion) only work at EDITOR_REVIEW. See
 * coordinator_replace_reviewer() in 0024_coordinator_replace_declined_reviewer.sql. */
export const coordinatorReplaceReviewer = (declinedAssignmentId: string, replacementReviewerId: string) =>
  rpcOrThrow<ReviewerAssignmentRow>(supabase.rpc('coordinator_replace_reviewer', { p_declined_assignment_id: declinedAssignmentId, p_replacement_reviewer_id: replacementReviewerId }));

/** Coordinator-only: forwards a submitted revision (manuscript_revisions.status
 * = 'REVISION_SUBMITTED') to the assigned editor for re-review. See
 * coordinator_send_revision_to_editor() in 0018_coordinator_revision_gate.sql. */
export const coordinatorSendRevisionToEditor = (manuscriptId: string) =>
  rpcOrThrow(supabase.rpc('coordinator_send_revision_to_editor', { p_manuscript_id: manuscriptId }));

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
  criteriaReasons?: Record<string, string>;
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
    p_writing_quality: input.writingQuality,
    p_criteria_reasons: input.criteriaReasons ?? {}
  }));

export const submitEditorRecommendation = (
  manuscriptId: string,
  recommendation: ReviewerRecommendation,
  comments?: string,
  checklist?: ChecklistItem[]
) =>
  rpcOrThrow(supabase.rpc('submit_editor_recommendation', {
    p_manuscript_id: manuscriptId,
    p_recommendation: recommendation,
    p_comments: comments ?? null,
    p_checklist: checklist ?? []
  }));

export type PublishDecision = 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT';

export const publishDecision = (manuscriptId: string, decision: PublishDecision, decisionLetter: string) =>
  rpcOrThrow(supabase.rpc('publish_decision', { p_manuscript_id: manuscriptId, p_decision: decision, p_decision_letter: decisionLetter }));

export const submitRevision = (manuscriptId: string, responseNote: string = '') =>
  rpcOrThrow(supabase.rpc('submit_revision', { p_manuscript_id: manuscriptId, p_response_note: responseNote }));

export const markPublished = (manuscriptId: string, doi: string, volume: string, issue: string, publishedPdfUrl?: string) =>
  rpcOrThrow(supabase.rpc('mark_published', {
    p_manuscript_id: manuscriptId, p_doi: doi, p_volume: volume, p_issue: issue,
    p_published_pdf_url: publishedPdfUrl ?? null
  }));

/** Coordinator-only: hand an ACCEPTED manuscript to one specific Publisher
 * account. That Publisher cannot see the manuscript until this has been
 * called (see manuscripts_select RLS -- assigned_publisher_id must match). */
export const sendToPublisher = (manuscriptId: string, publisherId: string) =>
  rpcOrThrow(supabase.rpc('send_to_publisher', { p_manuscript_id: manuscriptId, p_publisher_id: publisherId }));

export async function uploadPublishedGalley(manuscriptId: string, file: File): Promise<string> {
  const path = `${manuscriptId}/published/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage.from('manuscript-files').upload(path, file, { upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data } = supabase.storage.from('manuscript-files').getPublicUrl(path);
  return data.publicUrl;
}

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

export async function getEditorReviewerActions(manuscriptId: string): Promise<EditorReviewerActionRow[]> {
  const { data, error } = await supabase.from('editor_reviewer_actions').select('*').eq('manuscript_id', manuscriptId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStatusHistory(manuscriptId: string): Promise<StatusHistoryRow[]> {
  const { data, error } = await supabase.from('manuscript_status_history').select('*').eq('manuscript_id', manuscriptId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRecentStatusHistory(limit: number = 8): Promise<StatusHistoryRow[]> {
  const { data, error } = await supabase.from('manuscript_status_history').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Coordinator-only (audit_log RLS: audit_log_select_coordinator). Every
 * workflow RPC writes one row here per transition it makes. */
export async function getRecentAuditLog(limit: number = 100): Promise<AuditLogRow[]> {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface OverdueReviewRow {
  id: string;
  manuscript_id: string;
  reviewer_id: string;
  status: 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'SUBMITTED';
  due_date: string;
}

export async function getOverdueReviewerAssignments(): Promise<OverdueReviewRow[]> {
  const { data, error } = await supabase
    .from('reviewer_assignments')
    .select('id, manuscript_id, reviewer_id, status, due_date')
    .in('status', ['INVITED', 'ACCEPTED'])
    .not('due_date', 'is', null)
    .lt('due_date', new Date().toISOString())
    .order('due_date', { ascending: true });
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
  assigned_publisher_id?: string | null;
  submission_step: number;
  editors_notes: string;
  doi: string | null;
  volume: string | null;
  issue: string | null;
  production_stage: 'SENT_TO_PUBLISHER' | 'PUBLISHED' | null;
  published_pdf_url: string | null;
  submitted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  files?: ManuscriptFileRow[];
  section?: string | null;
  manuscript_type?: string | null;
  keywords?: string | null;
  word_count?: string | number | null;
  num_figures?: string | number | null;
  num_tables?: string | number | null;
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
  channel: 'GENERAL' | 'COORDINATOR_AUTHOR';
}

export interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  requested_role?: string | null;
  status: string;
  created_at?: string | null;
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface RevisionRow {
  id: string;
  manuscript_id: string;
  revision_number: number;
  requested_by: string | null;
  decision_letter: string;
  decision_type: 'MINOR_REVISION' | 'MAJOR_REVISION' | null;
  status: string;
  requested_at: string;
  submitted_at: string | null;
  editor_comments: string | null;
  editor_checklist: ChecklistItem[];
  editor_decision: ReviewerRecommendation | null;
  editor_decision_at: string | null;
  coordinator_decision: ReviewerRecommendation | null;
  coordinator_decision_at: string | null;
  coordinator_note: string | null;
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

export async function postDiscussionMessage(manuscriptId: string, senderId: string, message: string, channel: 'GENERAL' | 'COORDINATOR_AUTHOR' = 'GENERAL'): Promise<void> {
  const { error } = await supabase.from('manuscript_discussions').insert({ manuscript_id: manuscriptId, sender_id: senderId, message, channel });
  if (error) throw new Error(error.message);
}

export async function getRevisions(manuscriptId: string): Promise<RevisionRow[]> {
  const { data, error } = await supabase.from('manuscript_revisions').select('*').eq('manuscript_id', manuscriptId).order('revision_number', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Batched latest-revision-per-manuscript lookup for list/table views (e.g.
 * the Coordinator's manuscript queue), so status labels can show
 * "REVISION N -- MINOR/MAJOR REVISION" without an N+1 query per row. */
export async function getLatestRevisionsByManuscriptIds(manuscriptIds: string[]): Promise<Record<string, RevisionRow>> {
  if (manuscriptIds.length === 0) return {};
  const { data, error } = await supabase
    .from('manuscript_revisions')
    .select('*')
    .in('manuscript_id', manuscriptIds)
    .order('revision_number', { ascending: true });
  if (error) throw new Error(error.message);

  const latest: Record<string, RevisionRow> = {};
  (data ?? []).forEach((row: RevisionRow) => {
    latest[row.manuscript_id] = row; // ascending order -> last write wins = highest revision_number
  });
  return latest;
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

export async function uploadRevisionFile(revisionId: string, manuscriptId: string, file: File, fileType: string): Promise<ManuscriptFileRow> {
  const { data: userData } = await supabase.auth.getUser();
  const path = `${manuscriptId}/revisions/${revisionId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage.from('manuscript-files').upload(path, file);
  if (uploadError) throw new Error(uploadError.message);
  const { data: urlData } = supabase.storage.from('manuscript-files').getPublicUrl(path);

  const { data: fileRecord, error: dbError } = await supabase.from('manuscript_files').insert({
    manuscript_id: manuscriptId,
    revision_id: revisionId,
    file_name: file.name,
    file_type: fileType,
    file_size: (file.size / 1024).toFixed(2) + ' KB',
    storage_path: path,
    public_url: urlData.publicUrl,
    uploaded_by: userData.user?.id ?? null
  }).select().single();

  if (dbError) throw new Error(dbError.message);
  return fileRecord as ManuscriptFileRow;
}

export async function deleteManuscriptFile(fileId: string): Promise<void> {
  const { error } = await supabase.from('manuscript_files').delete().eq('id', fileId);
  if (error) throw new Error(error.message);
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
export async function listActiveProfilesByRole(role: 'EDITOR' | 'REVIEWER' | 'PUBLISHER'): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('id, name, email, role, status, created_at').eq('role', role).eq('status', 'ACTIVE').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPendingApprovals(): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('id, name, email, role, requested_role, status').eq('status', 'PENDING_APPROVAL').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Real invited/accepted/completed counts per reviewer, aggregated from reviewer_assignments. */
export async function getReviewerAssignmentCounts(reviewerIds: string[]): Promise<Record<string, { invited: number; accepted: number; completed: number }>> {
  const result: Record<string, { invited: number; accepted: number; completed: number }> = {};
  if (reviewerIds.length === 0) return result;

  const { data, error } = await supabase
    .from('reviewer_assignments')
    .select('reviewer_id, status')
    .in('reviewer_id', Array.from(new Set(reviewerIds)));
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const bucket = (result[row.reviewer_id] ??= { invited: 0, accepted: 0, completed: 0 });
    bucket.invited += 1;
    if (row.status === 'ACCEPTED' || row.status === 'SUBMITTED') bucket.accepted += 1;
    if (row.status === 'SUBMITTED') bucket.completed += 1;
  }
  return result;
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
