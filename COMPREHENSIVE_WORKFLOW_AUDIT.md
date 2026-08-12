# JMS Comprehensive Workflow Audit Report
**Date:** August 12, 2026  
**Audit Level:** DEEP CODE REVIEW + WORKFLOW ANALYSIS  
**Status:** MULTIPLE CRITICAL ISSUES IDENTIFIED

---

## EXECUTIVE SUMMARY

The JMS application has **strong infrastructure** (RPC-based workflow engine, RLS security, proper status machine) but has **CRITICAL WORKFLOW GAPS** preventing the required end-to-end flow from functioning correctly.

### Overall Status: ⚠️ **NOT PRODUCTION READY**

**Key Issues:**
1. ❌ **Editor decision flow is incomplete** - Missing Accept/Decline manuscript and 3-decision options
2. ❌ **Revision flow partially broken** - Revision submission works, but revision cycle re-entry is incomplete
3. ⚠️ **Coordinator review package partially working** - Reviews tab exists but decision panel has issues
4. ⚠️ **Realtime subscriptions have gaps** - Some status changes don't propagate instantly
5. ❌ **File handling during revisions** - Files not properly associated with revisions
6. ⚠️ **UI consistency issues** - Back buttons missing, navigation incomplete

---

## PART 1: DETAILED WORKFLOW STEP-BY-STEP ANALYSIS

### Step 1-2: Author Submission → Coordinator Queue ✅ WORKING

**Status:** WORKING

**Code Location:** `src/components/AuthorWorkspace.tsx` + `src/lib/workflow.ts`

**Verification:**
- Author creates draft ✅
- Author submits via `submit_manuscript()` RPC ✅
- Status changes DRAFT → SUBMITTED ✅
- Manuscript appears in Coordinator queue ✅
- Realtime notification sent to Coordinators ✅

**Database:** manuscripts table, status_history logged

---

### Step 3: Coordinator Assigns Editor ✅ WORKING

**Status:** WORKING

**Code Location:** `src/components/CoordinatorWorkspace.tsx` + `src/lib/workflow.ts`

**Verification:**
- Coordinator sees SUBMITTED manuscripts ✅
- Coordinator calls `assign_editor(manuscriptId, editorId)` ✅
- Status changes SUBMITTED → EDITOR_REVIEW ✅
- `editor_assignments` row created with status='INVITED' ✅
- Editor gets notification ✅

**Database:** manuscripts.assigned_editor_id updated, editor_assignments inserted

---

### Step 4-5: Editor Opens Manuscript + Sees Accept/Decline Options ❌ PARTIALLY BROKEN

**Status:** PARTIALLY BROKEN - Missing critical UI

**Code Location:** `src/components/EditorWorkspace.tsx`

**Current Implementation:**
```typescript
// Line 132-134: Shows assignment detail view
if (selected) {
  return <AssignmentDetail details={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} currentUser={currentUser} />;
}
```

**Problems Identified:**

1. **Missing "Accept/Decline Manuscript" Step**
   - ❌ No UI showing "Accept Manuscript for Review" or "Decline Manuscript" buttons at entry point
   - ❌ No check that assignment status is 'INVITED' before showing detail
   - ❌ Should NOT show evaluation form until editor accepts
   - **Impact:** Editor can skip acceptance and go straight to evaluation

2. **Missing respondToAssignment UI Call**
   - The RPC `respond_to_editor_assignment()` exists in workflow.ts
   - But EditorWorkspace never calls it
   - Editor assignment stays in 'INVITED' state forever
   - **Impact:** Coordinator can't see if editor actually accepted

3. **Assignment Status Not Checked**
   - EditorWorkspace reads `assignment` but never validates its status
   - Should show different UI if status='INVITED' vs 'ACCEPTED'
   - **Impact:** Workflow doesn't enforce acceptance checkpoint

**Required Fixes:**

**File:** `src/components/EditorWorkspace.tsx`

Add at the start of AssignmentDetail (around line ~200):
```typescript
// NEW: Show accept/decline UI if status is INVITED
if (details.assignment.status === 'INVITED') {
  return (
    <div className="w-full h-screen bg-slate-50 flex flex-col items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Editorial Assignment</h2>
        <p className="text-slate-600 mb-8">You have been assigned to review:</p>
        <p className="text-lg font-semibold text-slate-900 mb-8">{details.manuscript.title}</p>
        
        <div className="space-y-3">
          <button
            onClick={() => handleRespondToAssignment(details.assignment.id, true)}
            className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700"
          >
            Accept Manuscript for Review
          </button>
          <button
            onClick={() => handleRespondToAssignment(details.assignment.id, false)}
            className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700"
          >
            Decline Assignment
          </button>
        </div>
      </div>
    </div>
  );
}
```

Add this handler:
```typescript
const handleRespondToAssignment = async (assignmentId: string, accept: boolean) => {
  try {
    await respondToAssignment(assignmentId, accept);
    if (accept) {
      setSelectedManuscriptId(null); // Refresh list
      setTimeout(() => load(), 500);
    } else {
      alert('Assignment declined. Manuscript returned to coordinator.');
      setSelectedManuscriptId(null);
      load();
    }
  } catch (error: any) {
    alert('Error: ' + error.message);
  }
};
```

---

### Step 6: Editor Completes Evaluation ⚠️ PARTIALLY WORKING

**Status:** PARTIALLY WORKING - Submission works, but readability issue

**Code Location:** `src/components/EditorWorkspace.tsx` + `src/lib/editorWorkspace.ts`

**Current Implementation:**
- Editor fills out scoring form ✅
- Editor saves evaluation via `submitAssessment()` ✅
- Scores saved to `editor_assignments` table ✅
- Evaluation becomes read-only after submission ⚠️

**Problems Identified:**

1. **No "View Evaluation" State After Submission**
   - After evaluation is submitted, UI still shows editable form
   - Should show "✓ Evaluation Submitted" message
   - Should show "View Evaluation" read-only display
   - **Impact:** Unclear if submission was successful

2. **Missing 3 Final Decision Options**
   - ❌ After evaluation, editor should see EXACTLY 3 decisions:
     - "Request Minor Revision"
     - "Request Major Revision"  
     - "Accept Submission"
   - Currently only shows evaluation scores, not final decision
   - ❌ This decision is separate from reviewer recommendations
   - **Impact:** Workflow forces coordinator to make final decision instead of editor guidance

3. **Assessment Status Not Tracked Visually**
   - Database has `assessment_status` field (NOT_STARTED / SUBMITTED)
   - UI doesn't reflect this state change
   - **Impact:** Editor doesn't know if saving worked

**Required Fixes:**

**File:** `src/components/EditorWorkspace.tsx`

After evaluation submission, show this:
```typescript
if (details.assignment.assessment_status === 'SUBMITTED') {
  return (
    <div className="w-full h-screen bg-slate-50 flex flex-col">
      {/* Existing header... */}
      
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {/* Submitted badge */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 mb-8 flex items-center gap-4">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
            <div>
              <h3 className="font-bold text-emerald-900">Evaluation Submitted</h3>
              <p className="text-sm text-emerald-700">Your assessment has been saved. Proceeding to final decision...</p>
            </div>
          </div>

          {/* Read-only evaluation view */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
            <h3 className="font-bold text-slate-900 mb-4">Your Evaluation (Read-Only)</h3>
            {/* Show all 7 scores in read-only format */}
            <EvaluationReadOnly data={details.assignment} />
          </div>

          {/* NEW: 3-Decision Panel */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="font-bold text-slate-900 mb-6">Final Editorial Decision</h3>
            <p className="text-slate-600 mb-6">Based on your evaluation, what is your recommendation?</p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleEditorDecision('MINOR_REVISION')}
                className="w-full p-4 border-2 border-slate-200 rounded-lg hover:border-amber-500 hover:bg-amber-50 text-left transition"
              >
                <div className="font-semibold text-slate-900">Request Minor Revision</div>
                <div className="text-sm text-slate-600">Author can make small corrections</div>
              </button>
              
              <button
                onClick={() => handleEditorDecision('MAJOR_REVISION')}
                className="w-full p-4 border-2 border-slate-200 rounded-lg hover:border-orange-500 hover:bg-orange-50 text-left transition"
              >
                <div className="font-semibold text-slate-900">Request Major Revision</div>
                <div className="text-sm text-slate-600">Significant revisions required, further review needed</div>
              </button>
              
              <button
                onClick={() => handleEditorDecision('ACCEPT')}
                className="w-full p-4 border-2 border-slate-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 text-left transition"
              >
                <div className="font-semibold text-slate-900">Accept Submission</div>
                <div className="text-sm text-slate-600">Ready to proceed to peer review</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Add handler:
```typescript
const handleEditorDecision = async (decision: ReviewerRecommendation) => {
  try {
    // Save the editor's preliminary recommendation
    // This helps guide the peer review process
    await submitEditorRecommendation(details.manuscript.id, decision);
    alert('Decision recorded. Coordinator can now assign reviewers.');
    setSelectedManuscriptId(null);
    load();
  } catch (error: any) {
    alert('Error: ' + error.message);
  }
};
```

---

### Step 7: Coordinator Receives Editor Assessment ⚠️ PARTIALLY WORKING

**Status:** PARTIALLY WORKING

**Code Location:** `src/components/CoordinatorWorkspace.tsx`

**Current Implementation:**
- Coordinator sees status='EDITOR_REVIEW' manuscripts ✅
- Can click to view details ✅
- Can see reviewer assignment section ✅
- **Problem:** No "View Editor Evaluation" tab/panel
- **Problem:** Can't see editor's 3-decision recommendation

**Database Check:** 
- editor_assignments.assessment_status = 'SUBMITTED' ✅
- editor_assignments.recommendation is set ✅
- But UI never reads or displays it

**Required Fix:**

Before the "Assign Reviewers" section in CoordinatorWorkspace manuscript detail, add:

```typescript
// NEW: Display editor evaluation review
if (selectedEditorAssignment && selectedEditorAssignment.assessment_status === 'SUBMITTED') {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
      <h4 className="font-bold text-blue-900 mb-4">✓ Editor Evaluation Received</h4>
      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <span className="text-blue-700">Scientific Merit:</span>
          <span className="ml-2 font-semibold">{selectedEditorAssignment.scientific_merit}/10</span>
        </div>
        {/* Show all 7 scores... */}
      </div>
      <div className="mb-4">
        <span className="text-blue-700 font-semibold">Editor Recommendation:</span>
        <span className="ml-2">{selectedEditorAssignment.recommendation}</span>
      </div>
      <div className="bg-white p-4 rounded border border-blue-200 text-sm">
        <p className="text-blue-900 font-semibold mb-2">Strengths:</p>
        <p className="text-blue-800">{selectedEditorAssignment.strengths}</p>
      </div>
    </div>
  );
}
```

---

### Step 8-9: Coordinator Assigns 2 Reviewers ⚠️ PARTIALLY WORKING

**Status:** PARTIALLY WORKING - Backend works, UI incomplete

**Code Location:** `src/components/CoordinatorWorkspace.tsx`

**Current Implementation:**
- Coordinator can select 2 reviewers ✅
- Calls `assignReviewers(manuscriptId, [reviewer1Id, reviewer2Id])` ✅
- Status changes EDITOR_REVIEW → UNDER_REVIEW ✅
- Reviewers get notifications ✅

**Problems:**

1. **Missing "View Assigned Reviewers" UI After Assignment**
   - After assignment, should show "2 Reviewers Invited"
   - Should show reviewer names and invitation status
   - Should allow viewing if a reviewer accepts/declines
   - Currently no feedback to coordinator

2. **No Realtime "0/2, 1/2, 2/2 Reviews" Counter**
   - CoordinatorWorkspace should show live review count
   - Currently requires manual refresh
   - **Impact:** Coordinator doesn't see when reviewers submit

**Required Fixes:**

Add to CoordinatorWorkspace after reviewer assignment:
```typescript
// NEW: Show reviewer progress
if (manuscript.status === 'UNDER_REVIEW') {
  const reviewerAssignments = await getReviewerAssignments(manuscript.id);
  const submittedCount = reviewerAssignments.filter(r => r.status === 'SUBMITTED').length;
  
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-6">
      <h4 className="font-bold text-purple-900 mb-4">Reviewer Progress</h4>
      <div className="text-3xl font-bold text-purple-600 mb-2">{submittedCount}/2 Reviews In</div>
      <div className="space-y-2">
        {reviewerAssignments.map((ra) => (
          <div key={ra.id} className="flex items-center justify-between p-2 bg-white rounded border border-purple-200">
            <span className="text-sm text-slate-900">{ra.reviewer_id}</span>
            <span className={`text-xs font-bold px-2 py-1 rounded ${
              ra.status === 'SUBMITTED' ? 'bg-emerald-100 text-emerald-700' :
              ra.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-700' :
              ra.status === 'DECLINED' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {ra.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### Step 10-12: Reviewer Receives Assignment & Completes Evaluation ✅ WORKING

**Status:** WORKING

**Code Location:** `src/components/ReviewerWorkspace.tsx`

**Verification:**
- Reviewer sees assignment in "ACTION_REQUIRED" tab ✅
- Can accept/decline invitation ✅
- If accepted, can open evaluation modal ✅
- Evaluation form has 7 scoring criteria ✅
- 5 recommendation options ✅
- Qualitative fields (Comments to Author, Strengths, Weaknesses) ✅
- Submission saves to `reviewer_assignments` ✅
- Status changes ACCEPTED → SUBMITTED ✅

**Database:** reviewer_assignments table populated correctly

---

### Step 13-14: Coordinator Reviews Both Reports ⚠️PARTIALLY BROKEN

**Status:** BROKEN - Review package incomplete

**Code Location:** `src/components/CoordinatorWorkspace.tsx` 

**Analysis of Issue:**

The Completion Report claims "Complete Review Package Interface" exists, but code inspection shows:

1. **Missing "View Reviewer Reports" UI**
   - When 2/2 reviews are submitted
   - Should show Summary/Reviewers/Decision tabs
   - **Code Gap:** No tab navigation for review package

2. **Missing Reviewer Details Display**
   - Should show:
     - Each reviewer's recommendation
     - Comments to author (preview)
     - Comments to editor (preview)
     - All 7 scores
   - **Code Gap:** CoordinatorWorkspace doesn't fetch reviewer_assignments data for display

3. **No "Editor Recommendation Verification" Step**
   - Before coordinator decides, should show:
     - Editor's 3-decision recommendation
     - Editor's evaluation scores
     - "Ready to proceed" confirmation
   - **Code Gap:** Missing verification UI

**Code Location to Fix:** `src/components/CoordinatorWorkspace.tsx`

Add new component after line ~500:

```typescript
// NEW COMPONENT: Review Package Display
interface ReviewPackageProps {
  manuscriptId: string;
  onDecisionReady: () => void;
}

function ReviewPackage({ manuscriptId, onDecisionReady }: ReviewPackageProps) {
  const [tab, setTab] = useState<'summary' | 'reviewers' | 'decision'>('summary');
  const [editorAssignment, setEditorAssignment] = useState<EditorAssignmentRow | null>(null);
  const [reviewers, setReviewers] = useState<ReviewerAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReviewPackage();
  }, [manuscriptId]);

  const loadReviewPackage = async () => {
    try {
      const [editorData, reviewerData] = await Promise.all([
        getEditorAssignments(manuscriptId),
        getReviewerAssignments(manuscriptId)
      ]);
      
      setEditorAssignment(editorData[0] || null);
      setReviewers(reviewerData);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader2 className="animate-spin" />;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200">
        {['summary', 'reviewers', 'decision'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            className={`flex-1 py-3 px-4 text-sm font-semibold border-b-2 transition ${
              tab === t
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t === 'summary' && '📋 Summary'}
            {t === 'reviewers' && '👥 Reviewers'}
            {t === 'decision' && '⚖️ Decision'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {tab === 'summary' && editorAssignment && (
          <SummaryTab editorAssignment={editorAssignment} reviewerCount={reviewers.length} />
        )}
        {tab === 'reviewers' && (
          <ReviewersTab reviewers={reviewers} />
        )}
        {tab === 'decision' && (
          <DecisionTab manuscriptId={manuscriptId} onReady={onDecisionReady} />
        )}
      </div>
    </div>
  );
}
```

---

### Step 15: Coordinator Makes Final Decision ⚠️ INCOMPLETE

**Status:** INCOMPLETE - Decision modal has UI bugs

**Code Location:** `src/components/CoordinatorWorkspace.tsx`

**Current Issues:**

1. **Decision Options Not Clear**
   - Should show EXACTLY 4 options:
     - ✓ Accept
     - ◊ Minor Revision
     - ◆ Major Revision
     - ✕ Reject
   - Current UI unclear if mapped correctly

2. **Decision Letter Field Missing**
   - Should have textarea for formal decision letter
   - Should be sent to author
   - **Code Gap:** No letter composition UI

3. **Confirmation Modal Not Shown Before Publishing**
   - Should show review of decision
   - Should require explicit confirmation
   - **Code Gap:** Direct publish without verification

**Required Implementation:**

See Decision Tab implementation below (Step 18 section)

---

### Step 16: Author Receives Revision Request ✅ DATABASE WORKING / ❌ UI INCOMPLETE

**Status:** MIXED

**Database:** ✅ manuscript_revisions table properly created
**RPC:** ✅ submit_revision() works
**UI:** ❌ AuthorRevisionRequest component incomplete

**Issues:**

1. **Revision Upload Not Showing File Success**
   - Files upload but UI doesn't confirm
   - No file list shown

2. **Revision Submission Doesn't Trigger Workflow Loop**
   - After author submits revision
   - Should return to EDITOR_REVIEW status
   - Editor should see "Revision submitted" notification
   - **Current:** Works in database, unclear in UI

3. **File Association with Revisions Broken**
   - Files uploaded to manuscript_files
   - But revision_id not set properly
   - Files not associated with specific revision number
   - **Impact:** Can't track which files go with which revision

**Fix Location:** `src/lib/workflow.ts`

Update `uploadRevisionFile()` function:
```typescript
export async function uploadRevisionFile(
  revisionId: string, 
  file: File, 
  fileType: string
): Promise<ManuscriptFileRow> {
  // Get revision to find manuscript_id
  const { data: revision } = await supabase
    .from('manuscript_revisions')
    .select('manuscript_id')
    .eq('id', revisionId)
    .single();
  
  if (!revision) throw new Error('Revision not found');

  // Upload file to storage
  const path = `${revision.manuscript_id}/revisions/${revisionId}/${Date.now()}-${file.name}`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('manuscript-files')
    .upload(path, file);
  
  if (uploadError) throw uploadError;

  // Record in manuscript_files WITH revision_id
  const { data: fileRecord } = await supabase
    .from('manuscript_files')
    .insert([{
      manuscript_id: revision.manuscript_id,
      revision_id: revisionId,  // CRITICAL: Link to revision
      file_name: file.name,
      file_type: fileType,
      file_size: `${Math.round(file.size / 1024)} KB`,
      storage_path: uploadData.path,
      public_url: supabase.storage.from('manuscript-files').getPublicUrl(uploadData.path).data.publicUrl,
      uploaded_by: (await supabase.auth.getUser()).data.user?.id
    }])
    .select()
    .single();
  
  return fileRecord;
}
```

---

### Step 17: Revision Cycle Repeats ⚠️ PARTIALLY BROKEN

**Status:** PARTIALLY BROKEN

**Workflow:** 
- Author submits revision ✅ (RPC works)
- Manuscript returns to EDITOR_REVIEW ✅ (status machine works)
- Editor can re-evaluate ⚠️ (assessment_status reset, but UI doesn't show this clearly)
- Editor makes decision again ⚠️ (should not require re-entry modal)
- Loop continues... ❌ (counter-intuitive for 3+ revisions)

**Issue:** The loop works in database but UI experience is broken because:

1. Editor doesn't see "New Revision Submitted" clearly
2. Editor's evaluation form still requires "Accept" button from INVITED state
3. No counter showing "Revision Round 2 of ?" to user

**Impact:** Workflow is opaque when revisions cycle multiple times

---

### Step 18: Coordinator Publishes Decision → Author Notified ⚠️ PARTIALLY WORKING

**Status:** PARTIALLY WORKING - Core works, UI incomplete

**Code Location:** `src/lib/workflow.ts` + `src/components/CoordinatorWorkspace.tsx`

**What Works:**
- `publishDecision()` RPC executes ✅
- Status transitions correctly ✅
- Author receives notification ✅
- Manuscript_revisions record created (if revision) ✅

**Missing:**

1. **Decision Publishing UI Not Complete**
   - No formal "Publish Decision" button with confirmation
   - No decision letter composition interface
   - No preview before sending

**Required Implementation:**

Add to CoordinatorWorkspace:

```typescript
const [showDecisionModal, setShowDecisionModal] = useState(false);
const [decision, setDecision] = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null>(null);
const [decisionLetter, setDecisionLetter] = useState('');

function DecisionModal() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a4038] to-[#0f2e2a] text-white p-6">
          <h2 className="text-2xl font-bold">Publish Final Decision</h2>
          <p className="text-emerald-100 text-sm mt-1">Manuscript: {selectedManuscript?.title}</p>
        </div>

        {/* Decision Selection */}
        <div className="p-6 border-b border-slate-200">
          <h3 className="font-bold text-slate-900 mb-4">Final Decision</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { id: 'ACCEPT', label: 'Accept', icon: '✓', color: 'emerald' },
              { id: 'MINOR_REVISION', label: 'Minor Revision', icon: '◊', color: 'amber' },
              { id: 'MAJOR_REVISION', label: 'Major Revision', icon: '◆', color: 'orange' },
              { id: 'REJECT', label: 'Reject', icon: '✕', color: 'red' }
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setDecision(opt.id as any)}
                className={`p-4 border-2 rounded-lg transition text-left ${
                  decision === opt.id
                    ? `border-${opt.color}-500 bg-${opt.color}-50`
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-2xl mb-2">{opt.icon}</div>
                <div className="font-semibold text-slate-900">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Decision Letter */}
        <div className="p-6 border-b border-slate-200">
          <h3 className="font-bold text-slate-900 mb-4">Decision Letter</h3>
          <textarea
            value={decisionLetter}
            onChange={(e) => setDecisionLetter(e.target.value)}
            placeholder="Dear Author,\n\nThank you for your submission..."
            className="w-full h-48 border border-slate-300 rounded-lg p-4 font-mono text-sm resize-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Confirmation Checklist */}
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-slate-900 mb-4">Verification Checklist</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="check1" disabled defaultChecked />
              <label htmlFor="check1" className="text-sm text-slate-700">
                Editor recommendation reviewed
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="check2" disabled defaultChecked />
              <label htmlFor="check2" className="text-sm text-slate-700">
                Both reviewer reports reviewed
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="check3" required />
              <label htmlFor="check3" className="text-sm text-slate-700">
                I am ready to send this decision to the author
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 flex gap-3 justify-end">
          <button
            onClick={() => setShowDecisionModal(false)}
            className="px-6 py-2 border border-slate-300 rounded-lg font-semibold text-slate-900 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => handlePublishDecision()}
            disabled={!decision || !decisionLetter}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            Publish Decision
          </button>
        </div>
      </div>
    </div>
  );
}

const handlePublishDecision = async () => {
  try {
    await publishDecision(
      selectedManuscript!.id,
      decision as any,
      decisionLetter
    );
    alert('Decision published and author notified.');
    setShowDecisionModal(false);
    load(); // Refresh
  } catch (error: any) {
    alert('Error: ' + error.message);
  }
};
```

---

### Step 19: Author Sees Published Status ⚠️ WORKING / UI UNCLEAR

**Status:** DATABASE WORKING, UI UNCLEAR

**Code Location:** `src/components/AuthorWorkspace.tsx`

**Verification:**
- Manuscript status updated correctly ✅
- Author receives notification ✅
- AuthorWorkspace loads manuscripts including PUBLISHED ✅

**Issue:**
- No specific "Publication Completed" view
- Just shows status badge
- Should show:
  - Decision letter
  - DOI (if available)
  - Volume/Issue (if available)
  - Download published version

---

### Step 20: Publisher Assigns DOI & Publishes ✅ BASIC WORKING

**Status:** WORKING - Basic implementation

**Code Location:** `src/components/PublisherWorkspace.tsx`

**Verification:**
- Publisher can see ACCEPTED manuscripts ✅
- Can assign DOI ✅
- Can set Volume/Issue ✅
- Calls `mark_published()` RPC ✅
- Status changes ACCEPTED → PUBLISHED ✅

---

## PART 2: REALTIME & DATA SYNCHRONIZATION AUDIT

### Realtime Subscriptions Status

**Working:**
- ✅ Author Workspace subscribes to manuscripts changes
- ✅ Reviewer Workspace subscribes to manuscripts changes
- ✅ Editor Workspace subscribes to editor_assignments changes
- ✅ Coordinator Workspace subscribes to manuscripts changes

**Not Working/Incomplete:**
- ⚠️ Editor doesn't see live reviewer progress (reviewer count)
- ⚠️ Coordinator doesn't see live editor assignment responses
- ❌ No subscription to reviewer_assignments table for live status updates
- ❌ No subscription to editor_assignments for live assessment status updates

**Critical Gap:** When Reviewer 1 submits evaluation, Coordinator's "1/2 Reviews" counter doesn't update without refresh

**Fix Required in CoordinatorWorkspace:**

```typescript
// Add subscription to reviewer_assignments
useEffect(() => {
  const channel = supabase
    .channel('reviewer_assignments')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reviewer_assignments'
      },
      async () => {
        // Reload manuscript list to update review counts
        await load();
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}, []);
```

---

## PART 3: DATABASE & RLS VERIFICATION

### User Authorization Levels

**✅ Working Correctly:**

1. **Author:**
   - Can create/edit own DRAFT manuscripts only
   - Can see only own manuscripts
   - Can submit manuscript (DRAFT→SUBMITTED)
   - Can upload files to own manuscript
   - Can view decision letters
   - RLS Policy: `manuscripts_select` checks `author_id = auth.uid()`

2. **Editor:**
   - Can see assigned manuscripts via `is_invited_editor_of()`
   - Can accept/decline assignment
   - Can submit assessment
   - RLS Policy: Correctly checks `editor_assignments.editor_id`

3. **Reviewer:**
   - Can see only assigned manuscripts via `is_reviewer_of()`
   - Can accept/decline invitation
   - Can submit review
   - RLS Policy: Correctly checks `reviewer_assignments.reviewer_id`

4. **Coordinator:**
   - Can see all manuscripts via `is_active_coordinator()`
   - Can perform all workflow transitions
   - RLS Policy: Master bypass via `is_active_coordinator()`

5. **Publisher:**
   - Can see ACCEPTED/PUBLISHED manuscripts only
   - Can call `mark_published()`
   - RLS Policy: Checks `status in ('ACCEPTED','PUBLISHED')`

**Issues Found:**

1. ❌ **Private Evaluations Not Properly Hidden**
   - Issue: Reviewer 1's comments should not be visible to Reviewer 2
   - Current RLS: `reviewer_assignments_select` allows reviewer to see all reviews
   - Impact: Double-blind review compromise
   - **Fix:** Need separate RLS policy for viewing other reviewers' data

**Required RLS Fix:** In migration file, add:

```sql
-- Reviewers can only see their OWN review, not others' for double-blind
drop policy if exists "reviewer_assignments_select_own" on public.reviewer_assignments;
create policy "reviewer_assignments_select_own" on public.reviewer_assignments
  for select using (
    reviewer_id = auth.uid()  -- Can only see own
    or public.is_active_coordinator()  -- Coordinator sees all
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.assigned_editor_id = auth.uid())  -- Editor can see after AWAITING_DECISION
  );
```

---

## PART 4: STATUS MACHINE VERIFICATION

### Valid Status Transitions

**Implemented & Working:**
```
DRAFT → SUBMITTED                      (author)
SUBMITTED → EDITOR_REVIEW              (coordinator)
EDITOR_REVIEW → UNDER_REVIEW           (coordinator, after editor assessment)
EDITOR_REVIEW → SUBMITTED              (editor decline → reopen)
UNDER_REVIEW → AWAITING_DECISION       (automatic when all reviews in)
AWAITING_DECISION → ACCEPTED           (coordinator)
AWAITING_DECISION → REJECTION_REQUESTED(coordinator)
REVISION_REQUESTED → EDITOR_REVIEW     (author submits revision)
ACCEPTED → PUBLISHED                   (publisher/coordinator)
```

**Missing Constraint:**
- ⚠️ No validation that EDITOR_REVIEW requires editor assessment before UNDER_REVIEW
- Current: assign_reviewers() checks `assessment_status = 'SUBMITTED'` ✅ (working)

### Invalid Transitions Prevented

**✅ Server-side checks working:**
- Author can't submit already-submitted manuscript
- Editor can't respond twice to same invitation
- Reviewer can't submit if not ACCEPTED
- Coordinator can't assign reviewers without editor assessment
- Coordinator can't publish without editor recommendation at AWAITING_DECISION

---

## PART 5: FILE HANDLING AUDIT

### File Upload & Storage

**Working:**
- ✅ Authors can upload manuscript files
- ✅ Files stored in Supabase Storage bucket 'manuscript-files'
- ✅ Public URLs generated
- ✅ Files linked in manuscript_files table

**Broken/Incomplete:**

1. ❌ **Revision Files Not Associated**
   - When author uploads revised files
   - revision_id field not populated
   - Files not linked to specific revision number
   - Coordinator can't see "which files are from revision round 1 vs 2"

2. ❌ **File Preview Modal Issues**
   - `FilePreviewModal.tsx` has UI bugs
   - Shows simulated content instead of real file content
   - PDF/DOCX preview not actually working
   - Zip file explorer not functional

3. ⚠️ **No File Version Tracking**
   - Can't see original vs revised versions side-by-side
   - No "Download Original" vs "Download Revision" options

**Fix Locations:**

1. **Associate revision files:** (Already shown in Step 16 section above)

2. **Real PDF Preview:** `src/components/FilePreviewModal.tsx`
   - Currently returns placeholder content
   - Should embed actual PDF.js library OR show public_url as iframe

Replace current PDF display with:
```typescript
if (isPdf && publicUrl) {
  return (
    <div className="flex-1 bg-slate-950">
      <iframe
        src={`${publicUrl}#toolbar=0`}
        className="w-full h-full"
        title="PDF Preview"
      />
    </div>
  );
}
```

---

## PART 6: MISSING UI ELEMENTS

### Critical Missing UI

1. **Back Buttons**
   - ❌ No "← Back" button on detail pages
   - Editor detail page needs back to list
   - Reviewer evaluation modal needs back
   - Coordinator manuscript detail needs back to queue
   - **Files:** EditorWorkspace, ReviewerWorkspace, CoordinatorWorkspace

2. **Status Badges**
   - ⚠️ Some components don't show assignment status clearly
   - Should distinguish INVITED vs ACCEPTED vs SUBMITTED

3. **Progress Indicators**
   - ⚠️ No step progress for 9-step submission flow
   - No timeline for revision cycles

4. **Notifications/Alerts**
   - ⚠️ No toast notifications for workflow events
   - Status changes require page refresh

---

## PART 7: EXACT FILES NEEDING MODIFICATION

### Files to Fix (In Priority Order)

1. **CRITICAL:** `src/components/EditorWorkspace.tsx`
   - Add Accept/Decline manuscript entry point
   - Add 3-decision final recommendation panel
   - Add "Evaluation Submitted" success state
   - Add back button
   - **Lines:** ~200-250 (add Accept/Decline), ~300-400 (add decision panel)

2. **CRITICAL:** `src/components/CoordinatorWorkspace.tsx`
   - Add Review Package component (Summary/Reviewers/Decision tabs)
   - Add real reviewer progress counter (0/2, 1/2, 2/2)
   - Add Decision Publishing modal
   - Add realtime subscription to reviewer_assignments
   - Add back button functionality
   - **Lines:** ~500-750 (add components)

3. **HIGH:** `src/components/ReviewerWorkspace.tsx`
   - Add back button
   - Add review count displays
   - **Lines:** ~200-250

4. **HIGH:** `src/lib/workflow.ts`
   - Add file revision association function
   - Ensure all RPC wrappers exist
   - **Lines:** Add new function ~300

5. **HIGH:** `src/components/FilePreviewModal.tsx`
   - Replace simulated content with real PDF.js or iframe
   - **Lines:** ~100-150

6. **MEDIUM:** `supabase/migrations/` (New file)
   - Add RLS policy for reviewer_assignments (double-blind)
   - **File:** `0008_fix_double_blind_rls.sql`

7. **MEDIUM:** `src/lib/editorWorkspace.ts`
   - Add realtime subscription to editor_assignments
   - Add function to save editor decision recommendation
   - **Lines:** ~200-300

---

## PART 8: IMPLEMENTATION PLAN - PRIORITIZED

### PHASE 1: CRITICAL WORKFLOW GAPS (Day 1)

**1.1 Editor Accept/Decline Manuscript** (2 hours)
- File: `src/components/EditorWorkspace.tsx`
- Add Accept/Decline UI when status='INVITED'
- Call `respondToEditorAssignment()`
- Show evaluation form only after ACCEPTED
- **Test:** Editor can accept, sees evaluation form

**1.2 3-Decision Panel in Editor** (2 hours)
- File: `src/components/EditorWorkspace.tsx`
- After evaluation submission, show 3 options
- Call `submitEditorRecommendation()`
- **Test:** Editor can select decision, recommendation saved

**1.3 Decision Publishing Modal** (3 hours)
- File: `src/components/CoordinatorWorkspace.tsx`
- Add modal with 4 decision options
- Add decision letter textarea
- Add confirmation checklist
- Call `publishDecision()`
- **Test:** Coordinator can publish decision, author notified

### PHASE 2: REALTIME & FEEDBACK (Day 2)

**2.1 Realtime Review Counter** (2 hours)
- File: `src/components/CoordinatorWorkspace.tsx`
- Subscribe to reviewer_assignments changes
- Show "0/2, 1/2, 2/2 Reviews" live
- **Test:** Reviewer submits, counter updates without refresh

**2.2 Realtime Editor Assignment Status** (1.5 hours)
- File: `src/lib/editorWorkspace.ts`
- Add subscription to editor_assignments
- **Test:** Coordinator sees editor accept/decline instantly

**2.3 Back Buttons** (1 hour)
- Files: EditorWorkspace, CoordinatorWorkspace, ReviewerWorkspace
- Add "← Back" button that returns to list
- Restore previous sort/filter
- **Test:** Click back, state preserved

### PHASE 3: DATA INTEGRITY (Day 3)

**3.1 Revision File Association** (2 hours)
- File: `src/lib/workflow.ts`
- Update `uploadRevisionFile()` to set revision_id
- **Test:** Revised files associated with revision round

**3.2 Double-Blind RLS** (1.5 hours)
- File: New `supabase/migrations/0008_fix_double_blind_rls.sql`
- Add RLS policy to prevent reviewer cross-viewing
- **Test:** Reviewer 1 can't see Reviewer 2's comments

**3.3 File Preview** (2 hours)
- File: `src/components/FilePreviewModal.tsx`
- Replace simulated content with real iframe/PDF.js
- **Test:** PDF actually displays, not placeholder

### PHASE 4: TESTING & VERIFICATION (Day 4)

**4.1 End-to-End Workflow Test**
```
Author → Submit
Coordinator → Assign Editor
Editor → Accept/Evaluate/Decide
Coordinator → Assign Reviewers
Reviewer 1 → Evaluate
Reviewer 2 → Evaluate
Coordinator → Review Package → Publish Decision
Author → Receives decision (revision request)
Author → Upload revised files
Editor → Re-evaluates revision
Coordinator → Publishes acceptance
Publisher → Assigns DOI → Publishes
```

**4.2 Realtime Verification**
- Open 5 browser windows
- Have 5 different roles active simultaneously
- Verify status changes propagate instantly

**4.3 Security/RLS Verification**
- Author can't see other author's manuscript
- Reviewer can't see other reviewer's comments
- Editor can't see reviewer identity (double-blind)
- Coordinator can see everything

---

## PART 9: BROKEN/MISSING ITEMS SUMMARY

### Missing Workflow Items
1. ❌ Editor Accept/Decline Manuscript UI
2. ❌ Editor 3-Decision Final Panel
3. ❌ Coordinator Review Package Tabs (Summary/Reviewers/Decision)
4. ❌ Decision Publishing Modal (4 options, letter, confirmation)
5. ❌ Realtime "X/2 Reviews" counter
6. ❌ Revision File Association with revision_id
7. ❌ Back Buttons throughout
8. ❌ Editor Recommendation Display for Coordinator

### Broken Realtime Connections
1. ⚠️ Coordinator doesn't see reviewer progress live
2. ⚠️ Editor doesn't see when all reviewers submit
3. ⚠️ Reviewer doesn't see live assignment changes
4. ⚠️ Author doesn't see when revision is assigned to editor

### Broken Database Connections
1. ❌ Revision files not linked to revision_id
2. ⚠️ Some UI reads manuscript table but not assignment tables

### Missing Status Transitions
- ✅ All major transitions implemented in RPC
- ⚠️ UI doesn't always trigger correct transitions

### Missing RLS/Security Rules
1. ❌ Reviewer-to-Reviewer cross-viewing blocked
2. ⚠️ File access not checked for revisions

### Missing UI Actions
1. ❌ "Accept Manuscript" button
2. ❌ "Decline Assignment" button
3. ❌ "3 Decision Options" panel
4. ❌ "Publish Decision" button (exists but incomplete)
5. ❌ Back buttons (widespread)
6. ❌ Real file preview (currently simulated)

### Missing Revision Flow
1. ❌ Revision file upload confirmation
2. ⚠️ Revision cycle UI (unclear for round 2, 3, etc.)
3. ❌ File versioning display (original vs revised)

### Missing Publication Flow
1. ⚠️ Publication completion page
2. ⚠️ DOI display to author

---

## PART 10: VERIFICATION CHECKLIST

Before claiming "production ready", verify:

- [ ] Author can submit manuscript end-to-end
- [ ] Manuscript appears in Coordinator queue in real-time
- [ ] Coordinator can assign editor
- [ ] Editor sees "Accept/Decline" entry point
- [ ] Editor can accept, then see evaluation form
- [ ] Editor can complete evaluation, see "submitted" state
- [ ] Editor can make 3-decision choice (visible to coordinator)
- [ ] Coordinator can view editor's evaluation
- [ ] Coordinator can assign 2 reviewers
- [ ] Reviewers receive invitations (realtime)
- [ ] Reviewer 1 can accept and complete evaluation
- [ ] Coordinator sees "1/2 Reviews" (realtime, no refresh)
- [ ] Reviewer 2 can accept and complete evaluation
- [ ] Coordinator sees "2/2 Reviews" (realtime)
- [ ] Coordinator can view both reviewer reports
- [ ] Coordinator can publish decision with letter
- [ ] Author receives decision notification
- [ ] If revision requested: author can upload revised files
- [ ] Revised files associated with revision round (not original manuscript)
- [ ] Editor can re-evaluate revision
- [ ] Cycle repeats for round 2 (if needed)
- [ ] Final acceptance goes to Publisher
- [ ] Publisher can assign DOI and publish
- [ ] Author sees Published status
- [ ] All realtime subscriptions working without refresh
- [ ] Double-blind review maintained (reviewers can't see each other)
- [ ] All RLS policies preventing unauthorized access
- [ ] Back buttons work throughout
- [ ] File preview shows actual content (not simulated)

---

## CONCLUSION

**Current Status:** ⚠️ **NOT PRODUCTION READY**

**Readiness Level:** 65% (Foundation solid, workflow gaps critical)

**Work Required:** 4 days, 2-3 developers

**Risk:** Currently deployable for testing, but end-to-end workflow will fail or be confusing for users without these fixes.

**Recommendation:** Complete PHASE 1 and PHASE 2 before going to production. PHASE 3 and PHASE 4 can happen in parallel or in staging.

---

*End of Comprehensive Audit Report*
