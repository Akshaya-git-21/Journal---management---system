import React, { useState } from 'react';
import {
  Lock, AlertCircle, CheckCircle2, Clock, Send
} from 'lucide-react';

interface EvaluationState {
  recommendation: 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null;
  criteria: {
    originality: number;
    methodology: number;
    clarity: number;
    significance: number;
    technicalQuality: number;
  };
  commentsToAuthors: string;
  confidentialComments: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}

interface EditorEvaluationPanelProps {
  currentEvaluation?: number;
  totalEvaluations?: number;
  onSaveDraft?: (state: EvaluationState) => void;
  onSubmitEvaluation?: (state: EvaluationState) => void;
  initialState?: EvaluationState;
  isSaving?: boolean;
  isSubmitting?: boolean;
}

const RECOMMENDATION_OPTIONS = [
  { value: 'ACCEPT', label: 'Accept', color: 'green', icon: '✓' },
  { value: 'MINOR_REVISION', label: 'Minor Revisions', color: 'blue', icon: '→' },
  { value: 'MAJOR_REVISION', label: 'Major Revisions', color: 'amber', icon: '⚠' },
  { value: 'REJECT', label: 'Reject', color: 'red', icon: '✕' }
] as const;

const CRITERIA = [
  { key: 'originality', label: 'Originality' },
  { key: 'methodology', label: 'Methodology' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'significance', label: 'Significance' },
  { key: 'technicalQuality', label: 'Technical Quality' }
] as const;

export default function EditorEvaluationPanel({
  currentEvaluation = 2,
  totalEvaluations = 5,
  onSaveDraft,
  onSubmitEvaluation,
  initialState,
  isSaving = false,
  isSubmitting = false
}: EditorEvaluationPanelProps) {
  const [evaluation, setEvaluation] = useState<EvaluationState>(
    initialState || {
      recommendation: null,
      criteria: {
        originality: 0,
        methodology: 0,
        clarity: 0,
        significance: 0,
        technicalQuality: 0
      },
      commentsToAuthors: '',
      confidentialComments: '',
      confidence: null
    }
  );

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Calculate completion stats
  const criteriaCompleted = Object.values(evaluation.criteria).filter((v: number) => v > 0).length;
  const isRecommendationSelected = evaluation.recommendation !== null;
  const hasRequiredFields = isRecommendationSelected && criteriaCompleted > 0;

  // Validation
  const validateEvaluation = () => {
    const errors: string[] = [];
    if (!evaluation.recommendation) errors.push('Please select a recommendation');
    if (criteriaCompleted === 0) errors.push('Please rate at least one criterion');
    if (!evaluation.commentsToAuthors.trim()) errors.push('Comments to authors are required');
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSaveDraft = () => {
    onSaveDraft?.(evaluation);
  };

  const handleSubmitEvaluation = () => {
    if (validateEvaluation()) {
      onSubmitEvaluation?.(evaluation);
    }
  };

  const updateRecommendation = (value: EvaluationState['recommendation']) => {
    setEvaluation(prev => ({ ...prev, recommendation: value }));
  };

  const updateCriteria = (key: keyof typeof evaluation.criteria, value: number) => {
    setEvaluation(prev => ({
      ...prev,
      criteria: { ...prev.criteria, [key]: value }
    }));
  };

  const updateCommentsToAuthors = (text: string) => {
    setEvaluation(prev => ({ ...prev, commentsToAuthors: text }));
  };

  const updateConfidentialComments = (text: string) => {
    setEvaluation(prev => ({ ...prev, confidentialComments: text }));
  };

  const updateConfidence = (value: EvaluationState['confidence']) => {
    setEvaluation(prev => ({ ...prev, confidence: value }));
  };

  const getRecommendationColor = (rec: typeof RECOMMENDATION_OPTIONS[number]['value']) => {
    const option = RECOMMENDATION_OPTIONS.find(o => o.value === rec);
    const colorMap: Record<string, string> = {
      green: 'bg-green-50 border-green-300 text-green-900',
      blue: 'bg-blue-50 border-blue-300 text-blue-900',
      amber: 'bg-amber-50 border-amber-300 text-amber-900',
      red: 'bg-red-50 border-red-300 text-red-900'
    };
    return colorMap[option?.color || ''];
  };

  const getRecommendationBgColor = (rec: typeof RECOMMENDATION_OPTIONS[number]['value']) => {
    const option = RECOMMENDATION_OPTIONS.find(o => o.value === rec);
    const bgMap: Record<string, string> = {
      green: 'bg-green-500',
      blue: 'bg-blue-500',
      amber: 'bg-amber-500',
      red: 'bg-red-500'
    };
    return bgMap[option?.color || ''];
  };

  return (
    <aside className="w-80 bg-slate-50 border-l border-slate-200 flex flex-col h-screen overflow-hidden">
      {/* Header Section - Sticky */}
      <div className="shrink-0 bg-white border-b border-slate-200 p-6 space-y-4">
        {/* Title and Status */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
              Editor Evaluation
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">Assessment in progress</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-[11px] font-semibold text-blue-700">
            <Clock className="w-3 h-3" />
            In Progress
          </span>
        </div>

        {/* Progress Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-600">Evaluation Progress</span>
            <span className="font-semibold text-slate-900">{currentEvaluation} of {totalEvaluations}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(currentEvaluation / totalEvaluations) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* Overall Recommendation Section */}
          <div className="space-y-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
              Overall Recommendation
            </h3>
            <div className="space-y-2">
              {RECOMMENDATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateRecommendation(option.value)}
                  className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                    evaluation.recommendation === option.value
                      ? `${getRecommendationColor(option.value)} border-current`
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border-2 ${
                      evaluation.recommendation === option.value
                        ? `${getRecommendationBgColor(option.value)} border-current`
                        : 'border-slate-300 bg-white'
                    } flex items-center justify-center`}>
                      {evaluation.recommendation === option.value && (
                        <span className="text-white text-xs">✓</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold">{option.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Evaluation Criteria Section */}
          <div className="space-y-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
              Evaluation Criteria
            </h3>
            <div className="space-y-4">
              {CRITERIA.map((criterion) => (
                <div key={criterion.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-medium text-slate-900">
                      {criterion.label}
                    </label>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {evaluation.criteria[criterion.key as keyof typeof evaluation.criteria] || '—'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => updateCriteria(criterion.key as keyof typeof evaluation.criteria, rating)}
                        className={`flex-1 h-8 rounded border-2 transition-all font-semibold text-xs flex items-center justify-center ${
                          evaluation.criteria[criterion.key as keyof typeof evaluation.criteria] === rating
                            ? 'bg-blue-500 border-blue-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comments to Authors Section */}
          <div className="space-y-2">
            <label className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
              Comments to Authors
            </label>
            <textarea
              value={evaluation.commentsToAuthors}
              onChange={(e) => updateCommentsToAuthors(e.target.value)}
              placeholder="Provide constructive feedback for the authors..."
              className="w-full p-3 border border-slate-200 rounded-lg text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-900 placeholder-slate-400"
              rows={4}
            />
          </div>

          {/* Confidential Comments Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <label className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
                Confidential Comments
              </label>
            </div>
            <p className="text-[11px] text-slate-500">Only visible to the editor and coordinator</p>
            <textarea
              value={evaluation.confidentialComments}
              onChange={(e) => updateConfidentialComments(e.target.value)}
              placeholder="These comments will only be visible to the editor/coordinator..."
              className="w-full p-3 border border-slate-200 rounded-lg text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50 text-slate-700 placeholder-slate-400"
              rows={3}
            />
          </div>

          {/* Confidence Section */}
          <div className="space-y-3">
            <label className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
              Confidence Level
            </label>
            <div className="space-y-2">
              {(['LOW', 'MEDIUM', 'HIGH'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => updateConfidence(evaluation.confidence === level ? null : level)}
                  className={`w-full p-2.5 rounded-lg border-2 text-left transition-all ${
                    evaluation.confidence === level
                      ? 'bg-blue-50 border-blue-300 text-blue-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="text-sm font-semibold">{level.charAt(0) + level.slice(1).toLowerCase()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Summary Card */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
              Evaluation Summary
            </h3>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase">Recommendation</span>
                <span className={`text-[13px] font-bold ${
                  evaluation.recommendation
                    ? 'text-slate-900'
                    : 'text-slate-400'
                }`}>
                  {evaluation.recommendation
                    ? RECOMMENDATION_OPTIONS.find(o => o.value === evaluation.recommendation)?.label
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase">Confidence</span>
                <span className={`text-[13px] font-bold ${
                  evaluation.confidence
                    ? 'text-slate-900'
                    : 'text-slate-400'
                }`}>
                  {evaluation.confidence || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase">Criteria Rated</span>
                <span className={`text-[13px] font-bold ${
                  criteriaCompleted > 0
                    ? 'text-slate-900'
                    : 'text-slate-400'
                }`}>
                  {criteriaCompleted} / {CRITERIA.length}
                </span>
              </div>
            </div>
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              {validationErrors.map((error, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-amber-800">{error}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Action Area */}
      <div className="shrink-0 bg-white border-t border-slate-200 p-6 space-y-3">
        <button
          onClick={handleSaveDraft}
          disabled={isSaving}
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving Draft...' : 'Save Draft'}
        </button>
        <button
          onClick={handleSubmitEvaluation}
          disabled={isSubmitting || !hasRequiredFields}
          className={`w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-colors flex items-center justify-center gap-2 ${
            hasRequiredFields && !isSubmitting
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-blue-400 cursor-not-allowed opacity-75'
          }`}
        >
          <Send className="w-4 h-4" />
          {isSubmitting ? 'Submitting...' : 'Submit Evaluation'}
        </button>
      </div>
    </aside>
  );
}
