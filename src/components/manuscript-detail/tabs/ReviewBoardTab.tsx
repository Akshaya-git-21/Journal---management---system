import { useState, useEffect } from 'react';
import { ManuscriptRow, SuggestedReviewerRow, ReviewerAssignmentRow, ProfileRow } from '../../../lib/workflow';
import {
  coordinatorAcceptSuggestion, coordinatorDeclineSuggestion, coordinatorReplaceSuggestion,
  coordinatorAssignReviewerDirectly, finalizeReviewerBoard, getEditorReviewerActions
} from '../../../lib/workflow';
import { Plus, AlertCircle, Loader2, CheckCircle, Star, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Props {
  manuscript: ManuscriptRow;
  suggestedReviewers: SuggestedReviewerRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  profiles: Record<string, ProfileRow>;
  onDataChange: () => void;
}

interface ReviewerAction {
  suggestion_id: string;
  action: 'ACCEPTED' | 'DECLINED' | 'REPLACED';
  replacement_reviewer_id?: string;
}

export function ReviewBoardTab({
  manuscript,
  suggestedReviewers,
  reviewerAssignments,
  profiles,
  onDataChange
}: Props) {
  const [availableReviewers, setAvailableReviewers] = useState<ProfileRow[]>([]);
  const [loadingReviewers, setLoadingReviewers] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [actions, setActions] = useState<ReviewerAction[]>([]);
  const [showDeclineReason, setShowDeclineReason] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showReplaceModal, setShowReplaceModal] = useState<string | null>(null);
  const [replacementReviewerId, setReplacementReviewerId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const assignedReviewerIds = new Set(reviewerAssignments.map(r => r.reviewer_id));
  const assignedCount = reviewerAssignments.length;

  // Load available reviewers and existing actions
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingReviewers(true);

        // Load available reviewers
        const { data: reviewers, error: err } = await supabase
          .from('profiles')
          .select('id, name, email, role, status')
          .eq('role', 'REVIEWER')
          .eq('status', 'ACTIVE')
          .order('name');

        if (err) throw err;
        setAvailableReviewers(reviewers || []);

        // Load existing coordinator actions
        const existingActions = await getEditorReviewerActions(manuscript.id);
        setActions(existingActions);
      } catch (e: any) {
        console.error('Failed to load reviewers:', e);
        setError('Failed to load available reviewers');
      } finally {
        setLoadingReviewers(false);
      }
    };

    loadData();
  }, [manuscript.id]);

  // Determine suggestion status from actions
  const getSuggestionStatus = (suggestionId: string) => {
    const action = actions.find(a => a.suggestion_id === suggestionId);
    return action?.action || 'PENDING';
  };

  // Get suggested reviewers that were actually persisted by editor
  const editorSuggestions = suggestedReviewers.filter(s => s.suggested_by === 'EDITOR');

  // Handle accept suggestion
  const handleAccept = async (suggestionId: string) => {
    setError('');
    setProcessing(suggestionId);

    try {
      await coordinatorAcceptSuggestion(suggestionId);
      setActions(prev => [...prev, { suggestion_id: suggestionId, action: 'ACCEPTED' }]);
      setSuccess('Reviewer suggestion accepted and assigned');
      setTimeout(() => setSuccess(''), 3000);
      onDataChange();
    } catch (e: any) {
      setError(e.message || 'Failed to accept suggestion');
    } finally {
      setProcessing(null);
    }
  };

  // Handle decline suggestion
  const handleDecline = async (suggestionId: string) => {
    setError('');
    setProcessing(suggestionId);

    try {
      await coordinatorDeclineSuggestion(suggestionId, declineReason);
      setActions(prev => [...prev, { suggestion_id: suggestionId, action: 'DECLINED' }]);
      setShowDeclineReason(null);
      setDeclineReason('');
      setSuccess('Reviewer suggestion declined');
      setTimeout(() => setSuccess(''), 3000);
      onDataChange();
    } catch (e: any) {
      setError(e.message || 'Failed to decline suggestion');
    } finally {
      setProcessing(null);
    }
  };

  // Handle replace suggestion
  const handleReplace = async (suggestionId: string) => {
    if (!replacementReviewerId) {
      setError('Please select a replacement reviewer');
      return;
    }

    setError('');
    setProcessing(suggestionId);

    try {
      await coordinatorReplaceSuggestion(suggestionId, replacementReviewerId as any);
      setActions(prev => [...prev, { suggestion_id: suggestionId, action: 'REPLACED', replacement_reviewer_id: replacementReviewerId }]);
      setShowReplaceModal(null);
      setReplacementReviewerId(null);
      setSuccess('Reviewer suggestion replaced');
      setTimeout(() => setSuccess(''), 3000);
      onDataChange();
    } catch (e: any) {
      setError(e.message || 'Failed to replace suggestion');
    } finally {
      setProcessing(null);
    }
  };

  // Handle direct assignment
  const handleDirectAssign = async (reviewerId: string) => {
    setError('');
    setProcessing(reviewerId);

    try {
      await coordinatorAssignReviewerDirectly(manuscript.id, reviewerId as any);
      setSuccess('Reviewer assigned directly');
      setTimeout(() => setSuccess(''), 3000);
      onDataChange();
    } catch (e: any) {
      setError(e.message || 'Failed to assign reviewer');
    } finally {
      setProcessing(null);
    }
  };

  // Handle finalize board
  const handleFinalize = async () => {
    if (assignedCount !== 2) {
      setError(`Must have exactly 2 reviewers assigned. Currently: ${assignedCount}`);
      return;
    }

    if (!window.confirm('Confirm finalizing the reviewer board? This will transition the manuscript to Peer Review.')) {
      return;
    }

    setError('');
    setFinalizing(true);

    try {
      await finalizeReviewerBoard(manuscript.id);
      setSuccess('✓ Reviewer board finalized. Manuscript transitioned to Peer Review.');
      setTimeout(() => {
        onDataChange();
        setSuccess('');
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to finalize reviewer board');
    } finally {
      setFinalizing(false);
    }
  };

  const canFinalize = assignedCount === 2 && manuscript.status === 'EDITOR_REVIEW';

  return (
    <div className="space-y-6">
      {/* Assignment Status */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4">Reviewer Assignment Status</h3>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-3xl font-black text-slate-900">{assignedCount} / 2</p>
            <p className="text-xs text-slate-600 mt-1">Reviewers Assigned</p>
          </div>
          {assignedCount === 2 && (
            <div className="text-right">
              <CheckCircle className="w-8 h-8 text-emerald-600 mb-2" />
              <p className="text-xs font-bold text-emerald-700">Ready to Finalize</p>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      {/* Editor Suggested Reviewers */}
      {editorSuggestions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            <h3 className="text-sm font-black text-slate-900">Editor Suggested Reviewers ({editorSuggestions.length})</h3>
          </div>

          <div className="space-y-3">
            {editorSuggestions.map(suggestion => {
              const status = getSuggestionStatus(suggestion.id);
              const isAssigned = reviewerAssignments.some(r => r.reviewer_id === suggestion.id);

              return (
                <div key={suggestion.id} className={`border rounded-lg p-4 ${
                  status === 'ACCEPTED' ? 'bg-emerald-50 border-emerald-200' :
                  status === 'DECLINED' ? 'bg-red-50 border-red-200' :
                  status === 'REPLACED' ? 'bg-blue-50 border-blue-200' :
                  'border-slate-200'
                }`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900">{suggestion.name}</p>
                        {status === 'ACCEPTED' && (
                          <span className="text-xs px-2 py-0.5 bg-emerald-200 text-emerald-700 rounded-full font-bold">✓ Accepted</span>
                        )}
                        {status === 'DECLINED' && (
                          <span className="text-xs px-2 py-0.5 bg-red-200 text-red-700 rounded-full font-bold">✕ Declined</span>
                        )}
                        {status === 'REPLACED' && (
                          <span className="text-xs px-2 py-0.5 bg-blue-200 text-blue-700 rounded-full font-bold">↻ Replaced</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">{suggestion.email}</p>
                      {suggestion.note && <p className="text-xs text-slate-500 mt-1">Expertise: {suggestion.note}</p>}
                    </div>
                  </div>

                  {status === 'PENDING' && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleAccept(suggestion.id)}
                        disabled={processing === suggestion.id}
                        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-1"
                      >
                        {processing === suggestion.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Accept & Assign
                      </button>

                      <button
                        onClick={() => setShowDeclineReason(suggestion.id)}
                        disabled={processing === suggestion.id}
                        className="text-xs px-3 py-1.5 bg-red-600 text-white rounded font-bold hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-1"
                      >
                        {processing === suggestion.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                        Decline
                      </button>

                      <button
                        onClick={() => setShowReplaceModal(suggestion.id)}
                        disabled={processing === suggestion.id}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1"
                      >
                        {processing === suggestion.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Replace
                      </button>
                    </div>
                  )}

                  {/* Decline reason modal */}
                  {showDeclineReason === suggestion.id && (
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                      <textarea
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Optional reason for declining (will not be shared with reviewer)"
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:border-red-500"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDecline(suggestion.id)}
                          disabled={processing === suggestion.id}
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded font-bold hover:bg-red-700 disabled:opacity-50"
                        >
                          {processing === suggestion.id ? 'Declining...' : 'Confirm Decline'}
                        </button>
                        <button
                          onClick={() => {
                            setShowDeclineReason(null);
                            setDeclineReason('');
                          }}
                          className="text-xs px-3 py-1 border border-slate-300 text-slate-700 rounded font-bold hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Replace modal */}
                  {showReplaceModal === suggestion.id && (
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                      <p className="text-xs font-bold text-slate-700">Select Replacement Reviewer:</p>
                      <select
                        value={replacementReviewerId || ''}
                        onChange={(e) => setReplacementReviewerId(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Select a reviewer --</option>
                        {availableReviewers
                          .filter(r => !assignedReviewerIds.has(r.id) && r.email !== suggestion.email)
                          .map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.email})</option>
                          ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReplace(suggestion.id)}
                          disabled={!replacementReviewerId || processing === suggestion.id}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50"
                        >
                          {processing === suggestion.id ? 'Replacing...' : 'Confirm Replacement'}
                        </button>
                        <button
                          onClick={() => {
                            setShowReplaceModal(null);
                            setReplacementReviewerId(null);
                          }}
                          className="text-xs px-3 py-1 border border-slate-300 text-slate-700 rounded font-bold hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assigned Reviewers */}
      {assignedCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Assigned Reviewers ({assignedCount})</h3>
          <div className="space-y-3">
            {reviewerAssignments.map((assignment, idx) => {
              const reviewer = profiles[assignment.reviewer_id];
              return (
                <div key={assignment.id} className="border border-emerald-200 bg-emerald-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{reviewer?.name}</p>
                      <p className="text-xs text-slate-600">{reviewer?.email}</p>
                      <p className="text-xs text-emerald-700 mt-1 font-bold">Status: {assignment.status}</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Reviewers for Direct Assignment */}
      {assignedCount < 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Available Reviewers</h3>
          {loadingReviewers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-slate-600 mr-2" />
              <p className="text-sm text-slate-600">Loading reviewers...</p>
            </div>
          ) : availableReviewers.length === 0 ? (
            <p className="text-sm text-slate-600">No reviewers available</p>
          ) : (
            <div className="space-y-2">
              {availableReviewers
                .filter(r => !assignedReviewerIds.has(r.id))
                .map(reviewer => (
                  <div key={reviewer.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{reviewer.name}</p>
                      <p className="text-xs text-slate-600">{reviewer.email}</p>
                    </div>
                    <button
                      onClick={() => handleDirectAssign(reviewer.id)}
                      disabled={processing === reviewer.id}
                      className="text-xs px-3 py-1.5 bg-slate-600 text-white rounded font-bold hover:bg-slate-700 disabled:opacity-50 transition flex items-center gap-1"
                    >
                      {processing === reviewer.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Assign
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Finalize Button */}
      {manuscript.status === 'EDITOR_REVIEW' && (
        <button
          onClick={handleFinalize}
          disabled={!canFinalize || finalizing}
          className={`w-full px-6 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2 ${
            canFinalize
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
          }`}
        >
          {finalizing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Finalizing...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Confirm Reviewer Assignments & Transition to Peer Review
            </>
          )}
        </button>
      )}

      {/* Already Finalized Message */}
      {manuscript.status !== 'EDITOR_REVIEW' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="font-bold text-emerald-700">Reviewer Board Finalized</p>
          <p className="text-sm text-emerald-600 mt-1">This manuscript has moved to Peer Review status</p>
        </div>
      )}
    </div>
  );
}
