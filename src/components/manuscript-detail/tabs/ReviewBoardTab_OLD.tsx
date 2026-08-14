import { useState, useEffect } from 'react';
import { ManuscriptRow, SuggestedReviewerRow, ReviewerAssignmentRow, ProfileRow, assignReviewers } from '../../../lib/workflow';
import { Plus, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Props {
  manuscript: ManuscriptRow;
  suggestedReviewers: SuggestedReviewerRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  profiles: Record<string, ProfileRow>;
  onDataChange: () => void;
}

interface ReviewerSelectable extends SuggestedReviewerRow {
  profileId?: string;
  source: 'suggested' | 'available' | 'manual';
}

export function ReviewBoardTab({
  manuscript,
  suggestedReviewers,
  reviewerAssignments,
  profiles,
  onDataChange
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', expertise: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Selection state: track reviewers being considered for assignment
  const [selectingReviewers, setSelectingReviewers] = useState<Set<string>>(new Set());
  const [pendingReviewers, setPendingReviewers] = useState<Map<string, ReviewerSelectable>>(new Map());

  const [availableReviewers, setAvailableReviewers] = useState<ProfileRow[]>([]);
  const [loadingReviewers, setLoadingReviewers] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Load available reviewers from database
  useEffect(() => {
    const loadReviewers = async () => {
      try {
        setLoadingReviewers(true);
        const { data, error: err } = await supabase
          .from('profiles')
          .select('id, name, email, role, status')
          .eq('role', 'REVIEWER')
          .eq('status', 'ACTIVE')
          .order('name');

        if (err) throw err;
        setAvailableReviewers(data || []);
      } catch (e: any) {
        console.error('Failed to load reviewers:', e);
        setError('Failed to load available reviewers');
      } finally {
        setLoadingReviewers(false);
      }
    };

    loadReviewers();
  }, []);

  const assignedCount = reviewerAssignments.length;
  const canAssignMore = assignedCount < 2;
  const assignedEmails = new Set(reviewerAssignments.map(r => profiles[r.reviewer_id]?.email).filter(Boolean));
  const selectCount = selectingReviewers.size;
  const needsCount = Math.max(0, 2 - assignedCount - selectCount);

  // Toggle reviewer selection
  const toggleReviewerSelection = (reviewerId: string, reviewer: ReviewerSelectable) => {
    const newSet = new Set(selectingReviewers);
    const newMap = new Map(pendingReviewers);

    if (newSet.has(reviewerId)) {
      newSet.delete(reviewerId);
      newMap.delete(reviewerId);
    } else {
      if (selectCount < 2 - assignedCount) {
        newSet.add(reviewerId);
        newMap.set(reviewerId, reviewer);
      }
    }

    setSelectingReviewers(newSet);
    setPendingReviewers(newMap);
  };

  // Add manually entered reviewer
  const handleAddManualReviewer = async () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Name and email are required');
      return;
    }

    setAssigning(true);
    setError('');

    try {
      // Check if reviewer exists by email
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', formData.email.trim())
        .maybeSingle();

      let reviewerId = existing?.id;

      // If not found, create new reviewer profile
      if (!reviewerId) {
        const { data: newReviewer, error: createErr } = await supabase
          .from('profiles')
          .insert({
            email: formData.email.trim(),
            name: formData.name.trim(),
            role: 'REVIEWER',
            status: 'INVITED'
          })
          .select('id')
          .single();

        if (createErr) throw createErr;
        reviewerId = newReviewer.id;
      }

      // Create pending reviewer object
      const pending: ReviewerSelectable = {
        id: reviewerId,
        manuscript_id: manuscript.id,
        suggested_by: 'EDITOR',
        suggested_by_user: null,
        name: formData.name.trim(),
        email: formData.email.trim(),
        note: formData.expertise.trim(),
        created_at: new Date().toISOString(),
        profileId: reviewerId,
        source: 'manual'
      };

      if (selectCount < 2 - assignedCount) {
        setSelectingReviewers(prev => new Set([...prev, reviewerId]));
        setPendingReviewers(prev => new Map([...prev, [reviewerId, pending]]));

        setFormData({ name: '', email: '', expertise: '' });
        setShowAddForm(false);
        setSuccess('Reviewer added to selection');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError('Already selected enough reviewers');
      }
    } catch (e: any) {
      console.error('Error adding manual reviewer:', e);
      setError(e.message || 'Failed to add reviewer');
    } finally {
      setAssigning(false);
    }
  };

  // Call RPC to assign the 2 selected reviewers
  const handleConfirmAssignment = async () => {
    if (selectingReviewers.size + assignedCount !== 2) {
      setError(`Must assign exactly 2 reviewers total. Currently: ${assignedCount} assigned + ${selectingReviewers.size} selected`);
      return;
    }

    setAssigning(true);
    setError('');

    try {
      console.log('📌 Calling assignReviewers RPC with IDs:', Array.from(selectingReviewers));

      // Call the RPC with both reviewer IDs
      await assignReviewers(
        manuscript.id,
        Array.from(selectingReviewers) as [string, string]
      );

      console.log('✓ RPC call successful');

      // Clear selection
      setSelectingReviewers(new Set());
      setPendingReviewers(new Map());
      setFormData({ name: '', email: '', expertise: '' });
      setShowAddForm(false);

      setSuccess('✓ Reviewers assigned successfully');
      setTimeout(() => setSuccess(''), 2000);

      // Refresh data
      onDataChange();
    } catch (e: any) {
      console.error('❌ Error calling assignReviewers RPC:', e);

      // Extract meaningful error message
      let errorMsg = e.message || 'Failed to assign reviewers';
      if (errorMsg.includes('assessment must be submitted')) {
        errorMsg = 'Editor assessment must be submitted before assigning reviewers';
      } else if (errorMsg.includes('distinct')) {
        errorMsg = 'Must assign exactly 2 distinct reviewers';
      }

      setError(errorMsg);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4">Reviewer Assignment Status</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900">{assignedCount} / 2</p>
            <p className="text-xs text-slate-600 mt-1">Reviewers assigned</p>
          </div>
          {assignedCount === 2 && (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Complete
            </span>
          )}
        </div>

        {selectCount > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-600 mb-2">Selection in progress: {selectCount} reviewer(s) selected</p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmAssignment}
                disabled={assigning || selectCount + assignedCount !== 2}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {assigning ? 'Assigning...' : `Assign ${selectCount} Reviewer(s)`}
              </button>
              <button
                onClick={() => {
                  setSelectingReviewers(new Set());
                  setPendingReviewers(new Map());
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-700">Error</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Success Display */}
      {success && (
        <div className="flex items-start gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-emerald-700">{success}</p>
        </div>
      )}

      {/* Assigned Reviewers */}
      {assignedCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Assigned Reviewers</h3>
          <div className="space-y-3">
            {reviewerAssignments.map((assignment, idx) => {
              const reviewer = profiles[assignment.reviewer_id];
              return (
                <div key={assignment.id} className="border border-emerald-200 bg-emerald-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">Reviewer {idx + 1}</p>
                      <p className="text-sm text-slate-700">{reviewer?.name}</p>
                      <p className="text-xs text-slate-600">{reviewer?.email}</p>
                      <div className="flex gap-1 mt-2">
                        <span className="text-xs px-2 py-1 bg-emerald-200 text-emerald-700 rounded">
                          {assignment.status}
                        </span>
                      </div>
                    </div>
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Currently Selecting */}
      {selectCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-blue-900 mb-4">Reviewers in Selection ({selectCount})</h3>
          <div className="space-y-2">
            {Array.from(pendingReviewers.values()).map(reviewer => (
              <div key={reviewer.id} className="flex items-start justify-between p-3 bg-white rounded border border-blue-200">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">{reviewer.name}</p>
                  <p className="text-xs text-slate-600">{reviewer.email}</p>
                </div>
                <button
                  onClick={() => toggleReviewerSelection(reviewer.profileId || reviewer.id, reviewer)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {needsCount > 0 && (
            <p className="text-xs text-blue-700 mt-3 font-semibold">
              Need {needsCount} more reviewer{needsCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Only show reviewer pools if not yet fully assigned */}
      {canAssignMore && (
        <>
          {/* Editor-Suggested Reviewers */}
          {suggestedReviewers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-sm font-black text-slate-900 mb-4">
                Editor-Suggested Reviewers ({suggestedReviewers.length})
              </h3>
              <div className="space-y-3">
                {suggestedReviewers.map((reviewer) => {
                  const isSelected = selectingReviewers.has(reviewer.id);
                  const isAssignedByOther = assignedEmails.has(reviewer.email);

                  return (
                    <button
                      key={reviewer.id}
                      onClick={() => toggleReviewerSelection(reviewer.id, { ...reviewer, source: 'suggested' })}
                      disabled={!isSelected && selectCount >= (2 - assignedCount)}
                      className={`w-full text-left border rounded-lg p-4 transition ${
                        isAssignedByOther
                          ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                          : isSelected
                          ? 'bg-blue-50 border-blue-400 cursor-pointer'
                          : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{reviewer.name}</p>
                          <p className="text-xs text-slate-600">{reviewer.email}</p>
                          {reviewer.note && <p className="text-xs text-slate-600 mt-1">Expertise: {reviewer.note}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {isAssignedByOther ? (
                            <span className="text-xs font-bold text-slate-400">Already assigned</span>
                          ) : isSelected ? (
                            <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded">✓ Selected</span>
                          ) : (
                            <span className="text-xs font-bold text-emerald-600">Select</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available Reviewers Pool */}
          {availableReviewers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-sm font-black text-slate-900 mb-4">Available Reviewers</h3>
              {loadingReviewers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-600 mr-2" />
                  <p className="text-sm text-slate-600">Loading reviewers...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableReviewers
                    .filter(r => !assignedEmails.has(r.email))
                    .map((reviewer) => {
                      const isSelected = selectingReviewers.has(reviewer.id);

                      return (
                        <button
                          key={reviewer.id}
                          onClick={() => toggleReviewerSelection(reviewer.id, {
                            id: reviewer.id,
                            manuscript_id: manuscript.id,
                            suggested_by: 'EDITOR',
                            suggested_by_user: null,
                            name: reviewer.name,
                            email: reviewer.email,
                            note: '',
                            created_at: new Date().toISOString(),
                            profileId: reviewer.id,
                            source: 'available'
                          })}
                          disabled={!isSelected && selectCount >= (2 - assignedCount)}
                          className={`w-full text-left border rounded-lg p-4 transition ${
                            isSelected
                              ? 'bg-blue-50 border-blue-400 cursor-pointer'
                              : selectCount >= (2 - assignedCount)
                              ? 'border-slate-200 opacity-50 cursor-not-allowed'
                              : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">{reviewer.name}</p>
                              <p className="text-xs text-slate-600">{reviewer.email}</p>
                            </div>
                            {isSelected && (
                              <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded">✓ Selected</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Add Reviewer Manually */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              disabled={selectCount >= (2 - assignedCount)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg text-emerald-600 font-bold hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Plus className="w-4 h-4" />
              Add Reviewer Manually
            </button>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-sm font-black text-slate-900 mb-4">Add Reviewer Manually</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Reviewer Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Expertise / Specialization (optional)"
                  value={formData.expertise}
                  onChange={(e) => setFormData({ ...formData, expertise: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddManualReviewer}
                    disabled={assigning || !formData.name.trim() || !formData.email.trim()}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {assigning ? 'Adding...' : 'Add to Selection'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setFormData({ name: '', email: '', expertise: '' });
                      setError('');
                    }}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Complete Message */}
      {assignedCount === 2 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-700">Reviewer assignment complete</p>
              <p className="text-sm text-emerald-600 mt-1">Both reviewers have been assigned and invitations have been sent.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
