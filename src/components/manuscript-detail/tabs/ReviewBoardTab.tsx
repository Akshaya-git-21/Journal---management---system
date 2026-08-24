import { useState, useEffect } from 'react';
import { ManuscriptRow, SuggestedReviewerRow, ReviewerAssignmentRow, ProfileRow } from '../../../lib/workflow';
import {
  coordinatorAcceptSuggestion, coordinatorDeclineSuggestion, coordinatorReplaceSuggestion,
  coordinatorAssignReviewerDirectly, finalizeReviewerBoard, getEditorReviewerActions,
  coordinatorFinalizeReviewerSuggestion, approveUserRole, coordinatorReactivateReviewer,
  coordinatorReplaceReviewer, coordinatorSendReviewerInvitations, REPLACEMENT_WINDOW_MS
} from '../../../lib/workflow';
import { createReviewerAccount } from '../../../lib/auth';
import { Plus, AlertCircle, Loader2, CheckCircle, Star, XCircle, RefreshCw, UserPlus, Send } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const generateTempPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  return Array.from({ length: 12 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
};

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
  const [sendingInvitations, setSendingInvitations] = useState(false);
  const [showReplaceDeclinedModal, setShowReplaceDeclinedModal] = useState<string | null>(null);
  const [declinedReplacementId, setDeclinedReplacementId] = useState<string | null>(null);

  // Accept-a-new-reviewer flow: suggestion accepted but no matching account exists yet
  const [needsAccount, setNeedsAccount] = useState<{ suggestionId: string; name: string; email: string; note: string | null } | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', email: '', note: '', password: '' });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

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
      const result = await coordinatorAcceptSuggestion(suggestionId);
      if (result.status === 'NEEDS_ACCOUNT') {
        setNeedsAccount({
          suggestionId: result.suggestion_id,
          name: result.name,
          email: result.email,
          note: result.note
        });
        setAccountForm({
          name: result.name,
          email: result.email,
          note: result.note || '',
          password: generateTempPassword()
        });
        return;
      }
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

  // Create the reviewer account for a suggestion that had no matching profile,
  // then finalize the acceptance against the (new or pre-existing) reviewer.
  const handleCreateReviewerAccount = async () => {
    if (!needsAccount) return;

    const name = accountForm.name.trim();
    const email = accountForm.email.trim().toLowerCase();
    const note = accountForm.note.trim();
    const password = accountForm.password.trim();

    if (!name) { setError('Please enter the reviewer name.'); return; }
    if (!email) { setError('Please enter the reviewer email.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters long.'); return; }

    setCreatingAccount(true);
    setError('');

    try {
      let profileId: string | null = null;
      let issuedPassword: string | null = null;
      let freshlyCreated = false;

      try {
        await createReviewerAccount(email, password, name, note);
        issuedPassword = password;
        freshlyCreated = true;

        // The profile row is created asynchronously by the signup trigger -- poll for it.
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const { data } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
          if (data) {
            profileId = data.id;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 400));
        }

        if (!profileId) {
          throw new Error('Reviewer account was created but the profile has not appeared yet. Please try again in a moment.');
        }
      } catch (createError: any) {
        const alreadyRegistered = /already.*(registered|exists|in use)/i.test(createError.message || '');
        if (!alreadyRegistered) throw createError;

        // The auth account already exists (e.g. an earlier attempt that never
        // got approved, or was previously declined) -- resolve the existing
        // profile and proceed directly to assignment/invitation instead of
        // failing. No new password is set for a pre-existing account.
        freshlyCreated = false;
        issuedPassword = null;
        const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
        if (!existing) {
          throw new Error('An account with this email already exists in authentication, but no matching profile was found. Please contact support.');
        }
        profileId = existing.id;
      }

      // Activate the resolved profile as a reviewer. A freshly created account
      // is always PENDING_APPROVAL, so the normal approval path applies; a
      // pre-existing account may be in any other status (e.g. REJECTED from
      // an earlier decision), so it needs the broader reactivation path that
      // works regardless of current status.
      if (freshlyCreated) {
        await approveUserRole(profileId, true);
      } else {
        await coordinatorReactivateReviewer(profileId);
      }
      await coordinatorFinalizeReviewerSuggestion(needsAccount.suggestionId, profileId);

      setActions(prev => [...prev, { suggestion_id: needsAccount.suggestionId, action: 'ACCEPTED' }]);
      setNeedsAccount(null);
      if (issuedPassword) {
        setCreatedCredentials({ email, password: issuedPassword });
      } else {
        setSuccess('Existing account resolved -- reviewer assigned to this manuscript and invitation sent.');
        setTimeout(() => setSuccess(''), 4000);
      }
      onDataChange();
    } catch (e: any) {
      setError(e.message || 'Failed to create the reviewer account');
    } finally {
      setCreatingAccount(false);
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

  // Handle replacing a reviewer who declined after the board was already
  // finalized (manuscript already UNDER_REVIEW) -- coordinatorAssignReviewerDirectly
  // and coordinatorReplaceSuggestion only work pre-finalization.
  const handleReplaceDeclinedReviewer = async (declinedAssignmentId: string) => {
    if (!declinedReplacementId) {
      setError('Please select a replacement reviewer');
      return;
    }

    setError('');
    setProcessing(declinedAssignmentId);

    try {
      await coordinatorReplaceReviewer(declinedAssignmentId, declinedReplacementId);
      setShowReplaceDeclinedModal(null);
      setDeclinedReplacementId(null);
      setSuccess('Replacement reviewer invited');
      setTimeout(() => setSuccess(''), 3000);
      onDataChange();
    } catch (e: any) {
      setError(e.message || 'Failed to replace reviewer');
    } finally {
      setProcessing(null);
    }
  };

  // Handle sending invitations for the 2 reviewers the Editor selected
  // (via "Move to Next Stage") -- a single action instead of Accept-ing
  // each suggestion individually. See coordinator_send_reviewer_invitations()
  // in 0026_editor_reviewer_selection.sql.
  const handleSendInvitations = async () => {
    setError('');
    setSendingInvitations(true);
    try {
      await coordinatorSendReviewerInvitations(manuscript.id);
      setSuccess('Invitations sent. The manuscript stays in Editorial Review until both reviewers accept.');
      setTimeout(() => setSuccess(''), 4000);
      onDataChange();
    } catch (e: any) {
      setError(e.message || 'Failed to send invitations');
    } finally {
      setSendingInvitations(false);
    }
  };

  // Handle finalize board
  const handleFinalize = async () => {
    if (assignedCount !== 2) {
      setError(`Must have exactly 2 reviewers assigned. Currently: ${assignedCount}`);
      return;
    }

    if (!window.confirm('Confirm finalizing the reviewer board? This will move the manuscript forward (to Peer Review, or straight to Awaiting Decision if both reviews are already in).')) {
      return;
    }

    setError('');
    setFinalizing(true);

    try {
      await finalizeReviewerBoard(manuscript.id);
      setSuccess('✓ Reviewer board finalized.');
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

      {/* Editor Selected Reviewers -- exactly 2 pending, from "Move to Next
          Stage". A single Send Invitation action, per the reviewer-selection
          workflow (0026), instead of the per-suggestion Accept/Decline/Replace
          UI below (which still exists for the pre-existing ad-hoc suggestion
          path -- odd counts, or suggestions already partially actioned). */}
      {manuscript.status === 'EDITOR_REVIEW' && editorSuggestions.filter(s => getSuggestionStatus(s.id) === 'PENDING').length === 2 && (
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-black text-slate-900">Reviewers Selected by Editor</h3>
          </div>
          <div className="space-y-2">
            {editorSuggestions.filter(s => getSuggestionStatus(s.id) === 'PENDING').map((s, idx) => (
              <div key={s.id} className="border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Reviewer {idx + 1}</p>
                <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-600">{s.email}</p>
              </div>
            ))}
          </div>
          <button
            onClick={handleSendInvitations}
            disabled={sendingInvitations}
            className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition flex items-center justify-center gap-2"
          >
            {sendingInvitations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Invitation
          </button>
          <p className="text-[11px] text-slate-500">
            The manuscript stays in Editorial Review until both reviewers accept — it only moves to Peer Review once both have.
          </p>
        </div>
      )}

      {/* Editor Suggested Reviewers -- the 2 selections already shown above
          (via Send Invitation) are excluded here to avoid showing the same
          pending pair twice; this list still covers everything else
          (already actioned suggestions, or the older ad-hoc suggestion path). */}
      {(() => {
        const showSimplifiedInvite = manuscript.status === 'EDITOR_REVIEW' && editorSuggestions.filter(s => getSuggestionStatus(s.id) === 'PENDING').length === 2;
        const visibleEditorSuggestions = showSimplifiedInvite
          ? editorSuggestions.filter(s => getSuggestionStatus(s.id) !== 'PENDING')
          : editorSuggestions;
        if (visibleEditorSuggestions.length === 0) return null;
        return (
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            <h3 className="text-sm font-black text-slate-900">Suggested Reviewers ({visibleEditorSuggestions.length})</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">Reviewers suggested by the editor. Accept to create an account and send an invitation, or choose from Available Reviewers below instead.</p>

          <div className="space-y-3">
            {visibleEditorSuggestions.map(suggestion => {
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
        );
      })()}

      {/* Assigned Reviewers */}
      {assignedCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Assigned Reviewers ({assignedCount})</h3>
          <div className="space-y-3">
            {reviewerAssignments.map((assignment, idx) => {
              const reviewer = profiles[assignment.reviewer_id];
              const isDeclined = assignment.status === 'DECLINED';
              // At EDITOR_REVIEW, replacing is the Editor's job for the first
              // 2 days after a decline (see ReviewerReplacementAlert.tsx) --
              // the Coordinator only steps in as a fallback once that
              // deadline has passed. At UNDER_REVIEW (peer review already
              // started), the Coordinator could always replace immediately;
              // unchanged from 0024.
              const replacementDeadlinePassed = !!assignment.responded_at &&
                Date.now() - new Date(assignment.responded_at).getTime() > REPLACEMENT_WINDOW_MS;
              const canReplace = isDeclined && (
                manuscript.status === 'UNDER_REVIEW' ||
                (manuscript.status === 'EDITOR_REVIEW' && replacementDeadlinePassed)
              );
              const awaitingEditorReplacement = isDeclined && manuscript.status === 'EDITOR_REVIEW' && !replacementDeadlinePassed;
              return (
                <div key={assignment.id} className={`border rounded-lg p-4 ${isDeclined ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{reviewer?.name}</p>
                      <p className="text-xs text-slate-600">{reviewer?.email}</p>
                      <p className={`text-xs mt-1 font-bold ${isDeclined ? 'text-red-700' : 'text-emerald-700'}`}>Status: {assignment.status}</p>
                    </div>
                    {isDeclined ? <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
                  </div>

                  {canReplace && (
                    <div className="mt-3 pt-3 border-t border-red-200">
                      {showReplaceDeclinedModal === assignment.id ? (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-700">Select Replacement Reviewer:</p>
                          <select
                            value={declinedReplacementId || ''}
                            onChange={(e) => setDeclinedReplacementId(e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                          >
                            <option value="">-- Select a reviewer --</option>
                            {availableReviewers
                              .filter(r => !assignedReviewerIds.has(r.id))
                              .map(r => (
                                <option key={r.id} value={r.id}>{r.name} ({r.email})</option>
                              ))}
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReplaceDeclinedReviewer(assignment.id)}
                              disabled={!declinedReplacementId || processing === assignment.id}
                              className="text-xs px-3 py-1 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50"
                            >
                              {processing === assignment.id ? 'Replacing...' : 'Confirm Replacement'}
                            </button>
                            <button
                              onClick={() => { setShowReplaceDeclinedModal(null); setDeclinedReplacementId(null); }}
                              className="text-xs px-3 py-1 border border-slate-300 text-slate-700 rounded font-bold hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowReplaceDeclinedModal(assignment.id)}
                          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Replace Reviewer
                        </button>
                      )}
                    </div>
                  )}

                  {awaitingEditorReplacement && (
                    <p className="text-xs text-amber-700 mt-3 pt-3 border-t border-red-200">
                      Awaiting the Editor to select a replacement (2-day window). You'll be able to assign one directly after that.
                    </p>
                  )}

                  {(assignment.invited_at || assignment.responded_at || assignment.submitted_at) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3 pt-3 border-t border-emerald-200">
                      {assignment.invited_at && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Invited At</p>
                          <p className="text-slate-700">{new Date(assignment.invited_at).toLocaleDateString()}</p>
                        </div>
                      )}
                      {assignment.responded_at && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Responded At</p>
                          <p className="text-slate-700">{new Date(assignment.responded_at).toLocaleDateString()}</p>
                        </div>
                      )}
                      {assignment.submitted_at && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Submitted At</p>
                          <p className="text-slate-700">{new Date(assignment.submitted_at).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Reviewers for Direct Assignment */}
      {assignedCount < 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-1">Available Reviewers</h3>
          <p className="text-xs text-slate-500 mb-4">Existing reviewer accounts. Assign directly to invite them — no account creation needed.</p>
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

      {/* Finalize Button -- required to move the manuscript out of EDITOR_REVIEW;
          also the recovery path if reviews were already submitted before this
          was clicked (fixed server-side to skip straight to Awaiting Decision
          in that case instead of leaving the manuscript stuck). */}
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
              Confirm Reviewer Assignments & Continue
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

      {/* Reviewer Account Required modal */}
      {needsAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-black text-slate-900">Reviewer Account Required</h3>
            </div>

            <p className="text-sm text-slate-700 mb-4">
              This reviewer has been accepted by the Coordinator but does not have an account yet.
              Set a password and create the account to continue.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 space-y-2">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Name</p>
                <p className="text-sm text-slate-900">{accountForm.name}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email</p>
                <p className="text-sm text-slate-900">{accountForm.email}</p>
              </div>
              {accountForm.note && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Expertise / Note</p>
                  <p className="text-sm text-slate-900">{accountForm.note}</p>
                </div>
              )}
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Password</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={accountForm.password}
                    onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setAccountForm({ ...accountForm, password: generateTempPassword() })}
                    className="px-3 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition"
                  >
                    Generate
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">At least 6 characters. Share this with the reviewer after creating the account.</p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mb-4">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleCreateReviewerAccount}
                disabled={creatingAccount}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition"
              >
                {creatingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
                {creatingAccount ? 'Creating...' : 'Create Reviewer Account'}
              </button>
              <button
                onClick={() => { setNeedsAccount(null); setError(''); }}
                disabled={creatingAccount}
                className="px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials confirmation modal */}
      {createdCredentials && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <h3 className="text-lg font-black text-slate-900">Reviewer Account Created</h3>
            </div>
            <p className="text-sm text-slate-700 mb-4">
              The account was created and this reviewer has been assigned to the manuscript.
              Share these temporary sign-in credentials with them:
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 space-y-2 font-mono text-sm">
              <p><span className="text-slate-500">Email:</span> {createdCredentials.email}</p>
              <p><span className="text-slate-500">Password:</span> {createdCredentials.password}</p>
            </div>
            <button
              onClick={() => setCreatedCredentials(null)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold py-2.5 rounded-lg transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
