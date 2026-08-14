# Phase B & C Testing Guide - Complete End-to-End Workflow

**Status:** Ready for Testing  
**Date:** August 14, 2026  
**Duration:** ~15-20 minutes per complete flow

---

## Pre-Test Setup

### Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] Supabase migrations applied (migration 0008 active)
- [ ] Test editor account available
- [ ] Test coordinator account available
- [ ] Test reviewer accounts available (at least 3 with role=REVIEWER, status=ACTIVE)
- [ ] Browser with working cookies/session storage
- [ ] Database access (optional, for verification)

### Test Manuscript Selection
- Use an existing manuscript in SUBMITTED status
- Or create a new one and assign an editor first

---

## Test Flow 1: Editor Evaluation Submission (Phase B)

### Step 1: Editor Accepts Assignment
**Actor:** Editor  
**Prerequisite:** Manuscript assigned to editor (editor_assignments.status = INVITED)

1. Login as editor
2. Navigate to Editor Workspace
3. Find manuscript in "Active Submissions" list
4. Verify status shows "INVITED"
5. Click on manuscript to open details
6. Accept assignment modal appears
7. **✅ Verify:** "Accept Assignment" button visible

**Expected State After:**
- editor_assignments.status = 'ACCEPTED'
- editor_assignments.assessment_status = 'NOT_STARTED'
- Redirected to manuscript detail view

---

### Step 2: Open Editor Evaluation Form
**Actor:** Editor  
**Current State:** Assignment accepted, assessment not started

1. Look for "Editor Evaluation" tab in manuscript detail tabs
2. Click tab
3. **✅ Verify:** Form appears (NOT read-only display)
4. **✅ Verify:** Form shows 7 evaluation criteria with sliders
5. **✅ Verify:** Qualitative feedback sections present:
   - Strengths (required, red asterisk)
   - Weaknesses (required, red asterisk)
   - Mandatory Revisions (optional)
   - Comments to Coordinator (optional)
6. **✅ Verify:** Reviewer Suggestions section:
   - Shows 2 empty reviewer slots by default
   - "Add Another Reviewer" button visible
   - Each reviewer has: Name, Email, Expertise Note fields

---

### Step 3: Fill Evaluation Scores
**Actor:** Editor

1. For each of 7 criteria, drag slider or click input field
2. Set scores between 1-10
3. **✅ Verify:** Progress bar updates for each criterion
4. Example scores:
   - Scientific Merit: 8
   - Novelty & Innovation: 7
   - Methodology Quality: 9
   - Literature Adequacy: 8
   - Ethical Compliance: 9
   - Data Reliability: 8
   - Writing Quality: 7

**Expected State:**
- All scores visible in number input and progress bar
- UI responsive to slider changes

---

### Step 4: Add Qualitative Feedback
**Actor:** Editor

1. Click "Strengths" textarea
2. Enter: "Clear presentation of novel methodology. Strong data analysis."
3. Click "Weaknesses" textarea
4. Enter: "Limited discussion of limitations. Missing some recent references."
5. Click "Mandatory Revisions" textarea
6. Enter: "Add Section 4.2 on conflict of interest assessment."
7. Click "Comments to Coordinator" textarea
8. Enter: "Please consider Dr. Chen from previous cohort - familiar with this work."

**✅ Verify:** All text entered and visible

---

### Step 5: Add Reviewer Suggestions
**Actor:** Editor

1. In first reviewer slot, enter:
   - Name: "Dr. Sarah Mitchell"
   - Email: "demo.reviewer1@example.com"
   - Expertise: "Complex systems modeling"

2. In second reviewer slot, enter:
   - Name: "Prof. James Liu"
   - Email: "demo.reviewer2@example.com"
   - Expertise: "Data science applications"

3. **✅ Verify:** "✓ 2 valid suggestions" message appears at bottom

4. Click "Add Another Reviewer"

5. **✅ Verify:** Third reviewer slot appears

6. Enter third reviewer:
   - Name: "Dr. Amara Osei"
   - Email: "demo.reviewer3@example.com"
   - Expertise: "Statistical methods"

7. **✅ Verify:** "✓ 3 valid suggestions" message updated

### Step 6: Test Duplicate Detection
**Actor:** Editor

1. In fourth reviewer slot, try to enter:
   - Name: "Duplicate Test"
   - Email: "demo.reviewer1@example.com" (duplicate of first)

2. **✅ Verify:** Error appears: "⚠ Duplicate email addresses detected"

3. Remove duplicate entry

---

### Step 7: Submit Evaluation
**Actor:** Editor

1. Verify "Submit Evaluation & Reviewer Suggestions" button is ENABLED
   - Should be green, not grayed out
   - All validations should pass

2. Click button

3. **✅ Verify:** Loading spinner appears
4. **✅ Verify:** Message: "Evaluation submitted successfully! The coordinator will now review your reviewer suggestions."
5. **✅ Verify:** Page redirects after 2 seconds

**Expected State After:**
- editor_assignments.assessment_status = 'SUBMITTED'
- editor_assignments.assessment_submitted_at = current timestamp
- 3 records in manuscript_suggested_reviewers (suggested_by = 'EDITOR')
- All evaluation criteria scores stored
- Strengths, weaknesses, revisions stored

---

### Step 8: Verify Database Records (Optional - for QA)
**Actor:** Database Admin / QA

Run SQL:
```sql
-- Verify editor assignment
SELECT id, manuscript_id, assessment_status, assessment_submitted_at
FROM editor_assignments
WHERE manuscript_id = 'TEST-MS-001'
ORDER BY created_at DESC LIMIT 1;

-- Verify suggested reviewers
SELECT id, manuscript_id, name, email, suggested_by, created_at
FROM manuscript_suggested_reviewers
WHERE manuscript_id = 'TEST-MS-001'
AND suggested_by = 'EDITOR'
ORDER BY created_at;

-- Verify evaluation scores
SELECT scientific_merit, novelty_innovation, methodology_quality, 
       literature_adequacy, ethical_compliance, data_reliability, writing_quality,
       strengths, weaknesses, mandatory_revisions, comments_to_coordinator
FROM editor_assignments
WHERE manuscript_id = 'TEST-MS-001'
ORDER BY created_at DESC LIMIT 1;
```

**Expected Results:**
- 1 editor_assignment record with assessment_status = SUBMITTED
- 3 manuscript_suggested_reviewers records all with suggested_by = 'EDITOR'
- All scores populated (not null)
- All text feedback stored

---

### Step 9: Verify Form is Now Read-Only
**Actor:** Editor

1. Still on same manuscript detail page
2. Refresh page
3. Click "Editor Evaluation" tab again
4. **✅ Verify:** Form is now READ-ONLY display
5. **✅ Verify:** Shows all scores with progress bars
6. **✅ Verify:** Shows "Evaluation Submitted" confirmation message

---

## Test Flow 2: Coordinator Review Board Actions (Phase C)

### Step 1: Coordinator Opens Review Board
**Actor:** Coordinator  
**Prerequisite:** Manuscript has editor assessment submitted with suggestions

1. Login as coordinator
2. Navigate to Coordinator Workspace
3. Find the same test manuscript
4. Click to open manuscript detail
5. Verify default tab is "Overview"
6. Click "Review Board" tab

**✅ Verify:** New Phase C Review Board appears with:
- Reviewer Assignment Status showing "0 / 2"
- "⭐ Editor Suggested Reviewers" section with all 3 suggestions
- "Available Reviewers" section listing active reviewers
- "Assigned Reviewers" section (empty for now)

---

### Step 2: Verify Suggested Reviewers Display
**Actor:** Coordinator

1. Look at "⭐ Editor Suggested Reviewers" section
2. **✅ Verify:** Each suggestion shows:
   - ⭐ Star icon
   - Name: "Dr. Sarah Mitchell"
   - Email: "demo.reviewer1@example.com"
   - Expertise: "Complex systems modeling"
   - Three action buttons:
     - [✓ Accept & Assign]
     - [✕ Decline]
     - [↻ Replace]

3. **✅ Verify:** All 3 reviewers displayed
4. **✅ Verify:** No status badges yet (should be PENDING)

---

### Step 3: Accept First Suggestion
**Actor:** Coordinator

1. Click "✓ Accept & Assign" on Dr. Sarah Mitchell

2. **✅ Verify:** Button shows loading spinner
3. **✅ Verify:** Green success message appears: "Reviewer suggestion accepted and assigned"
4. Message auto-dismisses after 3 seconds

5. **✅ Verify:** In "⭐ Editor Suggested Reviewers" section:
   - Dr. Sarah Mitchell now shows green "✓ Accepted" badge
   - Action buttons are hidden/disabled for this reviewer
   - Background changed to green (accepted state)

6. **✅ Verify:** "Reviewer Assignment Status" updated to "1 / 2"

7. **✅ Verify:** "Assigned Reviewers" section now shows:
   - Dr. Sarah Mitchell
   - Email: demo.reviewer1@example.com
   - Status: INVITED
   - ✓ Green checkmark

---

### Step 4: Decline Second Suggestion
**Actor:** Coordinator

1. Click "✕ Decline" on Prof. James Liu

2. **✅ Verify:** Decline reason modal appears with textarea

3. Enter reason: "Currently overcommitted with other manuscripts"

4. Click "Confirm Decline"

5. **✅ Verify:** Loading spinner shows
6. **✅ Verify:** Success message: "Reviewer suggestion declined"

7. **✅ Verify:** Prof. James Liu now shows:
   - Red "✕ Declined" badge
   - Background changed to red
   - Action buttons removed

8. **✅ Verify:** NO assignment created for Prof. James Liu
9. **✅ Verify:** "Reviewer Assignment Status" still shows "1 / 2"

---

### Step 5: Replace Third Suggestion
**Actor:** Coordinator

1. Click "↻ Replace" on Dr. Amara Osei

2. **✅ Verify:** Replace modal appears with:
   - Message: "Select Replacement Reviewer:"
   - Dropdown menu with available reviewers
   - [Confirm Replacement] and [Cancel] buttons

3. Open dropdown and select a different reviewer
   - Example: "Dr. Test One (test1@example.com)"

4. Click "Confirm Replacement"

5. **✅ Verify:** Loading spinner shows
6. **✅ Verify:** Success message: "Reviewer suggestion replaced"

7. **✅ Verify:** Dr. Amara Osei shows:
   - Blue "↻ Replaced" badge
   - Background changed to blue
   - Original action buttons removed

8. **✅ Verify:** "Assigned Reviewers" section now includes:
   - Dr. Test One (the replacement)
   - Status: INVITED
   - ✓ Green checkmark

9. **✅ Verify:** "Reviewer Assignment Status" updated to "2 / 2"

---

### Step 6: Verify Finalization Button Enabled
**Actor:** Coordinator

1. **✅ Verify:** "Confirm Reviewer Assignments & Transition to Peer Review" button is now ENABLED
   - Should be green (not grayed out)
   - Clickable

2. **✅ Verify:** Only 2 reviewers are assigned:
   - Dr. Sarah Mitchell
   - Dr. Test One

---

### Step 7: Finalize Board
**Actor:** Coordinator

1. Click "Confirm Reviewer Assignments & Transition to Peer Review" button

2. **✅ Verify:** Confirmation dialog appears:
   - Message: "Confirm finalizing the reviewer board? This will transition the manuscript to Peer Review."
   - [OK] and [Cancel] options

3. Click [OK]

4. **✅ Verify:** Loading spinner shows on button
5. **✅ Verify:** Success message: "✓ Reviewer board finalized. Manuscript transitioned to Peer Review."

6. Page auto-refreshes (2 seconds)

7. **✅ Verify:** Review Board tab now shows:
   - "✓ Reviewer Board Finalized" message (green box)
   - "Assigned Reviewers (2/2)" section still visible
   - All action buttons ([Accept], [Decline], [Replace], [Assign]) are HIDDEN
   - Cannot interact with board anymore

---

### Step 8: Verify Database Transitions
**Actor:** Database Admin / QA

Run SQL:
```sql
-- Verify manuscript status changed
SELECT id, status, updated_at
FROM manuscripts
WHERE id = 'TEST-MS-001';

-- Verify coordinator actions recorded
SELECT id, suggestion_id, action, coordinator_id, created_at
FROM editor_reviewer_actions
WHERE manuscript_id = 'TEST-MS-001'
ORDER BY created_at;

-- Verify reviewer assignments
SELECT id, reviewer_id, status, invited_at
FROM reviewer_assignments
WHERE manuscript_id = 'TEST-MS-001';

-- Verify status history
SELECT from_status, to_status, actor_id, note, created_at
FROM manuscript_status_history
WHERE manuscript_id = 'TEST-MS-001'
ORDER BY created_at DESC LIMIT 1;
```

**Expected Results:**
- manuscripts.status = 'UNDER_REVIEW' (changed from EDITOR_REVIEW)
- 3 records in editor_reviewer_actions:
  1. (Dr. Sarah Mitchell suggestion_id, action='ACCEPTED')
  2. (Prof. James Liu suggestion_id, action='DECLINED')
  3. (Dr. Amara Osei suggestion_id, action='REPLACED', replacement_reviewer_id=Dr. Test One)
- 2 records in reviewer_assignments (INVITED status)
- 1 record in manuscript_status_history: EDITOR_REVIEW → UNDER_REVIEW

---

## Test Flow 3: Direct Assignment (Without Suggestions)

### Step 1: Setup New Manuscript
**Actor:** Coordinator

1. Use a different manuscript or create new one
2. Assign editor, get editor to submit assessment
3. With only 1 or fewer suggestions in Review Board

### Step 2: Assign Available Reviewer Directly
**Actor:** Coordinator

1. Open Review Board tab
2. Find "Available Reviewers" section
3. Select a reviewer who was NOT suggested by editor
4. Click "[+ Assign]" button

**✅ Verify:**
- Loading spinner shows
- Success message: "Reviewer assigned directly"
- Reviewer moves to "Assigned Reviewers" section
- Assignment counter increments
- No connection to suggestions

---

## Test Flow 4: Error Handling & Edge Cases

### Test 4A: Try to Assign Duplicate Reviewer
**Actor:** Coordinator

1. Accept suggestion for Dr. Sarah Mitchell (creates assignment)
2. Click "[+ Assign]" on Dr. Sarah Mitchell again in Available Reviewers
3. **✅ Verify:** Error message: "This reviewer is already assigned to this manuscript"
4. No duplicate created

---

### Test 4B: Try to Finalize with < 2 Reviewers
**Actor:** Coordinator

1. Accept only 1 suggestion
2. Try to click "Confirm Reviewer Assignments" button
3. **✅ Verify:** Button is DISABLED (grayed out)
4. Cannot click

---

### Test 4C: Try to Modify Finalized Board
**Actor:** Coordinator

1. After finalization, try to click any action button
2. **✅ Verify:** Buttons are HIDDEN or DISABLED
3. Cannot interact

---

## Test Flow 5: Security & Permissions

### Test 5A: Non-Coordinator Cannot Act
**Actor:** Editor or Reviewer (trying to act on Review Board)

1. Login as editor
2. Navigate to another editor's manuscript
3. Try to access Review Board
4. **✅ Verify:** Access denied or read-only view
5. Cannot click action buttons

---

### Test 5B: Server-Side Validation
**Actor:** QA (Testing via API or direct database manipulation)

1. Try to call `coordinator_accept_suggestion()` as non-coordinator
   - **✅ Verify:** RPC error: "Only a Coordinator may accept reviewer suggestions"

2. Try to assign inactive reviewer
   - **✅ Verify:** RPC error: "Suggested reviewer is not an active reviewer account"

3. Try to finalize with only 1 reviewer
   - **✅ Verify:** RPC error: "Exactly 2 reviewers are required..."

---

## Test Flow 6: Realtime Updates (Phase F - When Implemented)

### Test 6A: Multi-Window Sync (Future)
**When Phase F Complete:**

1. Open manuscript Review Board in Window A (Coordinator)
2. Open same manuscript in Window B (Different user or session)
3. In Window A, click "Accept" on a suggestion
4. **Expected (not yet implemented):** Window B auto-refreshes without manual reload
5. Window B shows updated status and counter

---

## Passing Criteria

### All Tests Pass When:
✅ Editor evaluation form appears for accepted assignments  
✅ Form shows 7 criteria with sliders/inputs  
✅ Suggestions min 2 validation enforced  
✅ Duplicate email detection works  
✅ Form submission stores data in database  
✅ After submission, form becomes read-only  
✅ Coordinator Review Board shows "X / 2" counter  
✅ Editor suggestions display with ⭐ badge  
✅ All 5 coordinator actions work (Accept, Decline, Replace, Direct Assign, Finalize)  
✅ Status updates in real-time on page  
✅ Database records created correctly  
✅ Manuscript transitions to UNDER_REVIEW after finalization  
✅ Board is locked after finalization  
✅ Server-side validation prevents invalid operations  

---

## Troubleshooting

### Issue: "RPC function not found"
**Solution:** Verify migration 0008 was applied to Supabase
```bash
# Check in Supabase dashboard: Database → Migrations
# Should show: "0008_reviewer_assignment_workflow"
```

### Issue: Editor Evaluation tab shows read-only form
**Check:**
1. assignment.status === 'ACCEPTED' ?
2. assignment.assessment_status === 'NOT_STARTED' ?
3. Try refreshing page
4. Check database: `editor_assignments.assessment_status` value

### Issue: "Accept & Assign" button does nothing
**Check:**
1. Reviewer exists as ACTIVE REVIEWER profile
2. Console for JavaScript errors
3. Network tab for failed RPC call
4. Check Supabase logs for RPC execution errors

### Issue: Finalize button disabled
**Check:**
1. Exactly 2 reviewers assigned?
2. manuscript.status === 'EDITOR_REVIEW' ?
3. All reviewers have valid profiles?

---

## Test Data Requirements

### Required Test Accounts
- 1 Editor account (role=EDITOR, status=ACTIVE)
- 1 Coordinator account (role=COORDINATOR, status=ACTIVE)
- 3+ Reviewer accounts (role=REVIEWER, status=ACTIVE)

### Required Test Manuscript
- Status: SUBMITTED
- Ready for editor assignment
- Or: Create new manuscript as author

---

**Total Estimated Time:** 20-30 minutes for complete flow  
**Recommended:** Run all tests in sequence (Flow 1 → 2 → 3 → 4 → 5)  
**Record:** Screenshot key checkpoints for documentation
