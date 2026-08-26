import { CheckCircle, XCircle } from 'lucide-react';
import { EditorAssignmentRow, ProfileRow, ScreeningResponse } from '../../../lib/workflow';

interface Props {
  editorAssignments: EditorAssignmentRow[];
  profiles: Record<string, ProfileRow>;
}

const QUESTION_LABELS: Record<string, string> = {
  scope_fit: 'Journal Scope Fit',
  novelty_significance: 'Novelty and Significance',
  scientific_soundness: 'Scientific Soundness',
  completeness: 'Manuscript Completeness',
  guidelines_compliance: 'Author Guidelines Compliance',
  ethical_compliance: 'Ethical Compliance',
  disclosures: 'Disclosures and Declarations',
  research_integrity: 'Research Integrity',
  language_clarity: 'Language and Clarity',
  reviewer_suitability: 'Reviewer Suitability',
};

// Legacy 7-criterion 1-10 scoring, kept for manuscripts evaluated before the
// Yes/No screening questionnaire replaced it -- see 0025_editor_screening_questionnaire.sql.
const LEGACY_CRITERIA = [
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
  // A revision cycle resets assessment_status back to NOT_STARTED (and
  // clears assessment_submitted_at) on the same editor_assignments row --
  // see coordinator_send_revision_to_editor() in
  // 0018_coordinator_revision_gate.sql -- but leaves the prior submission's
  // data untouched. Fall back to any assignment that actually has data so
  // it still displays here instead of appearing empty.
  const assessment =
    editorAssignments.find(a => a.assessment_status === 'SUBMITTED') ||
    editorAssignments.find(a => (a.screening_responses?.length ?? 0) > 0 || a.scientific_merit != null);

  if (!assessment) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <p className="text-slate-600">No editor evaluation submitted yet</p>
      </div>
    );
  }

  const hasScreeningQuestionnaire = (assessment.screening_responses?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {hasScreeningQuestionnaire ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Screening Questionnaire</h3>
          <div className="space-y-4">
            {(assessment.screening_responses as ScreeningResponse[]).map((r, idx) => (
              <div key={r.question_id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-800">{idx + 1}. {QUESTION_LABELS[r.question_id] || r.question_id}</p>
                  {r.answer ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" /> Yes
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                      <XCircle className="w-3.5 h-3.5" /> No
                    </span>
                  )}
                </div>
                {r.reason && (
                  <div className="bg-slate-50 p-3 rounded border-l-2 border-slate-300">
                    <p className="text-xs font-semibold text-slate-600 mb-1">REASON:</p>
                    <p className="text-sm text-slate-700">{r.reason}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Evaluation Criteria</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LEGACY_CRITERIA.map((c) => {
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
        </div>
      )}

      {/* Editor Comments / qualitative feedback */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-900 mb-4">{hasScreeningQuestionnaire ? 'Editor Comments' : 'Qualitative Feedback'}</h3>

        {hasScreeningQuestionnaire ? (
          assessment.screening_comments ? (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{assessment.screening_comments}</p>
          ) : (
            <p className="text-sm text-slate-400 italic">No additional comments provided.</p>
          )
        ) : (
          <>
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
          </>
        )}
      </div>

      {assessment.action_reason && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">
            {assessment.recommendation === 'REJECT' ? 'Rejection Reason' : 'Return to Author Reason'}
          </p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{assessment.action_reason}</p>
        </div>
      )}

      {/* Recommendation -- this tab only ever shows the screening-stage
          evaluation (see ManuscriptDetailTabs.tsx: "Initial Editorial
          Screening"), so the recommendation is always one of the Editor's
          3 screening actions (EditorEvaluationFormTab.tsx's ACTION_META):
          Reject Submission / Return to Author / Move to Next Stage. Show
          that action name, not the raw MAJOR_REVISION/ACCEPT recommendation
          value the RPC stores it as. */}
      {assessment.recommendation && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">Editor Decision</p>
          <p className="text-2xl font-black text-emerald-700">
            {assessment.recommendation === 'REJECT' ? 'Reject Submission'
              : assessment.recommendation === 'ACCEPT' ? 'Move to Next Stage'
              : 'Return to Author'}
          </p>
        </div>
      )}
    </div>
  );
}
