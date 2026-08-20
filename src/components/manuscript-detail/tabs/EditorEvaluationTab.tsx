import { EditorAssignmentRow, ProfileRow } from '../../../lib/workflow';

interface Props {
  editorAssignments: EditorAssignmentRow[];
  profiles: Record<string, ProfileRow>;
}

const CRITERIA = [
  { key: 'scientific_merit', reasonKey: 'scientificMerit', label: 'Scientific Merit' },
  { key: 'novelty_innovation', reasonKey: 'noveltyInnovation', label: 'Novelty & Innovation' },
  { key: 'methodology_quality', reasonKey: 'methodologyQuality', label: 'Methodology Quality' },
  { key: 'literature_adequacy', reasonKey: 'literatureAdequacy', label: 'Literature Adequacy' },
  { key: 'ethical_compliance', reasonKey: 'ethicalCompliance', label: 'Ethical Compliance' },
  { key: 'data_reliability', reasonKey: 'dataReliability', label: 'Data Reliability' },
  { key: 'writing_quality', reasonKey: 'writingQuality', label: 'Writing Quality' },
];

export function EditorEvaluationTab({
  editorAssignments,
  profiles
}: Props) {
  const assessment = editorAssignments.find(a => a.assessment_status === 'SUBMITTED');

  if (!assessment) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <p className="text-slate-600">No editor evaluation submitted yet</p>
      </div>
    );
  }

  const scores = CRITERIA.map(c => (assessment as any)[c.key]).filter(Boolean);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';

  return (
    <div className="space-y-6">
      {/* Evaluation scores */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4">Evaluation Criteria</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CRITERIA.map((c) => {
            const value = (assessment as any)[c.key];
            return (
              <div key={c.key} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-700">{c.label}</p>
                  <p className="text-lg font-bold text-emerald-700">{value}/10</p>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-emerald-600 h-2 rounded-full"
                    style={{ width: `${value ? (value / 10) * 100 : 0}%` }}
                  ></div>
                </div>
                {(assessment.criteria_reasons as any)?.[c.reasonKey] && (
                  <div className="mt-3 bg-slate-50 p-3 rounded border-l-2 border-emerald-600">
                    <p className="text-xs font-semibold text-slate-600 mb-1">REASONING:</p>
                    <p className="text-sm text-slate-700">{(assessment.criteria_reasons as any)[c.reasonKey]}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Overall score */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">Overall Average Score</p>
            <p className="text-2xl font-black text-emerald-700">{avgScore} / 10</p>
          </div>
        </div>
      </div>

      {/* Qualitative feedback */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-900 mb-4">Qualitative Feedback</h3>

        {assessment.strengths && (
          <div>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Strengths</p>
            <p className="text-sm text-slate-700">{assessment.strengths}</p>
          </div>
        )}

        {assessment.weaknesses && (
          <div>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Weaknesses</p>
            <p className="text-sm text-slate-700">{assessment.weaknesses}</p>
          </div>
        )}

        {assessment.mandatory_revisions && (
          <div>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Mandatory Revisions</p>
            <p className="text-sm text-slate-700">{assessment.mandatory_revisions}</p>
          </div>
        )}

        {assessment.comments_to_coordinator && (
          <div>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Comments to Coordinator</p>
            <p className="text-sm text-slate-700">{assessment.comments_to_coordinator}</p>
          </div>
        )}
      </div>

      {/* Recommendation */}
      {assessment.recommendation && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">Editor Recommendation</p>
          <p className="text-2xl font-black text-emerald-700">{assessment.recommendation.replace(/_/g, ' ')}</p>
        </div>
      )}
    </div>
  );
}
