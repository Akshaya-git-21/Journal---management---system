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

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.from('workflow_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
  if (error) throw new Error(error.message);
}
