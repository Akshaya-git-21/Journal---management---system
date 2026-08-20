import React, { useState } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle, Send } from 'lucide-react';
import { EditorAssignmentRow, SuggestedReviewerRow, submitEditorAssessment } from '../../../lib/workflow';
import { supabase } from '../../../lib/supabase';

interface Props {
  assignmentId: string;
  manuscriptId: string;
  assignment: EditorAssignmentRow;
  suggestedReviewers: SuggestedReviewerRow[];
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
  onSubmitSuccess,
}: Props) {
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

  if (assignment.assessment_status === 'SUBMITTED') {
    const getRecommendationDisplay = () => {
      const recommendations: Record<string, { label: string; color: string; bgColor: string }> = {
        minor_revision: { label: 'Minor Revision', color: 'text-yellow-900', bgColor: 'bg-yellow-50 border-yellow-200' },
        major_revision: { label: 'Major Revision', color: 'text-red-900', bgColor: 'bg-red-50 border-red-200' },
        accept: { label: 'Accept Submission', color: 'text-green-900', bgColor: 'bg-green-50 border-green-200' }
      };
      return recommendations[submittedRecommendation || 'minor_revision'];
    };

    const recommendation = getRecommendationDisplay();

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
          Minor Revision
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
          Major Revision
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
          Accept Submission
        </button>
      </div>
    </form>
  );
}
