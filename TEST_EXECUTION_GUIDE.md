# P1.1 & P1.2 Test Execution Guide
**Date:** 2026-08-12  
**Status:** Ready for Execution  
**Approach:** Direct Database Testing + UI Spot Checks

---

## PHASE 1: SETUP - Create Test Data & Accounts

### Step 1.1: Create Test Author Account (Auto-activated)

**Via Auth UI (Recommended):**
1. Navigate to: http://localhost:3000
2. Click "Author Login"
3. Click "Create new account"
4. Fill form:
   - First Name: `TestAuthor`
   - Last Name: `One`
   - Email: `author1@test.com`
   - Password: `TestPassword123!`
5. Click Sign Up
6. Wait for "Account created successfully" message

**Expected Result:** Account created in auth.users, auto-activated, can login immediately

---

### Step 1.2: Create Test Editor Account

**Via Auth UI:**
1. Logout from Author (if logged in)
2. Navigate to: http://localhost:3000
3. Click "Coordinator Login" (or any login button)
4. Click "Create new account"
5. Select Role: "Editor"
6. Fill form:
   - First Name: `TestEditor`
   - Last Name: `One`
   - Institution: `Test University`
   - Email: `editor1@test.com`
   - Password: `TestPassword123!`
7. Click Sign Up
8. Wait for success message

**Expected Result:** Editor account created and auto-activated

---

### Step 1.3: Get Account IDs from Database

**Via Supabase Dashboard SQL Editor:**

```sql
-- Get Author UUID
SELECT id, email, created_at FROM auth.users WHERE email = 'author1@test.com';
-- Save the UUID as: AUTHOR_ID = [result]

-- Get Editor UUID
SELECT id, email, created_at FROM auth.users WHERE email = 'editor1@test.com';
-- Save the UUID as: EDITOR_ID = [result]
```

---

### Step 1.4: Create Test Manuscript (Direct SQL)

**Via Supabase Dashboard SQL Editor:**

Replace `{AUTHOR_ID}` with the actual UUID from Step 1.3:

```sql
INSERT INTO public.manuscripts (
  id, title, abstract, keywords, author_id, status, submitted_at
) VALUES (
  'test-manuscript-001',
  'Test Manuscript for P1 Workflow',
  'This is a test manuscript to verify the P1.1 and P1.2 workflow.',
  'test,workflow,editorial',
  '{AUTHOR_ID}',
  'SUBMITTED',
  NOW()
);

-- Verify insert
SELECT id, title, status, author_id, created_at FROM public.manuscripts 
WHERE id = 'test-manuscript-001';
```

**Expected Result:** Manuscript inserted with status='SUBMITTED', author_id set correctly

---

### Step 1.5: Assign Editor (Call RPC)

**Via Supabase Dashboard SQL Editor:**

Replace `{EDITOR_ID}` with the actual UUID:

```sql
-- Call the assign_editor RPC
SELECT public.assign_editor('test-manuscript-001', '{EDITOR_ID}');

-- Verify the assignment was created
SELECT id, manuscript_id, editor_id, status, assessment_status 
FROM public.editor_assignments 
WHERE manuscript_id = 'test-manuscript-001'
ORDER BY assigned_at DESC 
LIMIT 1;
```

**Expected Result:** 
- editor_assignments row created with:
  - status = 'INVITED'
  - assessment_status = 'NOT_STARTED'
  - editor_id = {EDITOR_ID}

---

## PHASE 2: TEST P1.1 - EDITOR ACCEPT/DECLINE

### Step 2.1: Verify Assignment Shows in Editor Workspace

**Via Browser:**
1. Login as Editor (editor1@test.com / TestPassword123!)
2. Navigate to Editor workspace
3. Look for "ACTION REQUIRED" section or similar
4. Verify you see the test manuscript in the list

**Database Verification:**
```sql
-- Check that editor can see the assignment
SELECT id, manuscript_id, editor_id, status, assessment_status
FROM public.editor_assignments
WHERE editor_id = '{EDITOR_ID}' AND manuscript_id = 'test-manuscript-001';
```

**Expected Result:** Manuscript appears in action required list with status='INVITED'

---

### Step 2.2: Test ACCEPT Flow

**Via Browser (UI Test):**
1. In Editor workspace, click on the test manuscript
2. **Verify:** Accept/Decline modal appears (P1.1 implementation)
3. Click "✓ Accept Assignment" button
4. **Verify:** Modal closes, list refreshes
5. **Verify:** Manuscript now shows in "ACCEPTED" section (or evaluation form displays)

**Database Verification (Post-Accept):**
```sql
-- Check assignment status changed to ACCEPTED
SELECT id, manuscript_id, editor_id, status, assessment_status, responded_at
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-001'
LIMIT 1;

-- Check notification was created for coordinator
SELECT id, type, recipient_id, manuscript_id, created_at
FROM public.workflow_notifications
WHERE type = 'EDITOR_ACCEPTED' AND manuscript_id = 'test-manuscript-001'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results:**
- ✅ Modal appears when assignment.status = 'INVITED'
- ✅ editor_assignments.status changes from 'INVITED' to 'ACCEPTED'
- ✅ editor_assignments.responded_at timestamp is set
- ✅ Notification created with type='EDITOR_ACCEPTED'
- ✅ Evaluation form becomes available

**PASS/FAIL:** ✓ P1.1 ACCEPT FLOW

---

### Step 2.3: Test DECLINE Flow (Separate Manuscript)

**Database Setup - Create Second Test Manuscript:**
```sql
INSERT INTO public.manuscripts (
  id, title, abstract, keywords, author_id, status, submitted_at
) VALUES (
  'test-manuscript-002',
  'Test Manuscript 2 for Decline Test',
  'This manuscript will be declined by the editor.',
  'test,decline,workflow',
  '{AUTHOR_ID}',
  'SUBMITTED',
  NOW()
);

-- Assign same editor to this manuscript
SELECT public.assign_editor('test-manuscript-002', '{EDITOR_ID}');

-- Verify assignment created
SELECT id, manuscript_id, editor_id, status 
FROM public.editor_assignments 
WHERE manuscript_id = 'test-manuscript-002'
LIMIT 1;
-- Save assignment ID as: ASSIGNMENT_ID_2
```

**Via Browser (UI Test):**
1. Refresh Editor workspace (or see test-manuscript-002)
2. Click on test-manuscript-002
3. **Verify:** Accept/Decline modal appears
4. Click "✕ Decline Assignment" button
5. **Verify:** Modal closes, returns to list
6. **Verify:** test-manuscript-002 is no longer in editor's list

**Database Verification (Post-Decline):**
```sql
-- Check assignment status changed to DECLINED
SELECT id, manuscript_id, editor_id, status, assessment_status, responded_at
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-002'
LIMIT 1;

-- Check manuscript status reverted to SUBMITTED
SELECT id, status, assigned_editor_id FROM public.manuscripts
WHERE id = 'test-manuscript-002';

-- Check notification was created for coordinator
SELECT id, type, recipient_id, manuscript_id, created_at
FROM public.workflow_notifications
WHERE type IN ('EDITOR_DECLINED', 'ASSIGNMENT_DECLINED') 
  AND manuscript_id = 'test-manuscript-002'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results:**
- ✅ Decline button works and is clickable
- ✅ editor_assignments.status changes from 'INVITED' to 'DECLINED'
- ✅ manuscripts.status reverts to 'SUBMITTED'
- ✅ manuscripts.assigned_editor_id becomes NULL
- ✅ Notification created for coordinator
- ✅ Assignment disappears from editor's list

**PASS/FAIL:** ✓ P1.1 DECLINE FLOW

---

## PHASE 3: TEST P1.2 - EDITOR EVALUATION & 3-DECISION PANEL

### Step 3.1: Verify Evaluation Form Appears After Accept

**Via Browser:**
1. Login as Editor
2. Click on test-manuscript-001 (should be ACCEPTED now)
3. **Verify:** Accept/Decline modal does NOT appear
4. **Verify:** Evaluation form displays with fields:
   - Scientific Merit (1-10 slider/input)
   - Novelty & Innovation (1-10)
   - Methodology Quality (1-10)
   - Literature Adequacy (1-10)
   - Ethical Compliance (1-10)
   - Data Reliability (1-10)
   - Writing Quality (1-10)
   - Strengths (text field)
   - Weaknesses (text field)
   - Mandatory Revisions (text field)
   - Comments to Coordinator (text field)
   - Submit button

**Database Verification:**
```sql
-- Verify assignment is ACCEPTED and ready for evaluation
SELECT id, manuscript_id, status, assessment_status 
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-001'
LIMIT 1;
```

**Expected Result:** 
- ✅ Modal does not appear for ACCEPTED assignments
- ✅ Evaluation form is visible and interactive
- ✅ All 7 score fields are present
- ✅ Comment fields are present

**PASS/FAIL:** ✓ P1.2 FORM DISPLAY

---

### Step 3.2: Submit Evaluation (Scores & Comments)

**Via Browser:**
1. Fill in evaluation form with test data:
   - Scientific Merit: `8`
   - Novelty & Innovation: `7`
   - Methodology Quality: `8`
   - Literature Adequacy: `7`
   - Ethical Compliance: `9`
   - Data Reliability: `8`
   - Writing Quality: `7`
   - Strengths: `Well-written, clear methodology, comprehensive literature review`
   - Weaknesses: `Limited scope, small sample size`
   - Mandatory Revisions: `Expand discussion section, add limitations paragraph`
   - Comments to Coordinator: `Ready for peer review with minor revisions requested`
2. Click "Submit Evaluation" button
3. **Verify:** Form becomes read-only
4. **Verify:** Message appears: "✓ Evaluation Submitted - Read-Only Mode"
5. **Verify:** 3-decision buttons appear below evaluation

**Database Verification (Post-Submit):**
```sql
-- Verify assessment was saved
SELECT id, manuscript_id, editor_id, 
       scientific_merit, novelty_innovation, methodology_quality, 
       literature_adequacy, ethical_compliance, data_reliability, writing_quality,
       strengths, weaknesses, mandatory_revisions,
       assessment_status, assessment_submitted_at
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-001'
LIMIT 1;

-- Verify notification was sent
SELECT id, type, recipient_id, manuscript_id, created_at
FROM public.workflow_notifications
WHERE type = 'EDITOR_ASSESSMENT_SUBMITTED' AND manuscript_id = 'test-manuscript-001'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results:**
- ✅ Form becomes read-only after submission
- ✅ "✓ Evaluation Submitted" message displays
- ✅ assessment_status changes to 'SUBMITTED'
- ✅ assessment_submitted_at timestamp is set
- ✅ All 7 score fields saved correctly (8, 7, 8, 7, 9, 8, 7)
- ✅ Comment fields saved correctly
- ✅ Notification created with type='EDITOR_ASSESSMENT_SUBMITTED'

**PASS/FAIL:** ✓ P1.2 EVALUATION SUBMISSION

---

### Step 3.3: 3-Decision Panel - Choose & Submit Recommendation

**Via Browser:**
1. **Verify:** Below the read-only evaluation form, you see 4 buttons:
   - ✓ Accept Manuscript (green)
   - ◊ Request Minor Revision (amber)
   - ◆ Request Major Revision (orange)
   - ✕ Reject (red)
2. Click one button, e.g., "✓ Accept Manuscript"
3. **Verify:** Button shows loading state briefly
4. **Verify:** Success notification appears

**Database Verification (Post-Decision):**
```sql
-- Verify recommendation was saved
SELECT id, manuscript_id, editor_id, 
       recommendation, recommendation_submitted_at
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-001'
LIMIT 1;

-- Expected: recommendation = 'ACCEPT', recommendation_submitted_at is set

-- Verify notification was sent to coordinator
SELECT id, type, recipient_id, manuscript_id, created_at
FROM public.workflow_notifications
WHERE type IN ('EDITOR_RECOMMENDATION_READY', 'EDITOR_DECISION_READY') 
  AND manuscript_id = 'test-manuscript-001'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results:**
- ✅ 3-decision buttons visible below evaluation form
- ✅ At least one button clickable and responsive
- ✅ editor_assignments.recommendation set to chosen value
- ✅ editor_assignments.recommendation_submitted_at timestamp set
- ✅ Notification created for coordinator
- ✅ UI shows success message

**Test Each Decision Type:**
- For 'ACCEPT': Verify recommendation = 'ACCEPT'
- For 'MINOR_REVISION': Verify recommendation = 'MINOR_REVISION'
- For 'MAJOR_REVISION': Verify recommendation = 'MAJOR_REVISION'
- For 'REJECT': Verify recommendation = 'REJECT'

**PASS/FAIL:** ✓ P1.2 3-DECISION PANEL

---

### Step 3.4: Verify Read-Only Persistence After Refresh

**Via Browser:**
1. Refresh the page (F5)
2. Login again if needed
3. Navigate to test-manuscript-001
4. **Verify:** Evaluation form still shows read-only state
5. **Verify:** "✓ Evaluation Submitted" message still visible
6. **Verify:** Recommendation persists (shows which decision was selected)
7. **Verify:** Cannot edit any fields

**Database Verification:**
```sql
-- Verify recommendation persists
SELECT id, manuscript_id, recommendation, recommendation_submitted_at
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-001'
LIMIT 1;
-- Should show: recommendation = 'ACCEPT' (or whichever was selected)
```

**Expected Results:**
- ✅ Read-only state persists after page refresh
- ✅ Recommendation value persists
- ✅ Cannot modify evaluation after submission

**PASS/FAIL:** ✓ P1.2 PERSISTENCE

---

## PHASE 4: TEST REALTIME UPDATES (Coordinator Notification)

### Step 4.1: Setup Two Browser Windows

**Window 1 - Editor:**
- Login as: editor1@test.com
- Navigate to: test-manuscript-001
- Keep this window open

**Window 2 - Coordinator:**
- Login as: coordinator (requires approval - see below)
- Navigate to: Coordinator Dashboard
- Keep this window open

**⚠️ ISSUE: Coordinator Account Needs Approval**

If you cannot login as Coordinator, you have two options:

**Option A: Approve via Database (Recommended)**
```sql
-- Find pending coordinator registrations
SELECT id, email, status, role, created_at FROM public.profiles
WHERE role = 'COORDINATOR' AND status = 'PENDING';

-- Approve the coordinator
UPDATE public.profiles SET status = 'ACTIVE' 
WHERE email = 'coordinator@test.com' AND role = 'COORDINATOR';

-- Verify
SELECT id, email, status, role FROM public.profiles
WHERE email = 'coordinator@test.com';
```

**Option B: Create Coordinator via Direct SQL**
```sql
-- Get auth user ID if already registered
SELECT id, email FROM auth.users WHERE email = 'coordinator@test.com';
-- If exists, use that ID; otherwise create new auth account first

-- If using existing: INSERT profile
INSERT INTO public.profiles (id, email, first_name, last_name, role, status)
VALUES ('{COORDINATOR_ID}', 'coordinator@test.com', 'Test', 'Coordinator', 'COORDINATOR', 'ACTIVE');
```

---

### Step 4.2: Test Realtime Update - Editor Accept

**Window 1 (Editor):**
1. Open fresh test-manuscript (with INVITED status)
2. Click "✓ Accept Assignment"
3. Wait for success message

**Window 2 (Coordinator):**
1. Without refreshing the page
2. **Verify:** Notification appears indicating editor accepted
3. **Verify:** If viewing manuscript detail, status updates to show editor accepted
4. **Verify:** "X/Y Reviews" counter might update if applicable

**Database Verification:**
```sql
-- Check realtime subscriptions are working
-- Monitor workflow_notifications table for recent entries
SELECT id, type, recipient_id, manuscript_id, created_at
FROM public.workflow_notifications
WHERE manuscript_id = 'test-manuscript-001' AND type = 'EDITOR_ACCEPTED'
ORDER BY created_at DESC
LIMIT 1;

-- Should see entry created moments after editor clicked Accept
```

**Expected Results:**
- ✅ Coordinator receives notification without page refresh
- ✅ Notification appears in real-time (within 1-2 seconds)
- ✅ Database shows notification was created

**PASS/FAIL:** ✓ REALTIME ACCEPT UPDATE

---

### Step 4.3: Test Realtime Update - Editor Recommendation

**Window 1 (Editor):**
1. Scroll to 3-decision buttons
2. Click one (e.g., "✓ Accept Manuscript")
3. Wait for success message

**Window 2 (Coordinator):**
1. Without refreshing the page
2. **Verify:** If viewing "Review Package" or manuscript detail:
   - Editor recommendation appears
   - Shows the selected decision (Accept/Minor/Major/Reject)
3. **Verify:** "Ready for Decision" status or similar updates

**Database Verification:**
```sql
-- Check recommendation was saved
SELECT recommendation, recommendation_submitted_at
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-001';

-- Check notification for coordinator
SELECT id, type, recipient_id, manuscript_id, created_at
FROM public.workflow_notifications
WHERE type IN ('EDITOR_RECOMMENDATION_READY', 'EDITOR_DECISION_READY')
  AND manuscript_id = 'test-manuscript-001'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results:**
- ✅ Coordinator sees recommendation update in real-time
- ✅ No page refresh needed
- ✅ Recommendation value displays correctly
- ✅ Database shows recommendation saved and notification sent

**PASS/FAIL:** ✓ REALTIME RECOMMENDATION UPDATE

---

## PHASE 5: RLS & PERMISSIONS VERIFICATION

### Step 5.1: Verify Editor Can Only See Own Assignments

**Via Supabase Dashboard SQL Editor (while logged in as editor):**

```sql
-- Query editor_assignments as the logged-in editor
SELECT id, manuscript_id, editor_id, status FROM public.editor_assignments;

-- Should return ONLY assignments where editor_id = current_user_id
-- Should NOT return assignments for other editors

-- Test with test-manuscript-001 (assigned to editor1@test.com)
-- Should appear in results
-- If manuscript was assigned to editor2@test.com, should NOT appear
```

**Expected Result:** 
- ✅ Editor can only see own assignments
- ✅ RLS policy blocks access to other editors' assignments

---

### Step 5.2: Verify Coordinator Can See All Assignments

**Via Supabase Dashboard SQL Editor (while logged in as coordinator):**

```sql
-- Query editor_assignments as the logged-in coordinator
SELECT id, manuscript_id, editor_id, status FROM public.editor_assignments;

-- Should return ALL assignments for the manuscript being viewed
-- Should NOT be restricted by editor_id
```

**Expected Result:**
- ✅ Coordinator can see all editor assignments
- ✅ No RLS restrictions for coordinator role

---

### Step 5.3: Verify Author Cannot See editor_assignments

**Via Supabase Dashboard SQL Editor (while logged in as author):**

```sql
-- Query editor_assignments as the logged-in author
SELECT id, manuscript_id, editor_id, status FROM public.editor_assignments;

-- Should return 0 rows (access denied by RLS)
```

**Expected Result:**
- ✅ Author cannot access editor_assignments table
- ✅ RLS policy denies access completely

---

## PHASE 6: TEST REPORT COMPLETION

### Test Results Summary

Create a test report with the following structure:

```markdown
# P1.1 & P1.2 Test Execution Report
**Date:** 2026-08-12
**Tester:** [Name]
**Environment:** Supabase (Production)

## P1.1: Editor Accept/Decline Flow
- [ ] Accept Flow: INVITED → ACCEPTED ✓ PASS / ✗ FAIL
  - Database updated correctly
  - Notification sent to coordinator
  - Manuscript status unchanged
  
- [ ] Decline Flow: INVITED → SUBMITTED ✓ PASS / ✗ FAIL
  - Database updated correctly
  - Manuscript reverted to SUBMITTED
  - assigned_editor_id cleared
  - Notification sent to coordinator

## P1.2: Editor Evaluation & Recommendation
- [ ] Evaluation Form Display ✓ PASS / ✗ FAIL
  - Appears after assignment ACCEPTED
  - All 7 score fields present
  - Comment fields present

- [ ] Evaluation Submission ✓ PASS / ✗ FAIL
  - Scores saved correctly (8,7,8,7,9,8,7)
  - Comments saved correctly
  - assessment_status changed to SUBMITTED
  - assessment_submitted_at set
  - Notification sent to coordinator
  
- [ ] Read-Only State ✓ PASS / ✗ FAIL
  - Form becomes read-only after submission
  - "✓ Evaluation Submitted" message shows
  - Cannot edit fields
  
- [ ] 3-Decision Panel ✓ PASS / ✗ FAIL
  - 4 buttons visible (Accept/Minor/Major/Reject)
  - All buttons clickable
  - Recommendation saved to database
  - recommendation_submitted_at set
  - Notification sent to coordinator
  
- [ ] Persistence After Refresh ✓ PASS / ✗ FAIL
  - Read-only state persists
  - Recommendation value persists
  - Cannot modify after submission

## Realtime Tests
- [ ] Realtime Accept Notification ✓ PASS / ✗ FAIL
  - Coordinator notified without refresh
  - Updates within 1-2 seconds
  
- [ ] Realtime Recommendation Notification ✓ PASS / ✗ FAIL
  - Coordinator notified of recommendation
  - Updates without refresh

## RLS & Permissions
- [ ] Editor sees only own assignments ✓ PASS / ✗ FAIL
- [ ] Coordinator sees all assignments ✓ PASS / ✗ FAIL
- [ ] Author cannot see assignments ✓ PASS / ✗ FAIL

## Issues Found
1. [Issue description] - Severity: HIGH/MEDIUM/LOW - Status: OPEN/FIXED

## Summary
✓ ALL TESTS PASSED - P1.1 & P1.2 Ready for Production
or
✗ ISSUES FOUND - P1.3 blocked on: [list issues]
```

---

## QUICK REFERENCE: Key SQL Queries

### Check Assignment Status
```sql
SELECT id, manuscript_id, editor_id, status, assessment_status, recommendation, recommendation_submitted_at
FROM public.editor_assignments
WHERE manuscript_id = 'test-manuscript-001'
LIMIT 1;
```

### Check All Notifications for Manuscript
```sql
SELECT type, recipient_id, created_at
FROM public.workflow_notifications
WHERE manuscript_id = 'test-manuscript-001'
ORDER BY created_at DESC;
```

### Check Manuscript Status History
```sql
SELECT from_status, to_status, created_at
FROM public.manuscript_status_history
WHERE manuscript_id = 'test-manuscript-001'
ORDER BY created_at;
```

### List All Editor Assignments
```sql
SELECT id, manuscript_id, editor_id, status, assessment_status
FROM public.editor_assignments
ORDER BY assigned_at DESC
LIMIT 10;
```

---

## TROUBLESHOOTING

### Modal Not Appearing
**Issue:** Accept/Decline modal doesn't show when clicking INVITED assignment
**Solution:** 
- Check browser console for errors (F12)
- Verify assignment.status is actually 'INVITED' (SELECT from database)
- Check EditorWorkspace.tsx line 136 for showAcceptModal logic

### Evaluation Form Not Showing
**Issue:** After clicking Accept, evaluation form doesn't appear
**Solution:**
- Verify assignment.status changed to 'ACCEPTED' in database
- Check browser console for errors
- Refresh page and try again

### Scores Not Saving
**Issue:** After submitting evaluation, scores are NULL in database
**Solution:**
- Verify all score fields were filled before submit
- Check browser network tab (F12) to see if RPC call was made
- Verify submit_editor_assessment RPC exists: `SELECT proname FROM pg_proc WHERE proname = 'submit_editor_assessment';`

### Coordinator Not Getting Notifications
**Issue:** Coordinator doesn't see updates in real-time
**Solution:**
- Verify Coordinator account is ACTIVE (not PENDING)
- Check if subscriptions are set up in CoordinatorWorkspace.tsx
- Verify workflow_notifications table has entries (SELECT from notifications table)
- Check realtime settings in Supabase Dashboard

---

## NEXT STEPS AFTER P1.1 & P1.2 PASS

1. **Document Results** - Create test report with all results
2. **Fix Any Issues** - Address any FAIL results before proceeding
3. **Commit Changes** - Commit EditorWorkspace modifications
4. **Implement P1.3** - Begin Coordinator Review Package implementation
5. **Test P1.3** - Full end-to-end workflow with all 3 phases

---

*End of Test Execution Guide*
