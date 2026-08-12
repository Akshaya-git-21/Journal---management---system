# P1 Testing Plan - Editor Accept/Decline & Evaluation
**Priority:** CRITICAL - Must verify both P1.1 and P1.2 work with real Supabase data  
**Status:** TEST PLAN DRAFTED - Ready for Execution

---

## TEST SCOPE

### P1.1: Editor Accept/Decline Manuscript Assignment
- [ ] Accept flow: INVITED → ACCEPTED (status change)
- [ ] Accept enables evaluation form
- [ ] Decline flow: INVITED → SUBMITTED (manuscript returns to queue)
- [ ] Coordinator receives notification on accept/decline
- [ ] Database shows correct assignment status
- [ ] Realtime update when editor accepts/declines

### P1.2: Editor Evaluation & 3-Decision Panel
- [ ] Evaluation form displays after acceptance
- [ ] Scores (1-10) save to database
- [ ] Comments save to database
- [ ] Submit button triggers RPC correctly
- [ ] Evaluation becomes read-only after submission
- [ ] 3-decision buttons appear below evaluation
- [ ] Decision selection calls submitRecommendation() RPC
- [ ] Recommendation stored in editor_assignments.recommendation
- [ ] recommendation_submitted_at timestamp set
- [ ] Coordinator receives notification
- [ ] Realtime update when recommendation submitted

---

## DATABASE VERIFICATION TARGETS

### Tables to Inspect
```
editor_assignments:
  ✓ id (UUID)
  ✓ manuscript_id (TEXT)  
  ✓ editor_id (UUID)
  ✓ status (INVITED | ACCEPTED | DECLINED)
  ✓ assessment_status (NOT_STARTED | SUBMITTED)
  ✓ scientific_merit ... writing_quality (INT 1-10)
  ✓ recommendation (ACCEPT | MINOR_REVISION | MAJOR_REVISION | REJECT | null)
  ✓ recommendation_submitted_at (TIMESTAMPTZ | null)
  ✓ assessment_submitted_at (TIMESTAMPTZ | null)

manuscripts:
  ✓ id (TEXT)
  ✓ status (EDITOR_REVIEW | others)
  ✓ author_id (UUID)
  ✓ assigned_editor_id (UUID)

workflow_notifications:
  ✓ recipient_id (UUID)
  ✓ type (EDITOR_ASSIGNED | EDITOR_ACCEPTED | EDITOR_ASSESSMENT_SUBMITTED)
  ✓ manuscript_id (TEXT)
```

### RPC Functions to Test
```
respond_to_editor_assignment(assignment_id UUID, accept BOOLEAN)
  → Updates editor_assignments.status
  → Notifies coordinator
  → If declined: resets manuscript to SUBMITTED

submit_editor_recommendation(manuscript_id TEXT, recommendation TEXT)
  → Sets editor_assignments.recommendation
  → Sets editor_assignments.recommendation_submitted_at
  → Notifies coordinator
```

---

## TEST EXECUTION PLAN

### Phase 1: Setup (Direct Database)
1. Create test author account (via Supabase Auth)
2. Create test manuscript (INSERT into manuscripts table)
3. Create test editor account (via Supabase Auth)
4. Assign editor (call assign_editor RPC)
5. Verify editor_assignments status = 'INVITED'

### Phase 2: Test P1.1 - Accept/Decline
**Test 2a: Accept Flow**
```
GIVEN: editor_assignments.status = 'INVITED'
WHEN:  call respond_to_editor_assignment(assignment_id, true)
THEN:  
  editor_assignments.status = 'ACCEPTED'
  editor_assignments.responded_at = NOW()
  workflow_notifications created with type='EDITOR_ACCEPTED' for coordinator
  manuscripts status = 'EDITOR_REVIEW' (unchanged)
```

**Test 2b: Decline Flow**
```
GIVEN: editor_assignments.status = 'INVITED'  
WHEN:  call respond_to_editor_assignment(assignment_id, false)
THEN:
  editor_assignments.status = 'DECLINED'
  editor_assignments.responded_at = NOW()
  manuscripts status = 'SUBMITTED' (reverts)
  manuscripts.assigned_editor_id = NULL (cleared)
  workflow_notifications created with type='EDITOR_DECLINED' for coordinator
```

### Phase 3: Test P1.2 - Evaluation & Recommendation
**Test 3a: Submit Evaluation**
```
GIVEN: editor_assignments.status = 'ACCEPTED'
       editor_assignments.assessment_status = 'NOT_STARTED'
WHEN:  call submit_editor_assessment(assignment_id, scores..., comments...)
THEN:
  editor_assignments.assessment_status = 'SUBMITTED'
  editor_assignments.assessment_submitted_at = NOW()
  editor_assignments.scientific_merit = [value]
  editor_assignments.novelty_innovation = [value]
  ... (all 7 scores)
  editor_assignments.strengths = [value]
  editor_assignments.weaknesses = [value]
  editor_assignments.mandatory_revisions = [value]
  workflow_notifications created with type='EDITOR_ASSESSMENT_SUBMITTED'
```

**Test 3b: Submit Recommendation**
```
GIVEN: editor_assignments.status = 'ACCEPTED'
       editor_assignments.assessment_status = 'SUBMITTED'
       manuscripts.status = 'EDITOR_REVIEW'
WHEN:  call submit_editor_recommendation(manuscript_id, 'ACCEPT')
THEN:
  editor_assignments.recommendation = 'ACCEPT'
  editor_assignments.recommendation_submitted_at = NOW()
  workflow_notifications created with type='EDITOR_RECOMMENDATION_READY'
  manuscripts.status = 'EDITOR_REVIEW' (unchanged - coordinator decides next)
```

### Phase 4: Realtime Subscription Tests
**Test 4a: Coordinator sees editor accept in realtime**
```
GIVEN: Coordinator subscribed to editor_assignments
WHEN:  Editor calls respond_to_editor_assignment(accept=true)
THEN:  Coordinator's subscription receives UPDATE event
       UI updates to show status='ACCEPTED' without refresh
```

**Test 4b: Coordinator sees recommendation in realtime**
```
GIVEN: Coordinator subscribed to editor_assignments
WHEN:  Editor calls submit_editor_recommendation()
THEN:  Coordinator's subscription receives UPDATE event
       UI shows recommendation without refresh
```

### Phase 5: RLS & Permissions Tests
**Test 5a: Editor can only see own assignments**
```
SELECT * FROM editor_assignments 
WHERE editor_id = [current_user]
  should return only rows where editor_id matches
```

**Test 5b: Coordinator can see all assignments**
```
SELECT * FROM editor_assignments 
  should return all rows (no filtering)
```

**Test 5c: Author cannot see editor_assignments**
```
SELECT * FROM editor_assignments 
  should return 0 rows (RLS denies access)
```

---

## VERIFICATION COMMANDS

### Direct SQL Queries (via Supabase Dashboard SQL Editor)

```sql
-- Check if editor assignment exists and has correct status
SELECT id, manuscript_id, editor_id, status, assessment_status, 
       recommendation, recommendation_submitted_at
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-id'
ORDER BY assigned_at DESC
LIMIT 1;

-- Check if editor accepted and assessment was submitted
SELECT count(*) FROM public.editor_assignments
WHERE status = 'ACCEPTED' AND assessment_status = 'SUBMITTED';

-- Check if recommendation was saved
SELECT recommendation, recommendation_submitted_at
FROM public.editor_assignments
WHERE editor_id = [editor_id] AND recommendation IS NOT NULL
LIMIT 1;

-- Check if notifications were sent
SELECT type, recipient_id, manuscript_id, created_at
FROM public.workflow_notifications
WHERE type IN ('EDITOR_ACCEPTED', 'EDITOR_ASSESSMENT_SUBMITTED', 'EDITOR_RECOMMENDATION_READY')
ORDER BY created_at DESC
LIMIT 5;

-- Verify manuscript status transitions
SELECT from_status, to_status, actor_id, created_at
FROM public.manuscript_status_history
WHERE manuscript_id = 'test-manuscript-id'
ORDER BY created_at;
```

---

## RPC CALL VERIFICATION

### Test via JavaScript Console or Supabase JS Client

```javascript
// Test respond_to_editor_assignment
const { data, error } = await supabase.rpc('respond_to_editor_assignment', {
  p_assignment_id: 'assignment-uuid',
  p_accept: true
});
console.log('Accept response:', data, error);

// Test submit_editor_assessment
const { data, error } = await supabase.rpc('submit_editor_assessment', {
  p_assignment_id: 'assignment-uuid',
  p_scientific_merit: 8,
  p_novelty_innovation: 7,
  p_methodology_quality: 8,
  p_literature_adequacy: 7,
  p_ethical_compliance: 9,
  p_data_reliability: 8,
  p_writing_quality: 7,
  p_strengths: 'Well-written paper',
  p_weaknesses: 'Limited scope',
  p_mandatory_revisions: 'Add more discussion',
  p_comments_to_coordinator: 'Ready for peer review'
});
console.log('Assessment response:', data, error);

// Test submit_editor_recommendation
const { data, error } = await supabase.rpc('submit_editor_recommendation', {
  p_manuscript_id: 'manuscript-id',
  p_recommendation: 'ACCEPT'
});
console.log('Recommendation response:', data, error);
```

---

## INTEGRATION TEST FLOW

### Complete E2E Flow (Manual Testing in Browser)

```
1. Author Login
   ↓
2. Create Manuscript (Submit for Review)
   ↓
3. Coordinator Login
   ↓
4. Verify Manuscript in Queue (SUBMITTED status)
   ↓
5. Assign Editor
   ✓ Verify: manuscripts.assigned_editor_id set
   ✓ Verify: editor_assignments created with status='INVITED'
   ✓ Verify: Notification created for editor
   ↓
6. Editor Login
   ↓
7. See Assignment in "ACTION REQUIRED"
   ✓ Verify: Assignment displays with status='INVITED'
   ↓
8. Click on Manuscript
   ✓ Verify: Accept/Decline Modal appears (P1.1)
   ↓
9. Click Accept
   ✓ Verify: Modal closes
   ✓ Verify: Evaluation form appears
   ✓ Database: editor_assignments.status = 'ACCEPTED'
   ✓ Database: Notification created for coordinator
   ↓
10. Fill Evaluation Form
    - Set scores (1-10 for each of 7 criteria)
    - Add comments to coordinator
    - Add strengths
    - Add weaknesses
    ↓
11. Submit Evaluation
    ✓ Verify: Form becomes read-only
    ✓ Verify: "✓ Evaluation Submitted" message appears
    ✓ Verify: 3-decision buttons appear below (P1.2)
    ✓ Database: assessment_status = 'SUBMITTED'
    ✓ Database: assessment_submitted_at = NOW()
    ✓ Database: All scores saved correctly
    ↓
12. Select 3-Decision (e.g., "Accept Manuscript")
    ✓ Verify: Button click triggers RPC
    ✓ Database: recommendation = 'ACCEPT'
    ✓ Database: recommendation_submitted_at = NOW()
    ✓ Database: Notification for coordinator
    ↓
13. Coordinator Dashboard (without refresh)
    ✓ Verify: Realtime update shows editor recommendation
    ✓ Verify: "2/2 Reviews" counter updates if applicable
    ↓
14. Decline Test (Separate Flow)
    - Assign same editor to different manuscript
    - Click Decline in Accept/Decline modal
    ✓ Verify: Manuscript returns to SUBMITTED
    ✓ Verify: assigned_editor_id cleared
    ✓ Verify: Notification for coordinator
```

---

## SUCCESS CRITERIA

### P1.1 PASS Conditions:
- ✅ Accept flow correctly updates all database fields
- ✅ Decline flow correctly reverts manuscript status
- ✅ Both flows send correct notifications
- ✅ Coordinator sees updates in realtime (no refresh needed)
- ✅ RLS prevents unauthorized access
- ✅ No mock data - all real Supabase operations

### P1.2 PASS Conditions:
- ✅ Evaluation form displays after acceptance
- ✅ All score fields save to database
- ✅ Comments and text fields save correctly
- ✅ Read-only state shows after submission
- ✅ 3-decision buttons appear and are functional
- ✅ Each decision button calls correct RPC
- ✅ Recommendation persists after page refresh
- ✅ Coordinator notified in realtime
- ✅ No mock data - all real Supabase operations

---

## BLOCKERS & ISSUES FOUND

### Issue #1: Coordinator Accounts Need Approval
**Status:** UNRESOLVED  
**Impact:** Cannot test full workflow without a Coordinator account  
**Workaround Options:**
1. Manually approve Coordinator account in Supabase dashboard
2. Create test Coordinator via direct SQL INSERT
3. Use existing test Coordinator account if available

### Issue #2: Manual UI Testing is Time-Consuming
**Status:** MITIGATED  
**Approach:** Use direct database queries and RPC calls via Supabase Dashboard to verify data integrity, then spot-check UI behavior

### Issue #3: Realtime Subscriptions Require Live Browser Connection
**Status:** ACKNOWLEDGED  
**Testing Plan:** 
- Open two browser windows (Editor + Coordinator)
- Perform action in Editor
- Verify Coordinator sees update without refresh

---

## NEXT STEPS

1. **Resolve Coordinator Account Access**
   - Option A: Approve via Supabase Dashboard Profiles table
   - Option B: Direct SQL to set status='ACTIVE'

2. **Execute Direct Database Tests**
   - Run SQL queries in Supabase Dashboard
   - Verify all database state changes occur correctly

3. **Execute UI Tests**
   - Walk through complete flow in browser
   - Verify Accept/Decline modal appears correctly
   - Verify Evaluation form displays and submits

4. **Verify Realtime Updates**
   - Open Coordinator dashboard in separate window
   - Perform editor action
   - Confirm update appears without refresh

5. **Document Results**
   - Create test report with results for each test case
   - Screenshot evidence of working features
   - Database query results showing correct data

---

## TEST REPORT TEMPLATE

```
# P1.1 & P1.2 Test Execution Report
**Date:** [Date]
**Tester:** [Name]
**Environment:** Supabase (Production/Staging)

## P1.1: Editor Accept/Decline
- [ ] Test 1a: Accept Flow ✓ PASS / ✗ FAIL
  Details: [results]
- [ ] Test 1b: Decline Flow ✓ PASS / ✗ FAIL
  Details: [results]

## P1.2: Evaluation & Recommendation
- [ ] Test 2a: Evaluation Submission ✓ PASS / ✗ FAIL
  Details: [results]
- [ ] Test 2b: Recommendation Submission ✓ PASS / ✗ FAIL
  Details: [results]

## Realtime Tests
- [ ] Test 3a: Realtime Editor Accept ✓ PASS / ✗ FAIL
- [ ] Test 3b: Realtime Recommendation ✓ PASS / ✗ FAIL

## RLS & Permissions
- [ ] Test 4a: Editor sees only own assignments ✓ PASS / ✗ FAIL
- [ ] Test 4b: Coordinator sees all assignments ✓ PASS / ✗ FAIL
- [ ] Test 4c: Author cannot see assignments ✓ PASS / ✗ FAIL

## Issues Found
1. [Issue] - Severity: [HIGH/MEDIUM/LOW] - Status: [OPEN/FIXED]
2. [Issue] - Severity: [HIGH/MEDIUM/LOW] - Status: [OPEN/FIXED]

## Summary
✓ ALL TESTS PASSED - Ready for P1.3
✗ ISSUES FOUND - P1.3 blocked on: [list issues]
```

---

*End of Test Plan*
