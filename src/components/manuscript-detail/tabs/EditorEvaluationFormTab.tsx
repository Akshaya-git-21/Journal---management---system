import React, { useState } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle, Send } from 'lucide-react';
import { EditorAssignmentRow, SuggestedReviewerRow, RevisionRow, submitEditorAssessment, submitEditorRecommendation } from '../../../lib/workflow';
import { getLatestRevision } from '../../../lib/manuscriptStatusLabel';
import { supabase } from '../../../lib/supabase';

interface Props {
  assignmentId: string;
  manuscriptId: string;
  assignment: EditorAssignmentRow;
  suggestedReviewers: SuggestedReviewerRow[];
  revisions?: RevisionRow[];
  onSubmitSuccess: () => void;
}

interface ReviewerSuggestion {
  name: string;
  email: string;
  note: string;
}

const CRITERIA = [
  { key: 'scientificMerit', label: 'Scientific Merit', description: 'Quality of scientific content (1-10)' },
  { key: 'noveltyInnovation', label: 'Novelty & Innovation', description: 'Originality of work (1-10)' },
  { key: 'methodologyQuality', label: 'Methodology Quality', description: 'Soundness of methods (1-10)' },
  { key: 'literatureAdequacy', label: 'Literature Adequacy', description: 'Review of existing literature (1-10)' },
  { key: 'ethicalCompliance', label: 'Ethical Compliance', description: 'Adherence to ethical standards (1-10)' },
  { key: 'dataReliability', label: 'Data Reliability', description: 'Quality and reliability of data (1-10)' },
  { key: 'writingQuality', label: 'Writing Quality', description: 'Clarity and organization (1-10)' },
];

export function EditorEvaluationFormTab({
  assignmentId,
  manuscriptId,
  assignment,
  suggestedReviewers,
  revisions = [],
  onSubmitSuccess,
}: Props) {
  // When the latest revision cycle is UNDER_REVIEW, the Coordinator has
  // forwarded it and this recommendation is deciding that resubmission, not
  // the original submission -- the backend (submit_editor_recommendation,
  // 0018 migration) auto-advances the manuscript in that case: ACCEPT sends
  // it straight to the Coordinator's Decision tab, MINOR/MAJOR_REVISION
  // opens the next revision cycle. Reflected here purely as button labels/copy.
  const latestRevision = getLatestRevision(revisions);
  const isRevisionReview = latestRevision?.status === 'UNDER_REVIEW';
  const nextRevisionNumber = (latestRevision?.revision_number || 0) + 1;
  // Evaluation scores
  const [scores, setScores] = useState({
    scientificMerit: 5,
    noveltyInnovation: 5,
    methodologyQuality: 5,
    literatureAdequacy: 5,
    ethicalCompliance: 5,
    dataReliability: 5,
    writingQuality: 5,
  });

  // Per-criterion reasons
  const [criteriaReasons, setCriteriaReasons] = useState({
    scientificMerit: '',
    noveltyInnovation: '',
    methodologyQuality: '',
    literatureAdequacy: '',
    ethicalCompliance: '',
    dataReliability: '',
    writingQuality: '',
  });

  // Qualitative feedback
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [mandatoryRevisions, setMandatoryRevisions] = useState('');
  const [commentsToCoordinator, setCommentsToCoordinator] = useState('');

  // Reviewer suggestions -- entirely optional, starts empty.
  const [suggestions, setSuggestions] = useState<ReviewerSuggestion[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittedRecommendation, setSubmittedRecommendation] = useState<'minor_revision' | 'major_revision' | 'accept' | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | null>(null);

  // Reviewer suggestions are entirely optional (0, 1, or more) -- only
  // duplicate emails among whatever was entered are blocked.
  const suggestionsHaveDuplicates = new Set(suggestions.map(s => s.email.toLowerCase().trim()).filter(Boolean)).size < suggestions.filter(s => s.email.trim()).length;
  const canSubmit = !suggestionsHaveDuplicates && !loading;

  const handleScoreChange = (key: keyof typeof scores, value: number) => {
    setScores(prev => ({ ...prev, [key]: Math.min(10, Math.max(1, value)) }));
  };

  const handleAddSuggestion = () => {
    setSuggestions([...suggestions, { name: '', email: '', note: '' }]);
  };

  const handleRemoveSuggestion = (index: number) => {
    setSuggestions(suggestions.filter((_, i) => i !== index));
  };

  const handleUpdateSuggestion = (index: number, field: keyof ReviewerSuggestion, value: string) => {
    setSuggestions(suggestions.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    ));
  };

  const confirmRecommendation = async () => {
    if (!selectedRecommendation) return;
    setError('');
    setLoading(true);
    try {
      await submitEditorRecommendation(manuscriptId, selectedRecommendation);
      onSubmitSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to record recommendation');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (suggestionsHaveDuplicates) {
      setError('Please remove duplicate reviewer emails');
      return;
    }

    if (!strengths.trim() || !weaknesses.trim()) {
      setError('Please provide strengths and weaknesses');
      return;
    }

    setLoading(true);

    try {
      // Get the recommendation from the button that was clicked
      const recommendation = (e.currentTarget as any).dataset.recommendation as 'minor_revision' | 'major_revision' | 'accept';

      // Filter out empty suggestions
      const validSuggestions = suggestions
        .filter(s => s.name.trim() || s.email.trim())
        .map(s => ({
          name: s.name.trim() || s.email.split('@')[0],
          email: s.email.trim(),
          note: s.note.trim() || '',
        }));

      await submitEditorAssessment(assignmentId, {
        scientificMerit: scores.scientificMerit,
        noveltyInnovation: scores.noveltyInnovation,
        methodologyQuality: scores.methodologyQuality,
        literatureAdequacy: scores.literatureAdequacy,
        ethicalCompliance: scores.ethicalCompliance,
        dataReliability: scores.dataReliability,
        writingQuality: scores.writingQuality,
        strengths,
        weaknesses,
        mandatoryRevisions,
        commentsToCoordinator,
        criteriaReasons,
        suggestedReviewers: validSuggestions,
      });

      // The button only captured the recommendation into a local UI label --
      // it was never actually persisted, so editor_assignments.recommendation
      // stayed null and the Coordinator's Decision tab always showed
      // "Pending" no matter what the editor picked here. Persist it for real.
      const recommendationMap: Record<string, 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION'> = {
        accept: 'ACCEPT',
        minor_revision: 'MINOR_REVISION',
        major_revision: 'MAJOR_REVISION',
      };
      await submitEditorRecommendation(manuscriptId, recommendationMap[recommendation]);

      setSubmittedRecommendation(recommendation);
      setSuccess('Evaluation submitted successfully! The coordinator will now review your reviewer suggestions.');
      setTimeout(() => {
        onSubmitSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit evaluation');
    } finally {
      setLoading(false);
    }
  };

  // A revision cycle resets assessment_status back to NOT_STARTED on this
  // same editor_assignments row (see coordinator_send_revision_to_editor()
  // in 0018_coordinator_revision_gate.sql), but the scores/strengths/
  // weaknesses from whenever the editor actually submitted are left in
  // place. The evaluation only ever happens once -- fall back to the
  // presence of real score data so it stays locked/read-only permanently
  // after that first submission instead of re-rendering a blank editable
  // form (with misleading default-5 scores) on every later revision cycle.
  const hasSubmittedEvaluation = assignment.assessment_status === 'SUBMITTED' || assignment.scientific_merit != null;

  if (hasSubmittedEvaluation) {
    const recommendations: Record<string, { label: string; color: string; bgColor: string }> = {
      MINOR_REVISION: { label: 'Minor Revision', color: 'text-yellow-900', bgColor: 'bg-yellow-50 border-yellow-200' },
      MAJOR_REVISION: { label: 'Major Revision', color: 'text-red-900', bgColor: 'bg-red-50 border-red-200' },
      ACCEPT: { label: 'Accept Submission', color: 'text-green-900', bgColor: 'bg-green-50 border-green-200' }
    };

    // assignment.recommendation is the real, persisted value -- prefer it
    // over the local submittedRecommendation state, which only reflects
    // whatever button was clicked in this browser tab and is lost on reload.
    // It's only treated as "decided" if it was submitted after the current
    // revision cycle started -- recommendation isn't reset per-cycle (only
    // assessment_status is), so a value from a prior cycle would otherwise
    // wrongly block the editor from deciding on a new revision.
    const recommendationIsCurrent = !latestRevision || !assignment.recommendation_submitted_at
      ? true
      : new Date(assignment.recommendation_submitted_at) > new Date(latestRevision.requested_at);

    if (assignment.recommendation && recommendationIsCurrent && recommendations[assignment.recommendation]) {
      const recommendation = recommendations[assignment.recommendation];
      return (
        <div className="space-y-6 pt-4">
          <div className={`border rounded-2xl p-8 text-center ${recommendation.bgColor}`}>
            <CheckCircle className={`w-12 h-12 mx-auto mb-4 ${recommendation.color}`} />
            <p className={`${recommendation.color} font-semibold mb-2`}>Evaluation Submitted</p>
            <p className={`text-sm ${recommendation.color}`}>Your evaluation and reviewer suggestions have been submitted to the coordinator.</p>
            <div className="mt-4 pt-4 border-t border-current border-opacity-20">
              <p className={`text-xs font-semibold uppercase tracking-wide ${recommendation.color} mb-2`}>Decision Made</p>
              <p className={`text-lg font-black ${recommendation.color}`}>{recommendation.label}</p>
            </div>
          </div>
        </div>
      );
    }

    // Evaluation was submitted but no recommendation was ever persisted
    // (e.g. submitted before this fix landed) -- let the editor record one
    // now without re-doing the whole evaluation.
    return (
      <div className="space-y-6 pt-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-4 text-blue-700" />
          <p className="text-blue-900 font-semibold mb-2">Evaluation Submitted</p>
          <p className="text-sm text-blue-800">Your evaluation and reviewer suggestions have been submitted to the coordinator.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-900">Recommendation</h3>
          <p className="text-xs text-slate-600">
            {isRevisionReview
              ? `You're deciding on the Revision ${latestRevision!.revision_number} resubmission. Accept sends it straight to the Coordinator's decision; requesting a revision opens Revision ${nextRevisionNumber}.`
              : "You haven't recorded a recommendation for this manuscript yet. Choose one below, then confirm."}
          </p>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-sm">{error}</div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => setSelectedRecommendation('MINOR_REVISION')}
              className={`flex-1 disabled:opacity-50 font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2 ${
                selectedRecommendation === 'MINOR_REVISION'
                  ? 'bg-yellow-800 text-white ring-2 ring-offset-2 ring-yellow-700'
                  : 'bg-yellow-700 hover:bg-yellow-800 text-white'
              }`}
            >
              {selectedRecommendation === 'MINOR_REVISION' && <CheckCircle className="w-4 h-4" />}
              {isRevisionReview ? `Request Revision ${nextRevisionNumber} (Minor)` : 'Minor Revision'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setSelectedRecommendation('MAJOR_REVISION')}
              className={`flex-1 disabled:opacity-50 font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2 ${
                selectedRecommendation === 'MAJOR_REVISION'
                  ? 'bg-red-800 text-white ring-2 ring-offset-2 ring-red-700'
                  : 'bg-red-700 hover:bg-red-800 text-white'
              }`}
            >
              {selectedRecommendation === 'MAJOR_REVISION' && <CheckCircle className="w-4 h-4" />}
              {isRevisionReview ? `Request Revision ${nextRevisionNumber} (Major)` : 'Major Revision'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setSelectedRecommendation('ACCEPT')}
              className={`flex-1 disabled:opacity-50 font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2 ${
                selectedRecommendation === 'ACCEPT'
                  ? 'bg-green-800 text-white ring-2 ring-offset-2 ring-green-700'
                  : 'bg-green-700 hover:bg-green-800 text-white'
              }`}
            >
              {selectedRecommendation === 'ACCEPT' && <CheckCircle className="w-4 h-4" />}
              {isRevisionReview ? 'Accept & Send to Decision' : 'Accept Submission'}
            </button>
          </div>

          {selectedRecommendation && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
              <p className="text-xs text-slate-600">
                Confirm <span className="font-bold">{recommendations[selectedRecommendation].label}</span> as your recommendation?
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setSelectedRecommendation(null)}
                  className="px-3 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={confirmRecommendation}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center gap-2"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-32 pt-4">
      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="text-sm font-semibold">{success}</span>
        </div>
      )}

      {/* Evaluation Criteria */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">EVALUATION CRITERIA</h3>
          <span className="text-sm text-blue-600 font-semibold">Scale: 1 (Poor) to 10 (Excellent)</span>
        </div>

        {CRITERIA.map((c, idx) => (
          <div key={c.key} className="border-b border-slate-200 pb-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900">{idx + 1}. {c.label.toUpperCase()}</h4>
                <p className="text-xs text-slate-600 mt-1">{c.description}</p>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={loading}
                  className="w-4 h-4 border border-slate-300 rounded"
                />
                <span className="text-xs font-semibold text-slate-700">N/A</span>
              </label>
            </div>

            <div className="flex gap-2 mb-3 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleScoreChange(c.key as any, num)}
                  disabled={loading}
                  className={`w-10 h-10 rounded text-sm font-bold transition ${
                    (scores as any)[c.key] === num
                      ? 'bg-slate-400 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            <p className="text-xs text-blue-600 font-semibold mb-3">SCORE SELECTION: {(scores as any)[c.key]} / 10</p>

            <label className="block text-xs font-bold text-slate-700 mb-2">Reason for this score</label>
            <textarea
              value={(criteriaReasons as any)[c.key]}
              onChange={(e) => setCriteriaReasons(prev => ({ ...prev, [c.key]: e.target.value }))}
              placeholder="Explain your score for this criterion..."
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
              rows={2}
            />
          </div>
        ))}
      </div>

      {/* Qualitative Feedback */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-900">Qualitative Feedback</h3>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">Strengths *</label>
          <textarea
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            placeholder="Describe the manuscript's strengths..."
            disabled={loading}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">Weaknesses *</label>
          <textarea
            value={weaknesses}
            onChange={(e) => setWeaknesses(e.target.value)}
            placeholder="Describe the manuscript's weaknesses..."
            disabled={loading}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">Mandatory Revisions</label>
          <textarea
            value={mandatoryRevisions}
            onChange={(e) => setMandatoryRevisions(e.target.value)}
            placeholder="List any mandatory revisions required..."
            disabled={loading}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">Comments to Coordinator</label>
          <textarea
            value={commentsToCoordinator}
            onChange={(e) => setCommentsToCoordinator(e.target.value)}
            placeholder="Private comments for the coordinator..."
            disabled={loading}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
            rows={2}
          />
        </div>
      </div>

      {/* Submit Buttons with Recommendations */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          onClick={(e) => {
            e.currentTarget.dataset.recommendation = 'minor_revision';
            handleSubmit(e as any);
          }}
          disabled={!canSubmit || loading}
          className="flex-1 bg-yellow-700 hover:bg-yellow-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isRevisionReview ? `Request Revision ${nextRevisionNumber} (Minor)` : 'Minor Revision'}
        </button>

        <button
          type="submit"
          onClick={(e) => {
            e.currentTarget.dataset.recommendation = 'major_revision';
            handleSubmit(e as any);
          }}
          disabled={!canSubmit || loading}
          className="flex-1 bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isRevisionReview ? `Request Revision ${nextRevisionNumber} (Major)` : 'Major Revision'}
        </button>

        <button
          type="submit"
          onClick={(e) => {
            e.currentTarget.dataset.recommendation = 'accept';
            handleSubmit(e as any);
          }}
          disabled={!canSubmit || loading}
          className="flex-1 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isRevisionReview ? 'Accept & Send to Decision' : 'Accept Submission'}
        </button>
      </div>
    </form>
  );
}
