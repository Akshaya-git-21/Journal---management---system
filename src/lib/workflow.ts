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
  screening_responses: ScreeningResponse[];
  screening_comments: string | null;
  action_reason: string | null;
  peer_review_comments: string | null;
  assessment_status: 'NOT_STARTED' | 'SUBMITTED';
  assessment_submitted_at: string | null;
  recommendation: ReviewerRecommendation | null;
  recommendation_submitted_at: string | null;
}

export interface ScreeningResponse {
  question_id: string;
  answer: boolean;
  reason: string;
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
  screening_responses: ScreeningResponse[];
  decline_reason: string | null;
  revision_number: number;
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

/** Editor-only: submits the 10-question Initial Editorial Screening
 * questionnaire (Yes/No + mandatory reason per question) + Editor Comments.
 * See submit_editor_screening() in 0025_editor_screening_questionnaire.sql. */
export const submitEditorScreening = (assignmentId: string, responses: ScreeningResponse[], comments: string) =>
  rpcOrThrow<EditorAssignmentRow>(supabase.rpc('submit_editor_screening', {
    p_assignment_id: assignmentId,
    p_responses: responses,
    p_comments: comments
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

/** Editor-only: selects exactly 2 reviewers from the existing Reviewer Board
 * after "Move to Next Stage". Records them as EDITOR suggestions -- the
 * Coordinator sends the actual invitations via coordinatorSendReviewerInvitations.
 * See editor_select_reviewers() in 0026_editor_reviewer_selection.sql. */
export const editorSelectReviewers = (manuscriptId: string, reviewerIds: [string, string]) =>
  rpcOrThrow<SuggestedReviewerRow[]>(supabase.rpc('editor_select_reviewers', { p_manuscript_id: manuscriptId, p_reviewer_ids: reviewerIds }));

/** Coordinator-only: sends invitations for every still-pending Editor-selected
 * reviewer on this manuscript in one action. Manuscript status stays
 * EDITOR_REVIEW until both reviewers accept -- see respond_to_review_invite()
 * in 0026_editor_reviewer_selection.sql. */
export const coordinatorSendReviewerInvitations = (manuscriptId: string) =>
  rpcOrThrow<ReviewerAssignmentRow[]>(supabase.rpc('coordinator_send_reviewer_invitations', { p_manuscript_id: manuscriptId }));

/** Editor-only: selects a single replacement reviewer for a declined slot,
 * within the 2-day replacement window. See editor_select_replacement_reviewer()
 * in 0027_reviewer_replacement_deadline.sql. */
export const editorSelectReplacementReviewer = (declinedAssignmentId: string, replacementReviewerId: string) =>
  rpcOrThrow<SuggestedReviewerRow>(supabase.rpc('editor_select_replacement_reviewer', { p_declined_assignment_id: declinedAssignmentId, p_replacement_reviewer_id: replacementReviewerId }));

/** 2-day reviewer-replacement deadline, derived from the declined
 * assignment's real DB timestamp (not a frontend-only timer). */
export const REPLACEMENT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Shared by the dashboard-wide and per-manuscript replacement alerts so
 * both agree on when a slot actually needs replacing: manuscript still
 * EDITOR_REVIEW OR UNDER_REVIEW (a re-review round is UNDER_REVIEW from the
 * moment the Coordinator sends it to reviewers -- see
 * coordinator_send_revision_to_reviewers() in 0031_reviewer_revision_loop.sql
 * -- so a decline there never has EDITOR_REVIEW to key off of), and fewer
 * than 2 reviewer slots are covered in the CURRENT round once you count both
 * non-declined reviewer assignments AND replacements the Editor has already
 * selected (pending EDITOR suggestions the Coordinator hasn't sent an
 * invitation for yet -- see editor_select_replacement_reviewer() in
 * 0027_reviewer_replacement_deadline.sql). Round-scoped (revision_number) so
 * a decline in one re-review round can never be masked by an earlier round's
 * already-resolved assignments, nor vice versa. Once the Editor picks
 * someone, the alert's job is done; the Coordinator invitation happens
 * separately. Returns the most recently declined assignment IN THE CURRENT
 * ROUND (the one the 2-day window is measured from), or null if no
 * replacement is needed. */
export function getReviewerNeedingReplacement(
  reviewerAssignments: ReviewerAssignmentRow[],
  manuscriptStatus: string,
  pendingReplacementCount: number = 0
): ReviewerAssignmentRow | null {
  if (manuscriptStatus !== 'EDITOR_REVIEW' && manuscriptStatus !== 'UNDER_REVIEW') return null;
  if (reviewerAssignments.length === 0) return null;
  const currentRound = Math.max(...reviewerAssignments.map(r => r.revision_number ?? 0));
  const roundAssignments = reviewerAssignments.filter(r => (r.revision_number ?? 0) === currentRound);
  const activeCount = roundAssignments.filter(r => r.status !== 'DECLINED').length;
  if (activeCount + pendingReplacementCount >= 2) return null;
  const declined = roundAssignments
    .filter(r => r.status === 'DECLINED' && r.responded_at)
    .sort((a, b) => new Date(b.responded_at!).getTime() - new Date(a.responded_at!).getTime());
  return declined[0] || null;
}

/** Unactioned EDITOR-suggested reviewers -- selected by the Editor but not
 * yet turned into an invitation by the Coordinator (see
 * coordinator_send_reviewer_invitations() in 0026_editor_reviewer_selection.sql,
 * which is what stamps an editor_reviewer_actions row onto a suggestion).
 * Pass revisionNumber to scope to a single round (e.g. matching the round
 * getReviewerNeedingReplacement resolved) -- omit it to get every pending
 * suggestion regardless of round. */
export function getPendingEditorSuggestions(
  suggestedReviewers: SuggestedReviewerRow[],
  editorReviewerActions: EditorReviewerActionRow[],
  revisionNumber?: number
): SuggestedReviewerRow[] {
  const actioned = new Set(editorReviewerActions.map(a => a.suggestion_id));
  return suggestedReviewers.filter(s =>
    s.suggested_by === 'EDITOR' && !actioned.has(s.id) &&
    (revisionNumber === undefined || (s.revision_number ?? 0) === revisionNumber)
  );
}

/** Coordinator-only: lazily checks for any reviewer-replacement deadline
 * that has expired with no Editor action taken, and notifies Coordinators
 * exactly once per expired slot (see notify_expired_reviewer_replacements()
 * in 0034_reviewer_replacement_round_isolation.sql -- idempotent, safe to
 * call on every Coordinator page load). Returns how many were notified. */
export const notifyExpiredReviewerReplacements = () =>
  rpcOrThrow<number>(supabase.rpc('notify_expired_reviewer_replacements'));

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

/** Coordinator-only: forwards a submitted PEER_REVIEW-origin revision
 * (manuscript_revisions.origin = 'PEER_REVIEW', status = 'REVISION_SUBMITTED')
 * to the same reviewers who reviewed the prior round, instead of the Editor.
 * See coordinator_send_revision_to_reviewers() in 0031_reviewer_revision_loop.sql. */
export const coordinatorSendRevisionToReviewers = (manuscriptId: string) =>
  rpcOrThrow(supabase.rpc('coordinator_send_revision_to_reviewers', { p_manuscript_id: manuscriptId }));

/** Coordinator-only: releases a completed round of peer reviews to the
 * Editor -- the Editor's decision screen stays locked until this is called.
 * See coordinator_send_reviews_to_editor() in 0041_coordinator_releases_reviews_to_editor.sql. */
export const coordinatorSendReviewsToEditor = (manuscriptId: string) =>
  rpcOrThrow(supabase.rpc('coordinator_send_reviews_to_editor', { p_manuscript_id: manuscriptId }));

/** Reviewer-only: accept/decline a review invitation. Declining requires a
 * reason (see respond_to_review_invite() in 0028_reviewer_peer_review_questionnaire.sql)
 * and feeds the existing 0027 replacement-deadline mechanism unchanged. */
export const respondToReviewInvite = (assignmentId: string, accept: boolean, reason?: string) =>
  rpcOrThrow(supabase.rpc('respond_to_review_invite', { p_assignment_id: assignmentId, p_accept: accept, p_reason: reason ?? null }));

/** Reviewer-only: submits the 10-question peer-review questionnaire
 * (Yes/No + mandatory reason per question), Comments to Author, and a
 * recommendation. See submit_peer_review() in
 * 0028_reviewer_peer_review_questionnaire.sql. */
export const submitPeerReview = (
  assignmentId: string,
  responses: ScreeningResponse[],
  commentsToAuthor: string,
  recommendation: ReviewerRecommendation,
  commentsToEditor: string = ''
) =>
  rpcOrThrow<ReviewerAssignmentRow>(supabase.rpc('submit_peer_review', {
    p_assignment_id: assignmentId,
    p_responses: responses,
    p_comments_to_author: commentsToAuthor,
    p_recommendation: recommendation,
    p_comments_to_editor: commentsToEditor
  }));

export const submitEditorRecommendation = (
  manuscriptId: string,
  recommendation: ReviewerRecommendation,
  comments?: string,
  checklist?: ChecklistItem[],
  reason?: string
) =>
  rpcOrThrow(supabase.rpc('submit_editor_recommendation', {
    p_manuscript_id: manuscriptId,
    p_recommendation: recommendation,
    p_comments: comments ?? null,
    p_checklist: checklist ?? [],
    p_reason: reason ?? null
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

/** Author-only: the Editor's screening comments and Return to Author /
 * Rejection reason for their own manuscript -- editor_assignments has no
 * SELECT policy for the Author at all (it also carries an Editor-to-
 * Coordinator private note), so this reads through a narrow RPC instead of
 * the raw table. See get_author_editor_notes() in
 * 0037_author_editor_notes.sql. */
export async function getAuthorEditorNotes(manuscriptId: string): Promise<{ screening_comments: string | null; action_reason: string | null; recommendation: string | null } | null> {
  const { data, error } = await supabase.rpc('get_author_editor_notes', { p_manuscript_id: manuscriptId });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
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
  /** Computed column (see 0036_standard_display_status.sql) -- the single
   * standardized user-facing status (SUBMITTED / EDITORIAL REVIEW /
   * IN REVISION / PEER REVIEW / ACCEPTED / REJECTED / PROOFREADING /
   * PUBLISHED). Always render this, not `status`, in the UI -- see
   * lib/manuscriptStatusLabel.ts. */
  display_status?: string | null;
  /** Set by coordinator_send_reviews_to_editor() (0041) once the
   * Coordinator forwards a completed round of peer reviews -- the Editor's
   * decision screen stays locked until this is set, cleared automatically
   * whenever a fresh round of reviews starts being collected. */
  reviews_released_at?: string | null;
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
  /** Publication metadata (Task 20) -- entered by the assigned GD Member
   * while READY_FOR_PUBLICATION, validated at publish time. See
   * gd_member_save_publication_metadata() in
   * 0065_final_proof_review_and_publishing.sql. */
  page_numbers: string | null;
  article_url: string | null;
  publication_date: string | null;
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
  revision_number: number;
}

export interface DiscussionRow {
  id: string;
  manuscript_id: string;
  sender_id: string;
  message: string;
  file_name: string | null;
  file_size: string | null;
  created_at: string;
  channel: 'GENERAL' | 'COORDINATOR_AUTHOR' | 'PRODUCTION';
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
  origin: 'EDITOR_SCREENING' | 'PEER_REVIEW';
  author_response: string | null;
}

/** RLS scopes this to whatever the caller is allowed to see: their own
 * manuscripts (Author), assigned ones (Editor/Reviewer), or all (Coordinator). */
export async function listManuscripts(): Promise<ManuscriptRow[]> {
  const { data, error } = await supabase.from('manuscripts').select('*, display_status').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getManuscript(id: string): Promise<ManuscriptRow | null> {
  const { data, error } = await supabase.from('manuscripts').select('*, display_status').eq('id', id).maybeSingle();
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
export async function listActiveProfilesByRole(role: 'EDITOR' | 'REVIEWER' | 'PUBLISHER' | 'GD_MEMBER'): Promise<ProfileRow[]> {
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

let manuscriptsChannelSeq = 0;

// Channel names must be unique per open subscription -- supabase-js throws
// "cannot add postgres_changes callbacks ... after subscribe()" if a second
// .channel() call reuses a topic that's already subscribed. A single fixed
// name broke the moment a nested component (ProductionSection) started
// calling this alongside its parent workspace (CoordinatorWorkspace), which
// already holds one open for the session -- every top-level workspace before
// that had been the only caller in the app at any given time.
export function subscribeToManuscripts(onChange: () => void): () => void {
  const channel = supabase
    .channel(`manuscripts-workflow-changes-${++manuscriptsChannelSeq}`)
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
