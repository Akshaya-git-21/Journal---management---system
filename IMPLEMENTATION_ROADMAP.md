# JMS Workflow Implementation Roadmap
**Objective:** Complete end-to-end editorial workflow  
**Estimated Duration:** 4 days, ~60 hours of development  
**Priority:** CRITICAL - Blocks production deployment

---

## TEST MATRIX: Current Implementation Status

### Workflow Step | Component | Status | Issue | Fix Priority
```
1. Author submits | AuthorWorkspace | ✅ WORKING | None | -
2. Coordinator queue | CoordinatorWorkspace | ✅ WORKING | None | -
3. Assign editor | CoordinatorWorkspace | ✅ WORKING | None | -
4. Editor receives | EditorWorkspace | ⚠️ PARTIAL | No Accept/Decline UI | CRITICAL
5. Editor accepts | EditorWorkspace | ❌ MISSING | No response UI | CRITICAL
6. Editor evaluates | EditorWorkspace | ✅ WORKING | Good form | -
7. Editor 3-decision | EditorWorkspace | ❌ MISSING | No panel | CRITICAL
8. Coordinator reviews | CoordinatorWorkspace | ❌ MISSING | No package UI | CRITICAL
9. Assign reviewers | CoordinatorWorkspace | ✅ WORKING | Works but feedback missing | HIGH
10. Reviewer accepts | ReviewerWorkspace | ✅ WORKING | None | -
11. Reviewer evaluates | ReviewerWorkspace | ✅ WORKING | None | -
12. 2nd reviewer eval | ReviewerWorkspace | ✅ WORKING | None | -
13. Coordinator sees 2/2 | CoordinatorWorkspace | ⚠️ PARTIAL | Manual refresh needed | HIGH
14. Review reports | CoordinatorWorkspace | ❌ MISSING | No display UI | CRITICAL
15. Final decision | CoordinatorWorkspace | ⚠️ PARTIAL | Modal incomplete | CRITICAL
16. Author revision req | AuthorWorkspace | ✅ WORKING | Status shows | -
17. Revision cycle | EditorWorkspace | ⚠️ PARTIAL | Unclear re-entry | MEDIUM
18. Publish decision | CoordinatorWorkspace | ⚠️ PARTIAL | Modal needs work | CRITICAL
19. Author published | AuthorWorkspace | ✅ WORKING | Status shows | -
20. Publisher DOI | PublisherWorkspace | ✅ WORKING | None | -
```

---

## DETAILED IMPLEMENTATION TASKS

### CRITICAL PRIORITY (Must do before production)

---

## Task C.1: Editor Accept/Decline Manuscript Entry Point
**File:** `src/components/EditorWorkspace.tsx`  
**Lines:** ~200-300  
**Estimated Time:** 2 hours  
**Blocking:** Task C.2, C.3

### Current Code Problem
```typescript
// Line ~132-134: Jumps straight to detail without checking status
if (selected) {
  return <AssignmentDetail details={selected} onBack={() => setSelectedManuscriptId(null)} />;
}
```

**This is wrong because:**
- Editor hasn't accepted yet (status='INVITED')
- Should show modal asking to accept/decline first
- Currently bypasses the `respond_to_editor_assignment()` RPC call

### Solution

**File:** `src/components/EditorWorkspace.tsx` - Replace lines 64-134

```typescript
export default function EditorWorkspace({ currentUser }: EditorWorkspaceProps) {
  // ... existing state ...
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptModalAssignment, setAcceptModalAssignment] = useState<EditorManuscriptDetails | null>(null);
  const [respondingToAssignment, setRespondingToAssignment] = useState(false);

  // ... existing useEffect ...

  // NEW FUNCTION
  const handleShowAcceptModal = (details: EditorManuscriptDetails) => {
    // Only show for INVITED assignments
    if (details.assignment.status === 'INVITED') {
      setAcceptModalAssignment(details);
      setShowAcceptModal(true);
    } else if (details.assignment.status === 'ACCEPTED') {
      // Already accepted, go to detail
      setSelectedManuscriptId(details.manuscript.id);
    }
  };

  // NEW FUNCTION
  const handleRespondToAssignment = async (assignmentId: string, accept: boolean) => {
    setRespondingToAssignment(true);
    try {
      await respondToAssignment(assignmentId, accept);
      setShowAcceptModal(false);
      setAcceptModalAssignment(null);
      
      if (accept) {
        // Refresh and show detail
        await load();
        setTimeout(() => setSelectedManuscriptId(acceptModalAssignment?.manuscript.id || null), 300);
      } else {
        // Just close and refresh list
        await load();
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setRespondingToAssignment(false);
    }
  };

  const selected = rows.find((r) => r.manuscript.id === selectedManuscriptId) || null;

  // NEW: Show accept modal if needed
  if (showAcceptModal && acceptModalAssignment) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#1a4038] to-[#0f2e2a] text-white p-6 rounded-t-2xl">
            <h2 className="text-2xl font-bold">Editorial Assignment</h2>
            <p className="text-emerald-100 text-sm mt-1">Awaiting your response</p>
          </div>

          {/* Content */}
          <div className="p-8">
            <p className="text-slate-700 mb-2">You have been assigned to provide an editorial assessment for:</p>
            
            <div className="bg-slate-50 p-4 rounded-lg mb-6 border border-slate-200">
              <p className="font-bold text-slate-900 text-lg">{acceptModalAssignment.manuscript.title}</p>
              <p className="text-xs text-slate-500 mt-2">
                Submitted by: {acceptModalAssignment.manuscript.author_name}
              </p>
              <p className="text-xs text-slate-500">
                Abstract: {acceptModalAssignment.manuscript.abstract.substring(0, 100)}...
              </p>
            </div>

            <p className="text-sm text-slate-600 mb-6">
              If you accept, you will evaluate this manuscript and recommend whether to proceed to peer review or request revisions.
            </p>

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => handleRespondToAssignment(acceptModalAssignment.assignment.id, true)}
                disabled={respondingToAssignment}
                className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {respondingToAssignment ? 'Processing...' : '✓ Accept Assignment'}
              </button>
              <button
                onClick={() => handleRespondToAssignment(acceptModalAssignment.assignment.id, false)}
                disabled={respondingToAssignment}
                className="w-full border-2 border-red-600 text-red-600 py-3 rounded-lg font-semibold hover:bg-red-50 disabled:opacity-50 transition"
              >
                {respondingToAssignment ? 'Processing...' : '✕ Decline Assignment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Existing detail view but only if ACCEPTED
  if (selected && selected.assignment.status === 'ACCEPTED') {
    return <AssignmentDetail details={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} currentUser={currentUser} />;
  }

  // ... rest of component (list view) ...
```

**Test:**
```
1. Login as Editor
2. See assignment with status=INVITED
3. Click on manuscript
4. Should see "Accept/Decline" modal (NOT detail form)
5. Click Accept
6. Modal closes, refreshes list
7. Click again, should now show detail form
8. Check database: editor_assignments.status should be 'ACCEPTED'
```

---

## Task C.2: Editor 3-Decision Panel
**File:** `src/components/EditorWorkspace.tsx`  
**Lines:** ~400-550  
**Estimated Time:** 3 hours  
**Blocking:** Task C.3, H.1  
**Depends on:** C.1

### Current Code Problem
- EditorWorkspace shows evaluation form
- After submission, no decision panel
- No "Request Minor Revision" / "Request Major Revision" / "Accept" options
- Editor can't provide guidance to coordinator

### Solution

Find `AssignmentDetail` component (around line ~200). Add this after evaluation section:

```typescript
// NEW: Add to AssignmentDetail return, after existing evaluation form
if (details.assignment.assessment_status === 'SUBMITTED') {
  return (
    <EvaluationDecisionPanel
      details={details}
      onBack={() => onBack()}
      onDecisionMade={onChanged}
      currentUser={currentUser}
    />
  );
}

// NEW COMPONENT: Add at end of EditorWorkspace.tsx
function EvaluationDecisionPanel({
  details,
  onBack,
  onDecisionMade,
  currentUser
}: {
  details: EditorManuscriptDetails;
  onBack: () => void;
  onDecisionMade: () => void;
  currentUser?: any;
}) {
  const [selectedDecision, setSelectedDecision] = useState<ReviewerRecommendation | null>(
    details.assignment.recommendation || null
  );
  const [submitting, setSubmitting] = useState(false);

  const handleDecision = async (decision: ReviewerRecommendation) => {
    setSubmitting(true);
    try {
      await submitEditorRecommendation(details.manuscript.id, decision);
      alert('Your recommendation has been recorded.');
      onDecisionMade();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const decisionOptions = [
    {
      value: 'ACCEPT' as const,
      label: 'Accept Submission',
      description: 'Ready for peer review - recommend acceptance',
      icon: '✓',
      color: 'emerald'
    },
    {
      value: 'MINOR_REVISION' as const,
      label: 'Request Minor Revision',
      description: 'Minor revisions needed, then proceed to peer review',
      icon: '◊',
      color: 'amber'
    },
    {
      value: 'MAJOR_REVISION' as const,
      label: 'Request Major Revision',
      description: 'Substantial revisions needed before peer review',
      icon: '◆',
      color: 'orange'
    },
  ];

  return (
    <div className="w-full h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a4038] to-[#0f2e2a] text-white px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-black">{details.manuscript.title}</h1>
          <p className="text-emerald-100 text-sm mt-1">Final Editorial Assessment</p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-semibold">Back</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Success Badge */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 mb-8 flex items-start gap-4">
            <Check className="w-6 h-6 text-emerald-600 mt-1 shrink-0" />
            <div>
              <h3 className="font-bold text-emerald-900 mb-1">✓ Your Evaluation Submitted</h3>
              <p className="text-sm text-emerald-700">
                Your 7-criteria assessment and comments have been recorded. 
                Now provide your final recommendation for how to proceed with this manuscript.
              </p>
            </div>
          </div>

          {/* View Previous Evaluation (Optional) */}
          <details className="mb-8">
            <summary className="cursor-pointer font-semibold text-slate-700 hover:text-slate-900 p-3 bg-slate-100 rounded-lg">
              View Your Full Evaluation
            </summary>
            <div className="mt-4 bg-white p-6 border border-slate-200 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div><strong>Scientific Merit:</strong> {details.assignment.scientific_merit}/10</div>
                <div><strong>Novelty:</strong> {details.assignment.novelty_innovation}/10</div>
                <div><strong>Methodology:</strong> {details.assignment.methodology_quality}/10</div>
                <div><strong>Literature:</strong> {details.assignment.literature_adequacy}/10</div>
                <div><strong>Ethics:</strong> {details.assignment.ethical_compliance}/10</div>
                <div><strong>Data Reliability:</strong> {details.assignment.data_reliability}/10</div>
                <div className="col-span-2"><strong>Writing Quality:</strong> {details.assignment.writing_quality}/10</div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="font-semibold text-slate-900 mb-2">Strengths:</p>
                <p className="text-slate-700 text-sm mb-4">{details.assignment.strengths}</p>
                <p className="font-semibold text-slate-900 mb-2">Weaknesses:</p>
                <p className="text-slate-700 text-sm">{details.assignment.weaknesses}</p>
              </div>
            </div>
          </details>

          {/* Decision Panel */}
          <div className="bg-white rounded-lg border border-slate-200 p-8">
            <h3 className="text-2xl font-black text-slate-900 mb-2">Final Editorial Decision</h3>
            <p className="text-slate-600 mb-8">
              Based on your evaluation above, what is your recommendation for this manuscript?
            </p>

            <div className="space-y-4">
              {decisionOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedDecision(option.value)}
                  className={`w-full text-left p-6 rounded-lg border-2 transition ${
                    selectedDecision === option.value
                      ? `border-${option.color}-500 bg-${option.color}-50 shadow-lg`
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`text-3xl font-black text-${option.color}-600 w-12 text-center`}>
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">{option.label}</h4>
                      <p className={`text-sm text-${option.color}-700`}>
                        {option.description}
                      </p>
                    </div>
                    {selectedDecision === option.value && (
                      <CheckCircle className={`w-6 h-6 text-${option.color}-600 mt-1`} />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Action Button */}
            <div className="mt-8 flex gap-4">
              <button
                onClick={onBack}
                className="flex-1 px-6 py-3 border-2 border-slate-300 rounded-lg font-semibold text-slate-900 hover:bg-slate-50 transition"
              >
                Back to Evaluation
              </button>
              <button
                onClick={() => {
                  if (!selectedDecision) {
                    alert('Please select a decision.');
                    return;
                  }
                  handleDecision(selectedDecision);
                }}
                disabled={!selectedDecision || submitting}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition ${
                  selectedDecision
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-slate-400 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Submitting...' : 'Confirm & Submit Recommendation'}
              </button>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p>
              <strong>Note:</strong> Your recommendation guides the Coordinator's peer review selection. 
              The Coordinator makes the final decision after reviewer assessments are complete.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Test:**
```
1. Login as Editor with ACCEPTED assignment
2. Complete evaluation form
3. Submit evaluation
4. Should see 3-decision panel with:
   - Accept Submission
   - Request Minor Revision
   - Request Major Revision
5. Select one
6. Click "Confirm & Submit"
7. Should return to list
8. Check database: editor_assignments.recommendation should be set
9. Check database: editor_assignments.recommendation_submitted_at should be now
```

---

## Task C.3: Coordinator Review Package & Decision Panel
**File:** `src/components/CoordinatorWorkspace.tsx`  
**Lines:** ~600-900  
**Estimated Time:** 4 hours  
**Blocking:** Nothing (parallel work)  
**Depends on:** C.1, C.2 for testing

### Current Code Problem
- When both reviewers submit, Coordinator can't see reports
- No "Review Package" with Summary/Reviewers/Decision tabs
- No "Publish Decision" modal
- No final decision UI

### Solution

Add this large component to CoordinatorWorkspace.tsx:

```typescript
// NEW COMPONENT: Add at end of file
interface ReviewPackageProps {
  manuscript: ManuscriptRow;
  editorAssignment: EditorAssignmentRow | null;
  reviewers: ReviewerAssignmentRow[];
  onClose: () => void;
  onDecisionPublished: () => void;
}

function ReviewPackageModal({
  manuscript,
  editorAssignment,
  reviewers,
  onClose,
  onDecisionPublished
}: ReviewPackageProps) {
  const [tab, setTab] = useState<'summary' | 'reviewers' | 'decision'>('summary');
  const [decision, setDecision] = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null>(null);
  const [decisionLetter, setDecisionLetter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const reviewSubmittedCount = reviewers.filter(r => r.status === 'SUBMITTED').length;
  const reviewReadyCount = reviewers.filter(r => r.status !== 'DECLINED').length;

  const handlePublishDecision = async () => {
    if (!decision || !decisionLetter.trim()) {
      alert('Please select a decision and write a letter to the author.');
      return;
    }
    if (!confirmChecked) {
      alert('Please confirm you have reviewed all materials.');
      return;
    }

    setSubmitting(true);
    try {
      await publishDecision(manuscript.id, decision, decisionLetter);
      alert(`Decision published. ${
        decision === 'ACCEPT' ? 'Manuscript accepted.' :
        decision === 'REJECT' ? 'Manuscript rejected.' :
        'Revision request sent to author.'
      }`);
      onDecisionPublished();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a4038] to-[#0f2e2a] text-white px-6 py-6 flex items-start justify-between rounded-t-2xl">
          <div className="flex-1">
            <h2 className="text-2xl font-black mb-2">{manuscript.title}</h2>
            <div className="text-emerald-100 text-sm space-y-1">
              <p>Manuscript ID: {manuscript.id}</p>
              <p>Author: {manuscript.author_name}</p>
              <p>Status: {reviewSubmittedCount}/{reviewReadyCount} Reviews Submitted</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {[
            { id: 'summary', label: '📋 Summary', count: null },
            { id: 'reviewers', label: '👥 Reviewers', count: reviewSubmittedCount },
            { id: 'decision', label: '⚖️ Decision', count: null }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex-1 px-6 py-4 font-semibold border-b-2 transition text-sm ${
                tab === t.id
                  ? 'border-emerald-600 text-emerald-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
              {t.count !== null && <span className="ml-2 bg-slate-300 text-slate-900 px-2 py-0.5 rounded-full text-xs font-bold">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-8">
          {/* SUMMARY TAB */}
          {tab === 'summary' && editorAssignment && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-bold text-blue-900 mb-4">✓ Editor Assessment Received</h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-black text-blue-600">{editorAssignment.scientific_merit}</div>
                    <div className="text-xs text-blue-700 font-semibold mt-1">Scientific Merit</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-black text-blue-600">{editorAssignment.novelty_innovation}</div>
                    <div className="text-xs text-blue-700 font-semibold mt-1">Novelty</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-black text-blue-600">{editorAssignment.methodology_quality}</div>
                    <div className="text-xs text-blue-700 font-semibold mt-1">Methodology</div>
                  </div>
                </div>
                <div className="mb-4">
                  <span className="font-semibold text-blue-900">Editor Recommendation:</span>
                  <span className="ml-2 px-3 py-1 bg-blue-200 text-blue-900 rounded-full font-semibold text-sm">
                    {editorAssignment.recommendation || 'Not yet submitted'}
                  </span>
                </div>
                <div className="pt-4 border-t border-blue-200">
                  <p className="text-sm text-blue-800"><strong>Strengths:</strong> {editorAssignment.strengths}</p>
                  <p className="text-sm text-blue-800 mt-2"><strong>Concerns:</strong> {editorAssignment.weaknesses}</p>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <h3 className="font-bold text-purple-900 mb-4">👥 Reviewer Status</h3>
                <div className="space-y-2">
                  {reviewers.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-white rounded border border-purple-200">
                      <span className="font-semibold text-slate-900">Reviewer {i + 1}</span>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                        r.status === 'SUBMITTED' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-700' :
                        r.status === 'DECLINED' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {r.status === 'SUBMITTED' ? '✓ Submitted' :
                         r.status === 'ACCEPTED' ? '⏳ In Progress' :
                         r.status === 'DECLINED' ? '✕ Declined' :
                         'Invited'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REVIEWERS TAB */}
          {tab === 'reviewers' && (
            <div className="space-y-6">
              {reviewers.map((reviewer, idx) => (
                <div key={reviewer.id} className="border border-slate-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-lg text-slate-900">Reviewer {idx + 1}</h4>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      reviewer.status === 'SUBMITTED' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {reviewer.status === 'SUBMITTED' ? '✓ Submitted' :
                       reviewer.status === 'DECLINED' ? '✕ Declined' :
                       'Pending'}
                    </span>
                  </div>

                  {reviewer.status === 'SUBMITTED' ? (
                    <>
                      {/* Scores */}
                      <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded">
                        <div className="text-sm"><strong>Scientific Merit:</strong> {reviewer.scientific_merit}/10</div>
                        <div className="text-sm"><strong>Novelty:</strong> {reviewer.novelty_innovation}/10</div>
                        <div className="text-sm"><strong>Methodology:</strong> {reviewer.methodology_quality}/10</div>
                        <div className="text-sm"><strong>Literature:</strong> {reviewer.literature_adequacy}/10</div>
                        <div className="text-sm"><strong>Ethics:</strong> {reviewer.ethical_compliance}/10</div>
                        <div className="text-sm"><strong>Data:</strong> {reviewer.data_reliability}/10</div>
                      </div>

                      {/* Recommendation */}
                      <div className="mb-4">
                        <strong className="text-slate-900">Recommendation:</strong>
                        <span className="ml-2 px-3 py-1 bg-slate-200 text-slate-900 rounded font-semibold text-sm">
                          {reviewer.recommendation}
                        </span>
                      </div>

                      {/* Comments */}
                      <div className="mb-4">
                        <p className="font-semibold text-slate-900 mb-2">Comments to Author:</p>
                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded">{reviewer.comments_to_author}</p>
                      </div>

                      <div>
                        <p className="font-semibold text-slate-900 mb-2">Comments to Editor (Confidential):</p>
                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded">{reviewer.comments_to_editor}</p>
                      </div>
                    </>
                  ) : reviewer.status === 'DECLINED' ? (
                    <p className="text-red-700 text-sm font-semibold">This reviewer declined the invitation.</p>
                  ) : (
                    <p className="text-slate-600 text-sm">Waiting for reviewer response...</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* DECISION TAB */}
          {tab === 'decision' && reviewSubmittedCount >= 1 && (
            <div className="space-y-6">
              {/* Decision Selection */}
              <div>
                <h3 className="font-bold text-slate-900 mb-4">Select Final Decision</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: 'ACCEPT', label: 'Accept', icon: '✓', color: 'emerald', desc: 'Ready for publication' },
                    { value: 'MINOR_REVISION', label: 'Minor Revision', icon: '◊', color: 'amber', desc: 'Small changes needed' },
                    { value: 'MAJOR_REVISION', label: 'Major Revision', icon: '◆', color: 'orange', desc: 'Substantial rework' },
                    { value: 'REJECT', label: 'Reject', icon: '✕', color: 'red', desc: 'Not suitable' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDecision(opt.value as any)}
                      className={`p-4 border-2 rounded-lg transition text-left ${
                        decision === opt.value
                          ? `border-${opt.color}-500 bg-${opt.color}-50 shadow-lg`
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`text-2xl font-black text-${opt.color}-600 mb-1`}>{opt.icon}</div>
                      <div className="font-bold text-slate-900">{opt.label}</div>
                      <div className="text-xs text-slate-600">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Decision Letter */}
              <div>
                <h3 className="font-bold text-slate-900 mb-4">Decision Letter to Author</h3>
                <textarea
                  value={decisionLetter}
                  onChange={(e) => setDecisionLetter(e.target.value)}
                  placeholder="Dear Author,\n\nThank you for your submission. After careful review by our editorial team and peer reviewers...\n\nBest regards,\nEditor"
                  className="w-full h-48 border border-slate-300 rounded-lg p-4 font-mono text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              {/* Confirmation */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm text-blue-900">
                    <strong>I confirm:</strong> I have reviewed the editor assessment, 
                    all reviewer reports ({reviewSubmittedCount}/{reviewReadyCount}), 
                    and the manuscript. I am ready to publish this decision.
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 rounded-lg font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePublishDecision}
                  disabled={!decision || !decisionLetter.trim() || !confirmChecked || submitting}
                  className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition ${
                    decision && decisionLetter.trim() && confirmChecked
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-slate-400 cursor-not-allowed'
                  }`}
                >
                  {submitting ? 'Publishing...' : '→ Publish Decision'}
                </button>
              </div>
            </div>
          )}

          {/* Not ready message */}
          {reviewSubmittedCount === 0 && tab === 'decision' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
              <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
              <p className="font-semibold text-amber-900">Awaiting Reviewer Submissions</p>
              <p className="text-sm text-amber-800 mt-2">
                Come back when at least 1 reviewer has submitted their assessment.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

Then in CoordinatorWorkspace main component, add button to show modal:

```typescript
// In CoordinatorWorkspace, around line 400 where showing manuscript detail:
const [showReviewPackage, setShowReviewPackage] = useState(false);
const [reviewPackageManuscript, setReviewPackageManuscript] = useState<ManuscriptRow | null>(null);

// When showing manuscript detail with status AWAITING_DECISION:
if (selectedId && selectedManuscript?.status === 'AWAITING_DECISION') {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <button
        onClick={() => {
          setReviewPackageManuscript(selectedManuscript);
          setShowReviewPackage(true);
        }}
        className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-emerald-700"
      >
        📦 View Complete Review Package
      </button>
    </div>
  );
}

// Show modal
if (showReviewPackage && reviewPackageManuscript) {
  return (
    <ReviewPackageModal
      manuscript={reviewPackageManuscript}
      editorAssignment={selectedEditorAssignment || null}
      reviewers={selectedReviewers || []}
      onClose={() => setShowReviewPackage(false)}
      onDecisionPublished={() => {
        setShowReviewPackage(false);
        load();
      }}
    />
  );
}
```

**Test:**
```
1. Login as Coordinator
2. Have 1 reviewer submit evaluation
3. Manuscript status should be UNDER_REVIEW
4. Click on manuscript
5. Should see "View Complete Review Package" button
6. Click button
7. Should show modal with 3 tabs:
   - Summary (show editor assessment)
   - Reviewers (show reviewer 1's report)
   - Decision (button disabled - need 2nd reviewer)
8. Wait for 2nd reviewer to submit
9. Click manuscript again
10. Click button
11. Decision tab should be enabled
12. Select decision, write letter
13. Check confirmation
14. Click "Publish Decision"
15. Should see success message
16. Check database: manuscripts.status should be ACCEPTED/REJECTED/REVISION_REQUESTED
```

---

## HIGH PRIORITY (Should do before production)

---

## Task H.1: Realtime Review Counter (Coordinator)
**File:** `src/components/CoordinatorWorkspace.tsx`  
**Estimated Time:** 1.5 hours  
**Depends on:** C.3

Add realtime subscription for reviewer_assignments changes:

```typescript
// Add to useEffect in CoordinatorWorkspace
useEffect(() => {
  const channel = supabase
    .channel('reviewer_assignments_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reviewer_assignments'
      },
      () => {
        // Reload manuscripts to update review counts
        load();
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}, []);
```

**Test:**
```
1. Open 2 windows: Coordinator and Reviewer
2. Reviewer submits evaluation
3. Coordinator's display should update to "1/2" WITHOUT refresh
```

---

## Task H.2: Back Buttons Throughout
**File:** Multiple  
**Estimated Time:** 1 hour  
**Components to fix:**
- EditorWorkspace: Add "← Back" at top of detail views
- CoordinatorWorkspace: Add "← Back" to manuscript detail
- ReviewerWorkspace: Add "← Back" to evaluation modal

Example pattern:
```typescript
<button
  onClick={onBack}
  className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition"
>
  <ArrowLeft className="w-4 h-4" />
  <span className="font-semibold">Back</span>
</button>
```

---

## MEDIUM PRIORITY (Nice to have, don't block)

---

## Task M.1: Revision File Association
**File:** `src/lib/workflow.ts`  
**Estimated Time:** 2 hours  
**Impact:** Tracks which files belong to which revision

**Code:** (Already shown in Part 8.5 of Audit)

---

## Task M.2: Double-Blind RLS Policy
**File:** New `supabase/migrations/0008_fix_double_blind_rls.sql`  
**Estimated Time:** 1.5 hours  
**Impact:** Prevents reviewer cross-viewing

**Code:** (Already shown in Audit Part 3, RLS section)

---

## Task M.3: Real File Preview
**File:** `src/components/FilePreviewModal.tsx`  
**Estimated Time:** 2 hours  
**Impact:** Actual PDFs display instead of simulated content

Replace PDF display section with iframe approach (shown in Audit Part 5).

---

## IMPLEMENTATION TIMELINE

### DAY 1 (8 hours)
- Task C.1: Accept/Decline (2h)
- Task C.2: 3-Decision Panel (3h)
- Task H.1: Realtime Counter (1.5h)
- Task H.2: Back Buttons (1.5h)

### DAY 2 (8 hours)
- Task C.3: Review Package Modal (4h)
- Task M.1: Revision Files (2h)
- Break & Testing (2h)

### DAY 3 (8 hours)
- Task M.2: Double-Blind RLS (1.5h)
- Task M.3: File Preview (2h)
- End-to-end testing all workflows (4.5h)

### DAY 4 (8 hours)
- Security testing (RLS, access control) (3h)
- Realtime verification (5 concurrent users) (2h)
- Performance testing (2h)
- Production readiness sign-off (1h)

---

## SUCCESS CRITERIA

All items in Verification Checklist (Part 8 of Audit) must pass.

Must also verify:
- [ ] No console errors in browser
- [ ] All RPC calls return without error
- [ ] Database logs show clean transactions
- [ ] Realtime subscriptions active and firing
- [ ] RLS policies preventing unauthorized access
- [ ] File uploads and previews working

---

## ROLLBACK PLAN

If any critical issue found post-deployment:

1. Revert EditorWorkspace.tsx to previous version
2. Disable "Review Package" button in CoordinatorWorkspace
3. Disable 3-decision panel
4. Application reverts to "partial workflow" state (still usable but missing steps)

---

**End of Implementation Roadmap**
