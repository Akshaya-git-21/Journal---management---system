import { useState, useEffect } from 'react';
import { ManuscriptRow, SuggestedReviewerRow, ReviewerAssignmentRow, ProfileRow } from '../../../lib/workflow';
import {
  coordinatorAcceptSuggestion,
  getEditorReviewerActions,
  coordinatorFinalizeReviewerSuggestion, approveUserRole, coordinatorReactivateReviewer,
  coordinatorSendReviewerInvitations,
  coordinatorSetReviewerPool, getManuscriptReviewerPool, coordinatorSendReviewerReminder,
  coordinatorRequestReviewerReplacement
} from '../../../lib/workflow';
import { getReviewerDisplayStatus, reviewerNeedsReplacement } from '../../../lib/reviewerStatus';
import { formatTimelineDate } from '../../../lib/dateFormat';
import { defaultReviewTimeline } from '../../../lib/settings';
import { createReviewerAccount } from '../../../lib/auth';
import { AlertCircle, Loader2, CheckCircle, Star, XCircle, RefreshCw, UserPlus, Send, Bell } from 'lucide-react';
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
  // Module 102 -- Review Timeline required before "Accept & Assign"/"Add"
  // actually invites the reviewer, same as every other invitation path.
  // Shared between the direct-accept and needs-account flows so the dates
  // only have to be entered once.
  const [showAcceptTimeline, setShowAcceptTimeline] = useState<string | null>(null);
  const [acceptTimelineStart, setAcceptTimelineStart] = useState(() => defaultReviewTimeline().start);
  const [acceptTimelineEnd, setAcceptTimelineEnd] = useState(() => defaultReviewTimeline().end);
  const [sendingInvitations, setSendingInvitations] = useState(false);

  // The Coordinator no longer invites reviewers directly from this list --
  // they select candidates and send the list to the Editor, who picks who
  // actually gets invited (same pool mechanism as OverviewTab.tsx's
  // "Available Reviewers for the Editor" panel, see
  // 0087_coordinator_reviewer_pool.sql).
  const [selectedPoolReviewerIds, setSelectedPoolReviewerIds] = useState<string[]>([]);
  const [sendingPoolToEditor, setSendingPoolToEditor] = useState(false);
  // Persisted signal (not a local "just clicked" flag that forgets itself on
  // remount/tab-switch) -- true the moment a pool actually exists for this
  // manuscript, whether sent moments ago or in an earlier session, so the
  // Send button stays gone for good once used.
  const [poolAlreadySent, setPoolAlreadySent] = useState(false);
  const [poolError, setPoolError] = useState('');
  // Fires right at the click, alongside poolAlreadySent -- so there's an
  // unmissable confirmation the instant Send succeeds, not just the button
  // silently swapping to its "already sent" look.
  const [justSentPool, setJustSentPool] = useState(false);

  // Module 98 -- the Review Timeline (deadline) the Coordinator must set
  // alongside sending the invitations, exactly like the Editorial Timeline
  // required when assigning the Editor.
  const [reviewTimelineStart, setReviewTimelineStart] = useState(() => defaultReviewTimeline().start);
  const [reviewTimelineEnd, setReviewTimelineEnd] = useState(() => defaultReviewTimeline().end);
  const [sendingReminderFor, setSendingReminderFor] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState('');

  // Module 104 -- "Request Replacement": the Coordinator's only lever once a
  // reviewer has declined or gone overdue. This never picks the replacement
  // itself -- it just asks the Editor to (for a decline, the Editor is
  // already auto-alerted via ReviewerReplacementAlert; for overdue, this
  // click is what unlocks the Editor's picker for that specific row, via
  // replacement_requested_at).
  const [requestingReplacementFor, setRequestingReplacementFor] = useState<string | null>(null);
  // Scoped to the specific assignment the error came from -- a shared string
  // would render under every reviewer card that needs a replacement, not
  // just the one that was actually clicked.
  const [requestReplacementError, setRequestReplacementError] = useState<{ id: string; message: string } | null>(null);

  // Accept-a-new-reviewer flow: suggestion accepted but no matching account exists yet
  const [needsAccount, setNeedsAccount] = useState<{ suggestionId: string; name: string; email: string; note: string | null } | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', email: '', note: '', password: '' });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  const assignedReviewerIds = new Set(reviewerAssignments.map(r => r.reviewer_id));
  // A declined assignment no longer occupies its slot -- counting every row
  // ever created (including declined ones) let this read "4 / 2" instead of
  // reflecting how many of the 2 slots are actually still filled.
  const assignedCount = reviewerAssignments.filter(r => r.status !== 'DECLINED').length;
  // A decline reopens the slot it occupied -- the "already sent, locked"
  // state from an earlier send must not block the Coordinator from sending
  // fresh candidates to fill it, otherwise the Editor's replacement queue
  // could never get topped up once the original pool was fully exhausted.
  const needsReplacementCandidates = reviewerAssignments.some(r => r.status === 'DECLINED');

  // Load available reviewers and existing actions
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingReviewers(true);

        // Load available reviewers
        const { data: reviewers, error: err } = await supabase
          .from('profiles')
          .select('id, name, email, role, status, metadata')
          .eq('role', 'REVIEWER')
          .eq('status', 'ACTIVE')
          .order('name');

        if (err) throw err;
        setAvailableReviewers(reviewers || []);

        // Load existing coordinator actions
        const existingActions = await getEditorReviewerActions(manuscript.id);
        setActions(existingActions);

        // Pre-check whoever's already in the pool sent to the Editor, and
        // treat a non-empty pool as "already sent" so the button doesn't
        // reappear after navigating away and back.
        const pool = await getManuscriptReviewerPool(manuscript.id);
        setSelectedPoolReviewerIds(pool.map((r) => r.id));
        if (pool.length > 0) setPoolAlreadySent(true);
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

  // "ACCEPTED" from getSuggestionStatus only means the Coordinator accepted
  // the editor's *suggestion* and sent an invitation (coordinatorAcceptSuggestion)
  // -- it says nothing about whether that reviewer has actually responded.
  // reviewer_assignments doesn't carry a suggestion_id back-reference, so the
  // only way to find the resulting invitation is by matching the suggestion's
  // email to a profile, then that profile's id to a reviewer_assignments row.
  const getReviewerAssignmentForSuggestion = (suggestion: SuggestedReviewerRow) => {
    const profileId = Object.values(profiles).find(p => p.email.toLowerCase() === suggestion.email.toLowerCase())?.id;
    return profileId ? reviewerAssignments.find(r => r.reviewer_id === profileId) : undefined;
  };

  // Get suggested reviewers that were actually persisted by editor
  const editorSuggestions = suggestedReviewers.filter(s => s.suggested_by === 'EDITOR');

  // Module 106: once the Editor has picked an ACTUAL replacement FOR THIS
  // SPECIFIC suggestion's assignment (matched precisely via
  // replaces_assignment_id), that original slot is superseded. Show it as
  // "Replaced" (grey) instead of its stale ACCEPTED/Invited/Declined badge,
  // same treatment as the Editor's own "Reviewers Selected" card
  // (EditorReviewerSelection.tsx). Matched precisely rather than guessed
  // from a round-wide count -- a count breaks the moment two reviewers in
  // the same round need replacing and only one has a pick so far.
  const isSupersededByReplacement = (suggestion: SuggestedReviewerRow) => {
    const ra = getReviewerAssignmentForSuggestion(suggestion);
    if (!ra) return false;
    return editorSuggestions.some(other => other.id !== suggestion.id && other.replaces_assignment_id === ra.id);
  };

  // Handle accept suggestion -- called only once a Review Timeline has been
  // set (see the inline date picker triggered by "Accept & Assign"/"Add").
  const handleAccept = async (suggestionId: string) => {
    if (!acceptTimelineStart || !acceptTimelineEnd) {
      setError('Please set a review timeline start and end date.');
      return;
    }
    if (acceptTimelineEnd < acceptTimelineStart) {
      setError('End date cannot be before the start date.');
      return;
    }
    setError('');
    setProcessing(suggestionId);

    try {
      const result = await coordinatorAcceptSuggestion(suggestionId, acceptTimelineStart, acceptTimelineEnd);
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
      setShowAcceptTimeline(null);
      setAcceptTimelineStart('');
      setAcceptTimelineEnd('');
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
      await coordinatorFinalizeReviewerSuggestion(needsAccount.suggestionId, profileId, acceptTimelineStart, acceptTimelineEnd);

      setActions(prev => [...prev, { suggestion_id: needsAccount.suggestionId, action: 'ACCEPTED' }]);
      setNeedsAccount(null);
      setShowAcceptTimeline(null);
      setAcceptTimelineStart('');
      setAcceptTimelineEnd('');
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

  // Selecting candidates to send to the Editor -- doesn't invite anyone by
  // itself, just curates the pool the Editor's own reviewer-selection step
  // picks from.
  const togglePoolReviewer = (reviewerId: string) => {
    setSelectedPoolReviewerIds((prev) => prev.includes(reviewerId) ? prev.filter((id) => id !== reviewerId) : [...prev, reviewerId]);
  };

  const handleSendPoolToEditor = async () => {
    setPoolError('');
    setSendingPoolToEditor(true);
    try {
      await coordinatorSetReviewerPool(manuscript.id, selectedPoolReviewerIds);
      setPoolAlreadySent(true);
      setJustSentPool(true);
      setTimeout(() => setJustSentPool(false), 5000);
      onDataChange();
    } catch (e: any) {
      setPoolError(e.message || 'Failed to send reviewers to the Editor');
    } finally {
      setSendingPoolToEditor(false);
    }
  };

  // Handle sending invitations for the 2 reviewers the Editor selected
  // (via "Move to Next Stage") -- a single action instead of Accept-ing
  // each suggestion individually. See coordinator_send_reviewer_invitations()
  // in 0026_editor_reviewer_selection.sql.
  const handleSendInvitations = async () => {
    if (!reviewTimelineStart || !reviewTimelineEnd) {
      setError('Please set a review timeline start and end date.');
      return;
    }
    if (reviewTimelineEnd < reviewTimelineStart) {
      setError('End date cannot be before the start date.');
      return;
    }
    setError('');
    setSendingInvitations(true);
    try {
      await coordinatorSendReviewerInvitations(manuscript.id, reviewTimelineStart, reviewTimelineEnd);
      setSuccess('Invitations sent. The manuscript stays in Editorial Review until both reviewers accept.');
      setTimeout(() => setSuccess(''), 4000);
      // onDataChange() only refreshes the parent's manuscript/suggestedReviewers/
      // reviewerAssignments props -- this tab's own `actions` state (which
      // getSuggestionStatus reads to decide whether the button should still
      // show) is local, fetched once on mount, and was never being
      // refreshed here, so the button kept reappearing even after the
      // invitations actually went out.
      const refreshedActions = await getEditorReviewerActions(manuscript.id);
      setActions(refreshedActions);
      onDataChange();
    } catch (e: any) {
      setError(e.message || 'Failed to send invitations');
    } finally {
      setSendingInvitations(false);
    }
  };

  const handleSendReviewerReminder = async (reviewerAssignmentId: string) => {
    if (sendingReminderFor) return;
    setReminderError('');
    setSendingReminderFor(reviewerAssignmentId);
    try {
      await coordinatorSendReviewerReminder(reviewerAssignmentId);
      onDataChange();
    } catch (e: any) {
      setReminderError(e.message || 'Failed to send reminder');
    } finally {
      setSendingReminderFor(null);
    }
  };

  const handleRequestReplacement = async (reviewerAssignmentId: string) => {
    if (requestingReplacementFor) return;
    setRequestReplacementError(null);
    setRequestingReplacementFor(reviewerAssignmentId);
    try {
      await coordinatorRequestReviewerReplacement(reviewerAssignmentId);
      onDataChange();
    } catch (e: any) {
      setRequestReplacementError({ id: reviewerAssignmentId, message: e.message || 'Failed to request a replacement' });
    } finally {
      setRequestingReplacementFor(null);
    }
  };

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
      {manuscript.status === 'EDITOR_REVIEW' && editorSuggestions.filter(s => getSuggestionStatus(s.id) === 'PENDING').length === 2 && (() => {
        const pendingPair = editorSuggestions.filter(s => getSuggestionStatus(s.id) === 'PENDING');
        // A suggestion promoted from an Author-suggested name (0088) or
        // typed freehand by the Editor may not correspond to any real
        // Reviewer account yet -- coordinatorSendReviewerInvitations()
        // requires one to already exist for every pending suggestion, so
        // surface an inline "Add" (same NEEDS_ACCOUNT flow the per-suggestion
        // Accept & Assign button below already uses) instead of only
        // failing at Send Invitation time with no way to fix it here.
        const hasAccount = (s: SuggestedReviewerRow) =>
          availableReviewers.some(r => r.email.toLowerCase() === s.email.toLowerCase());
        const allHaveAccounts = pendingPair.every(hasAccount);
        return (
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-black text-slate-900">Reviewers Selected by Editor</h3>
          </div>
          <div className="space-y-2">
            {pendingPair.map((s, idx) => (
              <div key={s.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Reviewer {idx + 1}</p>
                    <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-600">{s.email}</p>
                  </div>
                  {!hasAccount(s) && showAcceptTimeline !== s.id && (
                    <button
                      type="button"
                      onClick={() => setShowAcceptTimeline(s.id)}
                      disabled={processing === s.id}
                      className="text-xs px-3 py-1.5 bg-slate-800 text-white rounded font-bold hover:bg-slate-900 disabled:opacity-50 transition flex items-center gap-1 shrink-0"
                    >
                      {processing === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                      Add
                    </button>
                  )}
                </div>
                {showAcceptTimeline === s.id && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-700 shrink-0">Review Timeline</label>
                    <input type="date" value={acceptTimelineStart} onChange={(e) => setAcceptTimelineStart(e.target.value)} title="Start date" className="border border-slate-300 rounded px-2 py-1.5 text-xs" />
                    <span className="text-xs text-slate-500">to</span>
                    <input type="date" value={acceptTimelineEnd} min={acceptTimelineStart || undefined} onChange={(e) => setAcceptTimelineEnd(e.target.value)} title="End date (deadline)" className="border border-slate-300 rounded px-2 py-1.5 text-xs" />
                    <button
                      type="button"
                      onClick={() => handleAccept(s.id)}
                      disabled={!acceptTimelineStart || !acceptTimelineEnd || processing === s.id}
                      className="text-xs px-3 py-1.5 bg-slate-800 text-white rounded font-bold hover:bg-slate-900 disabled:opacity-50 shrink-0"
                    >
                      {processing === s.id ? 'Adding...' : 'Confirm'}
                    </button>
                    <button type="button" onClick={() => { setShowAcceptTimeline(null); setAcceptTimelineStart(''); setAcceptTimelineEnd(''); }} className="text-xs px-3 py-1.5 border border-slate-300 rounded font-bold text-slate-700 hover:bg-slate-50 shrink-0">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600 shrink-0">Review Timeline</label>
            <input
              type="date"
              value={reviewTimelineStart}
              onChange={(e) => setReviewTimelineStart(e.target.value)}
              disabled={sendingInvitations}
              title="Start date"
              className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="date"
              value={reviewTimelineEnd}
              min={reviewTimelineStart || undefined}
              onChange={(e) => setReviewTimelineEnd(e.target.value)}
              disabled={sendingInvitations}
              title="End date (deadline)"
              className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
          </div>
          <button
            onClick={handleSendInvitations}
            disabled={sendingInvitations || !allHaveAccounts || !reviewTimelineStart || !reviewTimelineEnd}
            className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition flex items-center justify-center gap-2"
          >
            {sendingInvitations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Confirm Reviewer Assignments & Send Invitation
          </button>
          {!allHaveAccounts && (
            <p className="text-[11px] text-amber-700 font-semibold">Add an account for every reviewer above before sending invitations.</p>
          )}
          <p className="text-[11px] text-slate-500">
            The manuscript stays in Editorial Review until both reviewers accept — it only moves to Peer Review once both have.
          </p>
        </div>
        );
      })()}

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
              const reviewerAssignment = status === 'ACCEPTED' ? getReviewerAssignmentForSuggestion(suggestion) : undefined;
              // Once the Coordinator has accepted the suggestion, the badge
              // should track the actual reviewer's response, not just "the
              // Coordinator sent an invite" -- INVITED until the reviewer
              // themself accepts (or SUBMITTED/further, which implies accepted).
              const reviewerHasAccepted = reviewerAssignment ? reviewerAssignment.status !== 'INVITED' && reviewerAssignment.status !== 'DECLINED' : false;
              const reviewerDeclined = reviewerAssignment?.status === 'DECLINED';
              // Module 104: this reviewer already had a replacement picked
              // for them post-invitation (decline or overdue) -- takes
              // priority over their stale ACCEPTED/Invited/Declined badge.
              const superseded = isSupersededByReplacement(suggestion);

              return (
                <div key={suggestion.id} className={`border rounded-lg p-4 ${
                  superseded ? 'bg-slate-100 border-slate-200 opacity-70' :
                  status === 'ACCEPTED' ? (reviewerHasAccepted ? 'bg-emerald-50 border-emerald-200' : reviewerDeclined ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200') :
                  status === 'DECLINED' ? 'bg-red-50 border-red-200' :
                  status === 'REPLACED' ? 'bg-blue-50 border-blue-200' :
                  'border-slate-200'
                }`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900">{suggestion.name}</p>
                        {superseded ? (
                          <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full font-bold">↻ Replaced</span>
                        ) : status === 'ACCEPTED' ? (
                          reviewerHasAccepted ? (
                            <span className="text-xs px-2 py-0.5 bg-emerald-200 text-emerald-700 rounded-full font-bold">✓ Accepted</span>
                          ) : reviewerDeclined ? (
                            <span className="text-xs px-2 py-0.5 bg-red-200 text-red-700 rounded-full font-bold">✕ Declined</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full font-bold">⏳ Invited</span>
                          )
                        ) : status === 'DECLINED' ? (
                          <span className="text-xs px-2 py-0.5 bg-red-200 text-red-700 rounded-full font-bold">✕ Declined</span>
                        ) : status === 'REPLACED' ? (
                          <span className="text-xs px-2 py-0.5 bg-blue-200 text-blue-700 rounded-full font-bold">↻ Replaced</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-600">{suggestion.email}</p>
                      {suggestion.department && <p className="text-xs text-slate-500 mt-1">Department: {suggestion.department}</p>}
                      {suggestion.note && <p className="text-xs text-slate-500 mt-1">Expertise: {suggestion.note}</p>}
                    </div>
                  </div>

                  {/* Module 106: the Coordinator only ever sends the
                      invitation for a reviewer the Editor already picked --
                      declining or swapping in a different candidate is the
                      Editor's call, same rule as every post-invitation
                      replacement in this file. */}
                  {status === 'PENDING' && (
                    <div className="flex gap-2 flex-wrap">
                      {showAcceptTimeline !== suggestion.id && (
                        <button
                          onClick={() => setShowAcceptTimeline(suggestion.id)}
                          disabled={processing === suggestion.id}
                          className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-1"
                        >
                          {processing === suggestion.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          Accept & Assign
                        </button>
                      )}
                    </div>
                  )}

                  {showAcceptTimeline === suggestion.id && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <label className="text-xs font-bold text-slate-700 shrink-0">Review Timeline</label>
                      <input type="date" value={acceptTimelineStart} onChange={(e) => setAcceptTimelineStart(e.target.value)} title="Start date" className="border border-slate-300 rounded px-2 py-1.5 text-xs" />
                      <span className="text-xs text-slate-500">to</span>
                      <input type="date" value={acceptTimelineEnd} min={acceptTimelineStart || undefined} onChange={(e) => setAcceptTimelineEnd(e.target.value)} title="End date (deadline)" className="border border-slate-300 rounded px-2 py-1.5 text-xs" />
                      <button
                        onClick={() => handleAccept(suggestion.id)}
                        disabled={!acceptTimelineStart || !acceptTimelineEnd || processing === suggestion.id}
                        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {processing === suggestion.id ? 'Assigning...' : 'Confirm Accept'}
                      </button>
                      <button onClick={() => { setShowAcceptTimeline(null); setAcceptTimelineStart(''); setAcceptTimelineEnd(''); }} className="text-xs px-3 py-1.5 border border-slate-300 rounded font-bold text-slate-700 hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* Assigned Reviewers -- gated on every assignment ever made (including
          declined ones, so their history/Notify Editor button stays visible),
          not just the active count. */}
      {reviewerAssignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Assigned Reviewers ({reviewerAssignments.length})</h3>
          <div className="space-y-3">
            {reviewerAssignments.map((assignment, idx) => {
              const reviewer = profiles[assignment.reviewer_id];
              const isDeclined = assignment.status === 'DECLINED';
              const displayStatus = getReviewerDisplayStatus(assignment);
              const isOverdue = displayStatus === 'OVERDUE';
              // Module 106: a real replacement has actually been picked for
              // THIS specific assignment (matched precisely via
              // replaces_assignment_id) -- takes priority over the
              // Declined/Overdue styling, greyed out as settled/history.
              const isReplaced = suggestedReviewers.some(s => s.suggested_by === 'EDITOR' && s.replaces_assignment_id === assignment.id);
              // Module 104: the Coordinator never picks a replacement
              // reviewer directly anymore, for a decline OR an overdue
              // reviewer -- the only action available is requesting one from
              // the Editor, who always makes the actual selection (either
              // via the auto-surfaced ReviewerReplacementAlert for a
              // decline, or after this request unlocks it for an overdue
              // row).
              const needsReplacement = reviewerNeedsReplacement(assignment) && !isReplaced;
              const replacementRequested = !!assignment.replacement_requested_at;
              const statusColor = isReplaced ? 'text-slate-500' : isDeclined ? 'text-red-700' : isOverdue ? 'text-red-700' : 'text-emerald-700';
              return (
                <div key={assignment.id} className={`border rounded-lg p-4 ${isReplaced ? 'border-slate-200 bg-slate-100 opacity-70' : isDeclined || isOverdue ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{reviewer?.name}</p>
                      <p className="text-xs text-slate-600">{reviewer?.email}</p>
                      <p className={`text-xs mt-1 font-bold ${statusColor}`}>Status: {isReplaced ? '↻ Replaced' : isOverdue ? '🔴 Overdue' : displayStatus}</p>
                      {isDeclined && assignment.decline_reason && (
                        <p className="text-xs text-slate-600 mt-1"><span className="font-bold text-red-700">Reason:</span> {assignment.decline_reason}</p>
                      )}
                    </div>
                    {isReplaced ? <RefreshCw className="w-5 h-5 text-slate-400 flex-shrink-0" /> : isDeclined || isOverdue ? <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
                  </div>

                  {/* Module 98 -- Review Timeline: the deadline set when this
                      reviewer's invitation was sent, plus a manual reminder,
                      same pattern as the Editorial Timeline. Still shown once
                      Overdue -- the reminder has no restriction on when it
                      can be sent, and stays available until the review is
                      actually done. */}
                  {assignment.timeline_start_date && assignment.due_date && !isDeclined && (
                    <div className="mt-3 pt-3 border-t border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">Review Timeline</p>
                        <p className="text-xs text-slate-700">
                          Start: {formatTimelineDate(assignment.timeline_start_date)} &nbsp;&bull;&nbsp; Deadline: {formatTimelineDate(assignment.due_date)}
                        </p>
                        {assignment.last_reminder_sent_at && (
                          <p className="text-[11px] text-slate-400 mt-0.5">Last reminder sent {new Date(assignment.last_reminder_sent_at).toLocaleString()}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSendReviewerReminder(assignment.id)}
                        disabled={sendingReminderFor === assignment.id || assignment.status === 'SUBMITTED'}
                        title={assignment.status === 'SUBMITTED' ? 'Review already submitted -- no reminder needed' : 'Send a reminder to this reviewer'}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {sendingReminderFor === assignment.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                        {sendingReminderFor === assignment.id ? 'Sending...' : 'Send Reminder'}
                      </button>
                    </div>
                  )}
                  {reminderError && <p className="mt-2 text-xs font-semibold text-red-600">{reminderError}</p>}

                  {needsReplacement && (
                    <div className="mt-3 pt-3 border-t border-red-200 space-y-2">
                      <p className="text-xs text-amber-700">
                        {replacementRequested
                          ? 'Awaiting the Editor to select a replacement.'
                          : isDeclined
                          ? 'This reviewer declined. Notify the Editor to select a replacement.'
                          : 'This reviewer is overdue. Request a replacement from the Editor.'}
                      </p>
                      {replacementRequested ? (
                        <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Replacement requested.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestReplacement(assignment.id)}
                          disabled={requestingReplacementFor === assignment.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                        >
                          {requestingReplacementFor === assignment.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                          {requestingReplacementFor === assignment.id ? 'Sending...' : isDeclined ? 'Notify Editor' : 'Request Replacement'}
                        </button>
                      )}
                      {requestReplacementError?.id === assignment.id && <p className="text-xs font-semibold text-red-600">{requestReplacementError.message}</p>}
                    </div>
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

      {/* Available Reviewers -- select candidates and send the list to the
          Editor, who picks who actually gets invited. The Coordinator never
          invites a reviewer directly from here. */}
      {assignedCount < 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-1">Available Reviewers</h3>
          <p className="text-xs text-slate-500 mb-4">Select candidates for the assigned Editor to choose from, then click Send to Editor. The Editor picks who actually gets invited.</p>
          {poolError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mb-3">{poolError}</div>
          )}
          {loadingReviewers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-slate-600 mr-2" />
              <p className="text-sm text-slate-600">Loading reviewers...</p>
            </div>
          ) : availableReviewers.length === 0 ? (
            <p className="text-sm text-slate-600">No reviewers available</p>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {availableReviewers
                  .filter(r => !assignedReviewerIds.has(r.id))
                  .map(reviewer => {
                    const isChecked = selectedPoolReviewerIds.includes(reviewer.id);
                    return (
                      <label
                        key={reviewer.id}
                        className={`flex items-center justify-between gap-4 p-3 border rounded-lg cursor-pointer transition ${
                          isChecked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePoolReviewer(reviewer.id)}
                            disabled={sendingPoolToEditor || (poolAlreadySent && !needsReplacementCandidates)}
                          />
                          <div className="grid grid-cols-4 gap-4 flex-1 min-w-0">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Name</p>
                              <p className="font-semibold text-slate-900 text-sm truncate">{reviewer.name}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Email ID</p>
                              <p className="text-xs text-slate-600 truncate">{reviewer.email}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Affiliation</p>
                              <p className="text-xs text-slate-600 truncate">{reviewer.metadata?.affiliation || '—'}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Research Area</p>
                              <p className="text-xs text-slate-600 truncate">{reviewer.metadata?.specialization || reviewer.metadata?.expertise || '—'}</p>
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
              </div>
              <div className="flex items-center gap-3">
                {poolAlreadySent && !needsReplacementCandidates ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Sent to Editor
                  </span>
                ) : (
                  <button
                    onClick={handleSendPoolToEditor}
                    disabled={sendingPoolToEditor}
                    className="text-xs px-4 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 disabled:opacity-50 transition flex items-center gap-1.5"
                  >
                    {sendingPoolToEditor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {sendingPoolToEditor ? 'Sending...' : `Send ${selectedPoolReviewerIds.length > 0 ? selectedPoolReviewerIds.length + ' ' : ''}Reviewer${selectedPoolReviewerIds.length === 1 ? '' : 's'} to Editor`}
                  </button>
                )}
                {justSentPool && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 animate-fade-in">
                    <CheckCircle className="w-3.5 h-3.5" /> Sent!
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Already Finalized Message */}
      {manuscript.status !== 'EDITOR_REVIEW' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="font-bold text-emerald-700">Reviewer Board Finalized</p>
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
            {acceptTimelineStart && acceptTimelineEnd && (
              <p className="text-xs text-slate-500 mb-4">Review Timeline: {acceptTimelineStart} to {acceptTimelineEnd}</p>
            )}

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={accountForm.email}
                  onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">The Author's suggestion may have a typo or placeholder value -- correct it here before creating the account.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Expertise / Note</label>
                <input
                  type="text"
                  value={accountForm.note}
                  onChange={(e) => setAccountForm({ ...accountForm, note: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
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
                onClick={() => { setNeedsAccount(null); setError(''); setShowAcceptTimeline(null); setAcceptTimelineStart(''); setAcceptTimelineEnd(''); }}
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
