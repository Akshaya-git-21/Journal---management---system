# EDITOR EVALUATION TESTING GUIDE

Complete testing instructions to verify both bug fixes work correctly.

## Prerequisites

- Supabase database with test data
- Two browsers or tabs (for real-time testing)
- Test accounts: Author, Editor, Coordinator

## Setup Test Data

### Create Test Accounts (if needed)

```bash
# Create author account
curl -X POST "https://your-supabase.supabase.co/auth/v1/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "author@test.com",
    "password": "TestPass123!",
    "user_metadata": {"full_name": "Test Author"}
  }'

# Create editor account  
curl -X POST "https://your-supabase.supabase.co/auth/v1/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "editor@test.com",
    "password": "TestPass123!",
    "user_metadata": {"full_name": "Test Editor"}
  }'

# Create coordinator account
curl -X POST "https://your-supabase.supabase.co/auth/v1/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "coordinator@test.com", 
    "password": "TestPass123!",
    "user_metadata": {"full_name": "Test Coordinator"}
  }'
```

---

## TEST 1: ACCEPT MANUSCRIPT WITH SUGGESTED REVIEWERS

### Objective
Verify that editor can successfully submit evaluation with recommendation and suggested reviewers.

### Test Steps

**Step 1: Author Submits Manuscript**
1. Log in as: author@test.com
2. Create manuscript:
   - Title: "Machine Learning in Healthcare"
   - Abstract: "This paper explores ML applications in medical diagnosis..."
   - Authors: "Dr. John Smith, Dr. Jane Doe"
   - Click "Submit Manuscript"
3. ✅ **Verify:** Manuscript appears with status "SUBMITTED"

**Step 2: Coordinator Assigns Editor**
1. Log in as: coordinator@test.com
2. Find the manuscript from Step 1
3. Click "Assign Editor"
4. Select: Test Editor (editor@test.com)
5. Click "Confirm Assignment"
6. ✅ **Verify:** Assignment appears with status "INVITED"

**Step 3: Editor Accepts Assignment**
1. Log in as: editor@test.com
2. Go to "Editor Workspace"
3. Find the manuscript from Step 1
4. Click "Open"
5. Modal appears: "Editorial Assignment"
6. Click "✓ Accept Assignment"
7. ✅ **Verify:** Modal closes, evaluation form becomes available

**Step 4: Editor Fills Evaluation Form**
1. Click "Editor Evaluation" tab
2. Fill evaluation criteria (1-10 scale):
   - Scientific Merit: **8**
   - Novelty & Innovation: **7**
   - Methodology Quality: **8**
   - Validity of Results: **9**
   - Clarity & Presentation: **7**
   - Ethical Standards: **10**

3. Fill qualitative fields:
   - Strengths: "Comprehensive methodology, well-structured research"
   - Weaknesses: "Literature review could be more recent"
   - Mandatory Revisions: "Add 2023-2024 references, clarify statistical methods"
   - Comments to Coordinator: "Strong work, should proceed to peer review"

**Step 5: Editor Suggests Peer Reviewers**
1. Scroll to "SUGGEST PEER REFEREES" section (right sidebar)
2. Enter first reviewer:
   - Reviewer Name: **Dr. Alice Johnson**
   - Reviewer Email: **alice.johnson@university.edu**
   - Expertise / Specialization: **Machine Learning, Healthcare AI**
   - Click "+ Add Suggestion"
3. ✅ **Verify:** Suggestion appears in "SUGGESTED REVIEWERS" list with "New" badge

4. Add second reviewer:
   - Reviewer Name: **Dr. Bob Chen**
   - Reviewer Email: **bob.chen@institute.org**
   - Expertise / Specialization: **Biostatistics, Epidemiology**
   - Click "+ Add Suggestion"
5. ✅ **Verify:** Both reviewers appear in suggestions list

**Step 6: Editor Clicks Accept Manuscript**
1. Scroll to bottom of form
2. Find "EDITOR RECOMMENDATION:" section
3. Click "✓ Accept Manuscript" button
4. Wait for response (5-10 seconds)

### Verification

**UI Level:**
- ✅ No error message appears
- ✅ Success notification: "Editorial recommendation submitted: ACCEPT"
- ✅ Evaluation status changes to "Evaluation Submitted"
- ✅ Decision section shows: "✓ Decision Submitted - Awaiting coordinator action"

**Database Level (verify via SQL or dashboard):**

```sql
-- Check editor_assignments
SELECT 
  id, editor_id, assessment_status, recommendation, 
  assessment_submitted_at, recommendation_submitted_at
FROM editor_assignments 
WHERE manuscript_id = '[manuscript-id]'
  AND editor_id = '[editor-user-id]';

-- Should show:
-- assessment_status: 'SUBMITTED'
-- recommendation: 'ACCEPT'
-- Both timestamps set to current time
```

```sql
-- Check suggested reviewers
SELECT id, manuscript_id, name, email, note, created_at
FROM manuscript_suggested_reviewers
WHERE manuscript_id = '[manuscript-id]'
  AND suggested_by = 'EDITOR';

-- Should show 2 rows:
-- Row 1: Dr. Alice Johnson, alice.johnson@university.edu, "Machine Learning, Healthcare AI"
-- Row 2: Dr. Bob Chen, bob.chen@institute.org, "Biostatistics, Epidemiology"
```

```sql
-- Check workflow history
SELECT id, manuscript_id, status, actor_id, created_at
FROM workflow_status_history
WHERE manuscript_id = '[manuscript-id]'
ORDER BY created_at DESC;

-- Should show recent transitions including editor assessment and recommendation
```

**Coordinator Dashboard:**
1. Log in as: coordinator@test.com
2. Go to "Coordinator Dashboard"
3. Find the manuscript from Step 1
4. ✅ **Verify:** 
   - Editor shows: "ACCEPTED"
   - Evaluation shows: "COMPLETED"
   - Scores visible: Scientific Merit 8, Novelty 7, etc.
   - Comments visible
   - Suggested Reviewers: "Dr. Alice Johnson (Machine Learning, Healthcare AI)", "Dr. Bob Chen (Biostatistics, Epidemiology)"
   - Editor Recommendation: "ACCEPT"

---

## TEST 2: REQUEST MINOR REVISION

### Objective
Verify that other recommendations (not just ACCEPT) work correctly.

### Test Steps

1. Repeat TEST 1, but at Step 6:
   - Instead of "Accept Manuscript", click "Request Minor Revision"

### Verification

**Database Level:**
```sql
SELECT assessment_status, recommendation 
FROM editor_assignments 
WHERE manuscript_id = '[manuscript-id]';

-- Should show:
-- assessment_status: 'SUBMITTED'
-- recommendation: 'MINOR_REVISION'
```

**Coordinator Dashboard:**
- ✅ Editor Recommendation shows: "MINOR_REVISION"
- ✅ Manuscript workflow moves to next stage

---

## TEST 3: REQUEST MAJOR REVISION

### Test Steps
Repeat TEST 1, Step 6 with "Request Major Revision"

### Verification
Database should show: `recommendation: 'MAJOR_REVISION'`

---

## TEST 4: REJECT MANUSCRIPT

### Test Steps
Repeat TEST 1, Step 6 with "Reject Manuscript"

### Verification
Database should show: `recommendation: 'REJECT'`

---

## TEST 5: DATA PERSISTENCE (Refresh & Logout)

### Objective
Verify that evaluation data persists across page refresh and login/logout.

### Test Steps

**Part A: Page Refresh**
1. Complete TEST 1 (Accept Manuscript)
2. Editor still logged in
3. Press F5 (page refresh)
4. Wait for page to load
5. Navigate to Editor Workspace → same manuscript → Editor Evaluation tab
6. ✅ **Verify:** 
   - All scores still visible (8, 7, 8, 9, 7, 10)
   - All comments still visible
   - Suggested reviewers still showing

**Part B: Logout/Login**
1. Still on evaluation page from Part A
2. Click logout
3. Log in again as: editor@test.com
4. Go to Editor Workspace → same manuscript
5. Click "Editor Evaluation" tab
6. ✅ **Verify:** 
   - All data persists
   - Status shows "Evaluation Submitted"

**Part C: Coordinator Sees Updated Data**
1. Log in as: coordinator@test.com
2. Go to Coordinator Dashboard
3. Refresh page (F5)
4. ✅ **Verify:** 
   - All editor data still visible
   - Recommendations still showing
   - Suggested reviewers persisted

---

## TEST 6: REAL-TIME SYNCHRONIZATION

### Objective
Verify that coordinator dashboard updates automatically when editor submits (without refresh).

### Setup
- Browser 1: Coordinator logged in, watching dashboard
- Browser 2: Editor ready to submit

### Test Steps

**Browser 1 (Coordinator):**
1. Log in as: coordinator@test.com
2. Open Coordinator Dashboard
3. Find manuscript from TEST 1
4. Note: Evaluation currently shows "NOT SUBMITTED" (or shows old data)
5. **Keep this window open, DO NOT REFRESH**

**Browser 2 (Editor):**
1. Log in as: editor@test.com
2. Open manuscript, go to Evaluation tab
3. Fill form (use TEST 1 as reference)
4. Add suggested reviewers
5. Click "Accept Manuscript"
6. Wait for success notification

**Browser 1 (Coordinator):**
7. **WITHOUT REFRESHING THE PAGE**, observe:
8. ✅ **Verify (within 2-3 seconds):**
   - Evaluation status changes to "COMPLETED"
   - Scores appear
   - Comments appear
   - Suggested reviewers appear
   - Recommendation shows "ACCEPT"
   - All updates automatic (no manual refresh)

If NOT seeing updates:
- Check browser console for errors
- Verify Supabase Realtime is enabled
- Try manual refresh (F5) as fallback

---

## TEST 7: ERROR HANDLING

### Objective
Verify proper error messages if something fails.

### Test Step 1: Try Recommendation Without Assessment
1. Log in as: editor@test.com
2. Try to directly call recommendation RPC without assessment
3. ✅ **Verify:** Error message: "You must submit your evaluation before making a recommendation"

### Test Step 2: Invalid Recommendation Value
1. Try to submit with invalid recommendation (e.g., "INVALID_VALUE")
2. ✅ **Verify:** Error message: "Invalid recommendation"

### Test Step 3: Missing Required Fields
1. Leave evaluation scores empty
2. Try to submit
3. ✅ **Verify:** Appropriate error about missing scores

---

## TEST 8: MULTIPLE MANUSCRIPTS

### Objective
Verify workflow works with multiple manuscripts assigned to same editor.

### Test Steps

1. Create 3 manuscripts (as author, repeat TEST 1 Step 1 three times)
2. Assign all 3 to same editor
3. Editor accepts all 3
4. Editor fills and submits each differently:
   - Manuscript 1: ACCEPT with 2 reviewers
   - Manuscript 2: MINOR_REVISION with 1 reviewer
   - Manuscript 3: REJECT with 0 reviewers

### Verification

✅ All 3 submissions succeed independently  
✅ Database shows 3 separate records in editor_assignments  
✅ Coordinator sees all 3 with different statuses and recommendations  
✅ Suggested reviewers correctly associated with each manuscript  

---

## TEST 9: EDGE CASES

### Test: Empty Reviewer List
1. Complete TEST 1, but don't add any suggested reviewers
2. Click "Accept Manuscript"
3. ✅ **Verify:** Works fine, no reviewers = no suggestions inserted

### Test: Reviewer with Missing Email
1. Add reviewer:
   - Name: "Dr. Unknown"
   - Email: (leave empty)
   - Expertise: "Testing"
2. Try to submit
3. ✅ **Verify:** Proper email validation error

### Test: Duplicate Reviewers
1. Add same reviewer twice
2. ✅ **Verify:** Either prevented or correctly inserted as separate records

### Test: Very Long Comments
1. Add very long comments (1000+ characters)
2. Submit
3. ✅ **Verify:** Saved correctly without truncation

---

## SUCCESS CRITERIA

All of the following must pass:

- ✅ TEST 1: Accept Manuscript with suggested reviewers succeeds
- ✅ TEST 2: Minor Revision recommendation saves correctly
- ✅ TEST 3: Major Revision recommendation saves correctly
- ✅ TEST 4: Reject recommendation saves correctly
- ✅ TEST 5: Data persists across refresh and login
- ✅ TEST 6: Coordinator dashboard updates in real-time
- ✅ TEST 7: Proper error handling
- ✅ TEST 8: Multiple manuscripts work independently
- ✅ TEST 9: Edge cases handled appropriately

---

## FAILURE DIAGNOSIS

### If TEST 1 Fails with Error

**Error: "You must submit your evaluation before making a recommendation"**
- ❌ Fix didn't work: Check that submit() is being called
- ❌ Check editorWorkspace.tsx lines 2270-2310 have proper changes
- ❌ Check network tab: Is submit_editor_assessment RPC being called?

**Error: "Assessment submission failed"**
- ❌ Check database: Does editor_assignments table have assessment_status column?
- ❌ Check database: Do editor_assignments table have all score columns?
- ❌ Check Supabase logs for RPC errors

**Suggested reviewers not in database**
- ❌ Check that submit() was called before recommendation
- ❌ Check network tab: Is p_suggested_reviewers being passed?
- ❌ Check database: Does manuscript_suggested_reviewers table exist?
- ❌ Check: Is expertise field being transformed to note?

### If TEST 6 Fails (No Real-Time Update)

- ❌ Check: Is Supabase Realtime enabled?
- ❌ Check: Are subscription channels set up correctly?
- ❌ Check browser console for WebSocket errors
- ❌ Manual refresh should at least show data (verify it does)
- ❌ Check Supabase project settings → Realtime → Enable required tables

---

## ROLLBACK PLAN

If tests fail and need to rollback:

1. Revert changes to `src/components/EditorWorkspace.tsx`
2. Rebuild: `npm run build`
3. Redeploy

The fixes are isolated to one file with clear changes, making rollback safe.

---

## NEXT ACTIONS

### After Successful Testing

1. ✅ Merge to main branch
2. ✅ Deploy to staging
3. ✅ Run full test suite
4. ✅ Deploy to production
5. ✅ Monitor error logs for 24 hours
6. ✅ Document in release notes:
   - Fixed: Editor cannot submit recommendation
   - Fixed: Peer referee suggestions not persisted
   - Clarified: Editor recommendation is separate from coordinator decision

### Recommended Post-Deployment

1. Monitor error logs: `ERROR: "You must submit your evaluation"` (should be gone)
2. Monitor database: suggested reviewers insertion (should increase)
3. Gather coordinator feedback on real-time updates
4. Gather editor feedback on UX/flow

---

**Test Execution Checklist**

- [ ] TEST 1: Accept Manuscript ✅
- [ ] TEST 2: Minor Revision ✅
- [ ] TEST 3: Major Revision ✅
- [ ] TEST 4: Reject ✅
- [ ] TEST 5: Data Persistence ✅
- [ ] TEST 6: Real-Time Sync ✅
- [ ] TEST 7: Error Handling ✅
- [ ] TEST 8: Multiple Manuscripts ✅
- [ ] TEST 9: Edge Cases ✅

All tests must pass before deployment.

---

Generated: 2026-08-13  
Status: READY FOR TESTING ✅
