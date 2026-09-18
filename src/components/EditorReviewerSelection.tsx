import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle, Users } from 'lucide-react';
import { ProfileRow, SuggestedReviewerRow, ReviewerAssignmentRow, editorSelectReviewers, editorSelectAuthorSuggestion, getManuscriptReviewerPool } from '../lib/workflow';
import { isReviewerOverdue, editorSeesReplacementNeeded } from '../lib/reviewerStatus';

interface Props {
  manuscriptId: string;
  suggestedReviewers: SuggestedReviewerRow[];
  onSubmitSuccess: () => void;
  /** So a declined reviewer's real status can be shown instead of a stale
   * "Awaiting Invitation", and so the Editor can pick a replacement for that
   * one slot instead of being stuck at "already selected". Optional --
   * callers that don't have this yet just fall back to the old behavior. */
  reviewerAssignments?: ReviewerAssignmentRow[];
  profiles?: Map<string, { email: string }>;
}

/** Both the Reviewer Board pool and the Author's suggested reviewers feed
 * the SAME 2 slots, and nothing is written to the server until Confirm --
 * the Editor can freely check/uncheck any mix of pool reviewers and Author
 * suggestions (2 from the pool, 2 from suggestions, 1 of each, etc.) before
 * committing. Confirm then promotes any picked Author suggestions
 * (editor_select_author_suggestion) followed by the pool picks
 * (editor_select_reviewers) in one action. */
export function useEditorReviewerSelection({ manuscriptId, suggestedReviewers, onSubmitSuccess, reviewerAssignments = [], profiles }: Props) {
  const [reviewers, setReviewers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Only the Coordinator-curated pool for THIS manuscript -- not the full
  // Reviewer Board. See coordinator_set_reviewer_pool() / assignEditor's
  // reviewer picker in OverviewTab.tsx.
  //
  // De-duplicated by id defensively -- coordinator_set_reviewer_pool() has
  // been re-run more than once for the same manuscript in testing, and a
  // duplicate row rendered as two selectable list entries for the same
  // reviewer let two clicks land on the same id, which the server then
  // rejected with "Exactly 2 distinct reviewers are required" even though
  // the Editor had visibly picked two different rows.
  useEffect(() => {
    getManuscriptReviewerPool(manuscriptId)
      .then((data) => {
        const deduped = Array.from(new Map((data || []).map((r) => [r.id, r])).values());
        setReviewers(deduped);
      })
      .catch(() => setError('Failed to load the reviewers made available for this manuscript.'))
      .finally(() => setLoading(false));
  }, [manuscriptId]);

  const editorSelections = suggestedReviewers.filter(s => s.suggested_by === 'EDITOR');
  const authorSuggestions = suggestedReviewers.filter(s => s.suggested_by === 'AUTHOR');
  const promotedFromIds = new Set(editorSelections.map(s => s.promoted_from).filter(Boolean));

  // A selection whose actual invitation was declined no longer occupies its
  // slot -- without this, the Editor was permanently stuck at "already
  // selected" (both names still listed as "Awaiting Invitation" forever)
  // the moment either reviewer declined, with no way to pick a replacement
  // from here. Module 107: this only frees up once the Coordinator has
  // explicitly notified the Editor (editorSeesReplacementNeeded) -- until
  // then the slot still shows as occupied/"Awaiting Invitation", same as
  // before the decline happened.
  const emailToAssignment = new Map<string, ReviewerAssignmentRow>();
  if (profiles) {
    for (const a of reviewerAssignments) {
      const email = profiles.get(a.reviewer_id)?.email?.toLowerCase();
      if (email) emailToAssignment.set(email, a);
    }
  }
  const selectionAssignment = (s: SuggestedReviewerRow) => emailToAssignment.get(s.email.toLowerCase()) ?? null;
  const selectionStatus = (s: SuggestedReviewerRow) => selectionAssignment(s)?.status ?? null;
  const declinedSelections = editorSelections.filter(s => {
    const a = selectionAssignment(s);
    return !!a && a.status === 'DECLINED' && editorSeesReplacementNeeded(a);
  });
  const activeSelectionsCount = editorSelections.length - declinedSelections.length;
  const remainingSlots = Math.max(0, 2 - activeSelectionsCount);
  const alreadySelected = remainingSlots === 0;
  const hasDeclinedSelection = declinedSelections.length > 0;
  const totalTentative = selectedPoolIds.length + selectedSuggestionIds.length;
  const canPickMore = totalTentative < remainingSlots;

  // Never re-offer a reviewer who has already declined this manuscript --
  // the pool picker was showing every candidate the Coordinator ever added,
  // including ones already known not to want it.
  const visibleReviewers = reviewers.filter(r => emailToAssignment.get(r.email.toLowerCase())?.status !== 'DECLINED');

  const togglePool = (id: string) => {
    setError('');
    setSuccess('');
    setSelectedPoolIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : canPickMore ? [...prev, id] : prev
    );
  };

  const toggleSuggestion = (id: string) => {
    setError('');
    setSuccess('');
    setSelectedSuggestionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : canPickMore ? [...prev, id] : prev
    );
  };

  const handleSubmit = async () => {
    const distinctPoolIds: string[] = Array.from(new Set<string>(selectedPoolIds));
    const distinctSuggestionIds: string[] = Array.from(new Set<string>(selectedSuggestionIds));
    const total = distinctPoolIds.length + distinctSuggestionIds.length;
    if (total !== remainingSlots) {
      setError(`Please select exactly ${remainingSlots} more reviewer${remainingSlots === 1 ? '' : 's'}.`);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      // Promote any picked Author suggestions first, then fill whatever's
      // left from the pool -- editor_select_reviewers() requires its
      // reviewer id count to exactly match the slots still open, which only
      // holds true once these promotions have already committed.
      for (const suggestionId of distinctSuggestionIds) {
        await editorSelectAuthorSuggestion(suggestionId);
      }
      if (distinctPoolIds.length > 0) {
        await editorSelectReviewers(manuscriptId, distinctPoolIds);
      }
      setSuccess('Reviewers selected. Awaiting invitation.');
      setSelectedPoolIds([]);
      setSelectedSuggestionIds([]);
      onSubmitSuccess();
    } catch (e: any) {
      setError(e.message || 'Failed to select reviewers');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    reviewers: visibleReviewers, loading, selectedPoolIds, togglePool,
    authorSuggestions, selectedSuggestionIds, toggleSuggestion, promotedFromIds, canPickMore,
    submitting, error, success, handleSubmit, alreadySelected, editorSelections, remainingSlots, totalTentative,
    selectionStatus, selectionAssignment, hasDeclinedSelection, activeSelectionsCount
  };
}

type SelectionState = ReturnType<typeof useEditorReviewerSelection>;

// Once selected, this stays visible permanently (not just a one-time
// success message) -- reviewer_assignments only exist once the
// Coordinator has actually sent the invitations, so without this the
// Editor's own selection would otherwise vanish from view entirely in
// the gap between confirming it and the Coordinator inviting them.
function ReviewersSelectedCard({ editorSelections, selectionAssignment }: Pick<SelectionState, 'editorSelections' | 'selectionAssignment'>) {
  // A slot's original holder only becomes "Replaced" once the Editor has
  // picked an ACTUAL replacement FOR THAT SPECIFIC assignment -- matched
  // precisely via replaces_assignment_id (Module 106), not guessed from a
  // count. A count-based guess breaks the moment two reviewers in the same
  // round need replacing and only one has a pick so far: the other, still
  // genuinely un-replaced one would get wrongly marked "Replaced" too.
  const isSuperseded = (r: SuggestedReviewerRow) => {
    const a = selectionAssignment(r);
    if (!a) return false;
    return editorSelections.some(other => other.id !== r.id && other.replaces_assignment_id === a.id);
  };
  const activeCount = editorSelections.filter(r => !isSuperseded(r)).length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-slate-700" />
        <h3 className="text-sm font-black text-slate-900">Reviewers Selected ({activeCount})</h3>
      </div>
      <div className="space-y-2">
        {editorSelections.map((r) => {
          const a = selectionAssignment(r);
          const superseded = isSuperseded(r);
          // Module 107: a decline/overdue only becomes visible to the
          // Editor once the Coordinator has explicitly notified them --
          // until then this still shows as plain "Awaiting Invitation",
          // same as before anything happened.
          const revealed = !superseded && !!a && editorSeesReplacementNeeded(a);
          const isDeclined = revealed && a?.status === 'DECLINED';
          const isOverdue = revealed && isReviewerOverdue(a!);
          const label = superseded ? 'Replaced' : isDeclined ? 'Declined' : isOverdue ? 'Overdue' : 'Awaiting Invitation';
          const colorClass = superseded
            ? 'border-slate-200 bg-slate-50'
            : (isDeclined || isOverdue)
            ? 'border-red-200 bg-red-50'
            : 'border-emerald-200 bg-emerald-50';
          const badgeClass = superseded
            ? 'bg-slate-200 text-slate-600'
            : (isDeclined || isOverdue)
            ? 'bg-red-100 text-red-700'
            : 'bg-amber-100 text-amber-700';
          return (
            <div key={r.id} className={`flex items-center justify-between p-3 border rounded-lg ${colorClass} ${superseded ? 'opacity-70' : ''}`}>
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                <p className="text-xs text-slate-600">{r.email}</p>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${badgeClass}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Heading + reviewer list only -- no Confirm button, so the caller can
 * place other content (e.g. the Author's suggested reviewers) between the
 * list and the Confirm button instead of them being stacked back-to-back. */
export function ReviewerSelectionList(state: SelectionState) {
  const { reviewers, loading, selectedPoolIds, togglePool, submitting, error, success, alreadySelected, editorSelections, remainingSlots, selectionStatus, selectionAssignment, hasDeclinedSelection } = state;

  // A declined reviewer stays visible above (with its real "Declined"
  // status) instead of silently disappearing, and the picker below reopens
  // for just the freed-up slot rather than the Editor being stuck at
  // "already selected" forever.
  if (alreadySelected) return <ReviewersSelectedCard editorSelections={editorSelections} selectionAssignment={selectionAssignment} />;

  return (
    <div className="space-y-4">
      {editorSelections.length > 0 && <ReviewersSelectedCard editorSelections={editorSelections} selectionAssignment={selectionAssignment} />}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-700" />
          <h3 className="text-sm font-black text-slate-900">
            {hasDeclinedSelection ? 'Choose Another Reviewer' : `Select ${remainingSlots} Reviewer${remainingSlots === 1 ? '' : 's'}`}
          </h3>
        </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="text-xs font-semibold">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-xs font-semibold">{success}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-slate-600 mr-2" />
          <p className="text-sm text-slate-600">Loading Reviewer Board...</p>
        </div>
      ) : reviewers.length === 0 ? (
        <p className="text-sm text-slate-600">No reviewers available for this manuscript yet.</p>
      ) : (
        <div className="space-y-2">
          {reviewers.map(r => {
            const isSelected = selectedPoolIds.includes(r.id);
            const focusArea = r.metadata?.specialization || r.metadata?.expertise || '—';
            return (
              <button
                type="button"
                key={r.id}
                onClick={() => togglePool(r.id)}
                disabled={submitting}
                className={`w-full flex items-center justify-between p-3 border rounded-lg text-left transition disabled:opacity-50 ${
                  isSelected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-600">{r.email}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Expert Focus Area: {focusArea}</p>
                </div>
                {isSelected && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                    Invite
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

/** Confirm button only -- rendered separately so the caller can place it
 * below other content instead of directly under the reviewer list. Renders
 * nothing once the Editor has already selected (ReviewerSelectionList shows
 * the "Reviewers Selected" card in that state instead). */
export function ReviewerSelectionConfirmButton({ totalTentative, submitting, handleSubmit, alreadySelected, activeSelectionsCount }: SelectionState) {
  if (alreadySelected) return null;
  return (
    <button
      type="button"
      onClick={handleSubmit}
      disabled={submitting}
      className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition flex items-center justify-center gap-2"
    >
      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
      Confirm {activeSelectionsCount + totalTentative}/2 Selected
    </button>
  );
}

/** Self-contained heading + list + confirm button, for callers that don't
 * need to interleave other content in between (see sidebarSection ===
 * 'suggestions' in EditorWorkspace.tsx). */
export function EditorReviewerSelection(props: Props) {
  const state = useEditorReviewerSelection(props);
  if (state.alreadySelected) return <ReviewerSelectionList {...state} />;
  return (
    <div className="space-y-4">
      <ReviewerSelectionList {...state} />
      <ReviewerSelectionConfirmButton {...state} />
    </div>
  );
}
