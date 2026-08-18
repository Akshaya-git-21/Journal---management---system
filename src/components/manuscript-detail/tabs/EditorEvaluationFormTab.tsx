import React, { useState } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
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
        suggestedReviewers: validSuggestions,
      });

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
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
        <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
        <p className="text-emerald-900 font-semibold mb-2">Evaluation Submitted</p>
        <p className="text-sm text-emerald-700">Your evaluation and reviewer suggestions have been submitted to the coordinator.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-6">Evaluation Criteria (1-10 scale)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CRITERIA.map(c => (
            <div key={c.key}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700">{c.label}</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={(scores as any)[c.key]}
                  onChange={(e) => handleScoreChange(c.key as any, parseInt(e.target.value) || 5)}
                  disabled={loading}
                  className="w-16 px-2 py-1 border border-slate-300 rounded text-sm font-bold text-center"
                />
              </div>
              <p className="text-xs text-slate-600 mb-2">{c.description}</p>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all"
                  style={{ width: `${((scores as any)[c.key] / 10) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
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

      {/* Reviewer Suggestions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-black text-slate-900 mb-1">Reviewer Suggestions (Optional)</h3>
          <p className="text-xs text-slate-600 mb-4">Suggesting reviewers is optional -- you may submit your evaluation with none, one, or several.</p>
        </div>

        <div className="space-y-3">
          {suggestions.map((suggestion, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">Reviewer {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSuggestion(idx)}
                  disabled={loading}
                  className="text-slate-400 hover:text-red-600 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Reviewer name"
                value={suggestion.name}
                onChange={(e) => handleUpdateSuggestion(idx, 'name', e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-emerald-500"
              />
              <input
                type="email"
                placeholder="reviewer@example.com"
                value={suggestion.email}
                onChange={(e) => handleUpdateSuggestion(idx, 'email', e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Expertise or note (optional)"
                value={suggestion.note}
                onChange={(e) => handleUpdateSuggestion(idx, 'note', e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddSuggestion}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
        >
          <Plus className="w-4 h-4" />
          Add Another Reviewer
        </button>

        <div className="text-xs text-slate-600 space-y-1">
          <p>{suggestions.filter(s => s.name.trim() || s.email.trim()).length > 0
            ? `✓ ${suggestions.filter(s => s.name.trim() || s.email.trim()).length} suggestion(s) provided`
            : 'No reviewer suggestions provided -- this is optional, you may submit without any.'}</p>
          {suggestionsHaveDuplicates && <p className="text-red-600">⚠ Duplicate email addresses detected</p>}
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Submitting...' : 'Submit Evaluation & Reviewer Suggestions'}
      </button>
    </form>
  );
}
