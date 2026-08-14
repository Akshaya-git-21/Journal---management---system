# Manual Verification Checklist - Phases B, C, D

**Status:** Ready for Real-World Testing  
**Date:** August 14, 2026  
**Tester:** You (with real Supabase access)  
**Environment:** Production or staging with real data

---

## TEST A: Editor Evaluation Submission (Phase B)

### Prerequisites
- [ ] Have editor account ready
- [ ] Have manuscript assigned to editor (status: EDITOR_REVIEW)
- [ ] Editor assignment status: ACCEPTED

### Test Steps
1. [ ] Login as Editor
2. [ ] Navigate to Editor Workspace
3. [ ] Find assigned manuscript in list
4. [ ] Click on manuscript to open
5. [ ] Click "Editor Evaluation" tab
6. [ ] **Verify Form Appears:**
   - [ ] Form is NOT read-only (inputs enabled)
   - [ ] 7 evaluation criteria visible (Scientific Merit, Novelty, Methodology, Literature, Ethical, Data, Writing)
   - [ ] Each criterion has number input field (1-10)
   - [ ] Each criterion has visual progress bar

### Enter Evaluation Data
7. [ ] Set Scientific Merit: 8
8. [ ] Set Novelty & Innovation: 7
9. [ ] Set Methodology Quality: 9
10. [ ] Set Literature Adequacy: 8
11. [ ] Set Ethical Compliance: 9
12. [ ] Set Data Reliability: 8
13. [ ] Set Writing Quality: 7

### Enter Qualitative Feedback
14. [ ] Click "Strengths" field
15. [ ] Enter: "Clear methodology, novel approach, thorough literature review"
16. [ ] Click "Weaknesses" field
17. [ ] Enter: "Limited discussion of limitations, missing cost analysis"
18. [ ] Click "Mandatory Revisions" field
19. [ ] Enter: "Address section 3.4 on replicability concerns"
20. [ ] Click "Comments to Coordinator" field
21. [ ] Enter: "Recommend Dr. Sarah Chen and Prof. James Liu as reviewers"

### Add Reviewer Suggestions
22. [ ] Click "Reviewer Suggestions" section
23. [ ] **Verify:** "At least 2 reviewers required" message shown
24. [ ] Click first "Reviewer name" field
25. [ ] Enter: "Dr. Sarah Chen"
26. [ ] Click first "Email" field
27. [ ] Enter: "sarah.chen@university.edu"
28. [ ] Click first "Expertise" field
29. [ ] Enter: "Machine learning, statistical methods"

30. [ ] Click second reviewer name field
31. [ ] Enter: "Prof. James Liu"
32. [ ] Click second email field
33. [ ] Enter: "james.liu@research.org"
34. [ ] Click second expertise field
35. [ ] Enter: "Data science, methodology"

36. [ ] Click "Add Another Reviewer"
37. [ ] **Verify:** Third reviewer row appears
38. [ ] Enter third reviewer:
    - [ ] Name: "Dr. Amara Osei"
    - [ ] Email: "amara.osei@institute.ac.uk"
    - [ ] Expertise: "Complex systems, ethics"

### Validate Duplicate Detection
39. [ ] Try adding another reviewer with email "sarah.chen@university.edu"
40. [ ] **Verify:** Error message appears: "Duplicate email addresses detected" or similar
41. [ ] Remove the duplicate entry

### Submit Evaluation
42. [ ] **Verify:** "Submit Evaluation & Reviewer Suggestions" button is ENABLED (green, clickable)
43. [ ] Click submit button
44. [ ] **Verify:** Loading spinner appears
45. [ ] **Verify:** Success message: "Evaluation submitted successfully! The coordinator will now review your reviewer suggestions."
46. [ ] **Verify:** Page redirects/updates after 2 seconds

### Verify Database Persistence
47. [ ] **IN SUPABASE DASHBOARD:**
    - [ ] Check `editor_assignments` table
      - [ ] Find row for this manuscript
      - [ ] Verify `assessment_status = 'SUBMITTED'`
      - [ ] Verify `scientific_merit = 8` (and all scores present)
      - [ ] Verify `strengths` field populated
      - [ ] Verify `weaknesses` field populated
      - [ ] Verify `assessment_submitted_at` is recent timestamp

    - [ ] Check `manuscript_suggested_reviewers` table
      - [ ] Find 3 rows for this manuscript
      - [ ] **Verify ALL have `suggested_by = 'EDITOR'`**
      - [ ] Row 1: Dr. Sarah Chen, email, expertise
      - [ ] Row 2: Prof. James Liu, email, expertise
      - [ ] Row 3: Dr. Amara Osei, email, expertise
      - [ ] Verify each has correct `editor_id`
      - [ ] Verify each has correct `manuscript_id`

### Verify Form is Now Read-Only
48. [ ] Refresh browser page
49. [ ] Click "Editor Evaluation" tab again
50. [ ] **Verify:** Form is now READ-ONLY
    - [ ] All input fields disabled (grayed out)
    - [ ] All scores visible with progress bars
    - [ ] Success message: "Evaluation Submitted"
    - [ ] All previous data still visible

51. [ ] Refresh page multiple times
52. [ ] **Verify:** Form remains read-only, data persists (no dependency on React state)

---

## TEST B: Coordinator Review Board Actions (Phase C)

### Prerequisites
- [ ] Have Coordinator account ready
- [ ] Same manuscript with editor evaluation submitted
- [ ] 3 reviewer suggestions from editor in database

### Open Review Board
1. [ ] Login as Coordinator
2. [ ] Navigate to Coordinator Workspace / Manuscript Queue
3. [ ] Find the same manuscript
4. [ ] Click to open manuscript details
5. [ ] Click "Review Board" tab
6. [ ] **Verify Tab Appears**

### Verify Review Board Sections
7. [ ] **Reviewer Assignment Status Section:**
   - [ ] Shows "0 / 2 Reviewers Assigned" (or correct count if any already assigned)
   - [ ] Number comes from database (not hardcoded)

8. [ ] **⭐ Editor Suggested Reviewers Section:**
   - [ ] Shows "⭐ Editor Suggested Reviewers (3)"
   - [ ] All 3 reviewer cards visible:
     - [ ] Card 1: Dr. Sarah Chen, sarah.chen@university.edu, "Machine learning..."
     - [ ] Card 2: Prof. James Liu, james.liu@research.org, "Data science..."
     - [ ] Card 3: Dr. Amara Osei, amara.osei@institute.ac.uk, "Complex systems..."
   - [ ] Each card has:
     - [ ] ⭐ Star badge or "Suggested by Editor" indicator
     - [ ] Reviewer name
     - [ ] Email address
     - [ ] Expertise note
     - [ ] Three action buttons: [✓ Accept & Assign] [✕ Decline] [↻ Replace]

9. [ ] **Assigned Reviewers Section:**
   - [ ] Currently empty (no assignments yet)

10. [ ] **Available Reviewers Section:**
    - [ ] Lists active reviewers in database
    - [ ] Each reviewer has [+ Assign] button
    - [ ] Does NOT show suggested reviewers in Available list (separate sections)

### Test ACCEPT Action
11. [ ] Click "[✓ Accept & Assign]" on Dr. Sarah Chen
12. [ ] **Verify:**
    - [ ] Loading spinner appears on button
    - [ ] Success message: "Reviewer suggestion accepted and assigned"
    - [ ] Dr. Sarah Chen's card now shows green badge "✓ Accepted"
    - [ ] Action buttons hidden for this reviewer
    - [ ] Card background changed to green
    - [ ] "Assigned Reviewers" section now shows Dr. Sarah Chen
    - [ ] Counter updated to "1 / 2 Reviewers Assigned"

13. [ ] **In Supabase verify:**
    - [ ] New row in `reviewer_assignments` for Dr. Sarah Chen
    - [ ] Status: "INVITED"
    - [ ] Reviewer ID matches database profile
    - [ ] New row in `editor_reviewer_actions`
      - [ ] action = 'ACCEPTED'
      - [ ] suggestion_id points to Dr. Sarah Chen suggestion
      - [ ] coordinator_id recorded

14. [ ] Refresh page
15. [ ] **Verify:** Dr. Sarah Chen remains under "Assigned Reviewers" with "1 / 2" counter
16. [ ] **Verify:** State persists (comes from database, not React state)

### Test DECLINE Action
17. [ ] Click "[✕ Decline]" on Prof. James Liu
18. [ ] **Verify:**
    - [ ] Decline reason modal/dialog appears with textarea
    - [ ] "Optional reason for declining" placeholder visible

19. [ ] Enter reason: "Reviewer availability conflict"
20. [ ] Click "Confirm Decline"
21. [ ] **Verify:**
    - [ ] Loading spinner appears
    - [ ] Success message: "Reviewer suggestion declined"
    - [ ] Prof. James Liu's card shows red badge "✕ Declined"
    - [ ] Action buttons hidden
    - [ ] Card background changed to red
    - [ ] Counter STILL shows "1 / 2" (NO new assignment created)

22. [ ] **In Supabase verify:**
    - [ ] NO new row in `reviewer_assignments` (decline doesn't create assignment)
    - [ ] New row in `editor_reviewer_actions`
      - [ ] action = 'DECLINED'
      - [ ] suggestion_id points to Prof. James Liu
      - [ ] decline_reason = "Reviewer availability conflict"

23. [ ] Refresh page
24. [ ] **Verify:** Prof. James Liu remains showing "✕ Declined" status, counter still "1 / 2"

### Test REPLACE Action
25. [ ] Click "[↻ Replace]" on Dr. Amara Osei
26. [ ] **Verify:**
    - [ ] Replace modal appears
    - [ ] Message: "Select Replacement Reviewer:"
    - [ ] Dropdown menu with available reviewers
    - [ ] [Confirm Replacement] button

27. [ ] Click dropdown
28. [ ] Select a different reviewer (e.g., "Dr. Test One" or "Dr. Test Two")
29. [ ] Click "Confirm Replacement"
30. [ ] **Verify:**
    - [ ] Loading spinner appears
    - [ ] Success message: "Reviewer suggestion replaced"
    - [ ] Dr. Amara Osei's card shows blue badge "↻ Replaced"
    - [ ] Replacement reviewer appears in "Assigned Reviewers" section
    - [ ] Counter updated to "2 / 2 Reviewers Assigned"

31. [ ] **In Supabase verify:**
    - [ ] New row in `reviewer_assignments` for replacement reviewer
    - [ ] Status: "INVITED"
    - [ ] NEW row in `editor_reviewer_actions`
      - [ ] action = 'REPLACED'
      - [ ] suggestion_id points to Dr. Amara Osei
      - [ ] replacement_reviewer_id set to new reviewer

32. [ ] Refresh page
33. [ ] **Verify:** State persists, counter still "2 / 2", both assigned reviewers visible

---

## TEST C: Direct Assignment (Non-Suggested Reviewer)

**This test is CRITICAL - Coordinator must be able to assign anyone, not just suggested reviewers**

### Setup
- [ ] Have a fresh manuscript with 0 assignments
- [ ] OR use same manuscript but decline all suggestions first

### Test Steps
1. [ ] Open Review Board tab
2. [ ] Look at "Available Reviewers" section
3. [ ] Find a reviewer who was NOT suggested by the editor
4. [ ] Click "[+ Assign]" button next to that reviewer
5. [ ] **Verify:**
    - [ ] Loading spinner appears
    - [ ] Success message: "Reviewer assigned directly"
    - [ ] Reviewer appears under "Assigned Reviewers"
    - [ ] No connection to editor suggestions
    - [ ] Assignment counter increments

6. [ ] **In Supabase verify:**
    - [ ] New row in `reviewer_assignments`
    - [ ] NO corresponding row in `editor_reviewer_actions` (no suggestion action)
    - [ ] This proves direct assignment works independently

7. [ ] Refresh page
8. [ ] **Verify:** Assignment persists

---

## TEST D: Finalization (Phase D)

### Prerequisites
- [ ] Exactly 2 reviewers assigned (success messages confirmed)
- [ ] Both visible under "Assigned Reviewers"
- [ ] Counter shows "2 / 2"

### Test Steps
1. [ ] Scroll to bottom of Review Board
2. [ ] **Verify:** Button text: "Confirm Reviewer Assignments & Transition to Peer Review"
3. [ ] **Verify:** Button is ENABLED (green, clickable)
   - [ ] If button is disabled/grayed out, something is wrong

4. [ ] Click button
5. [ ] **Verify:**
    - [ ] Confirmation dialog appears: "Confirm finalizing the reviewer board? This will transition the manuscript to Peer Review."
    - [ ] [OK] and [Cancel] buttons

6. [ ] Click [OK]
7. [ ] **Verify:**
    - [ ] Loading spinner appears on button
    - [ ] Success message: "✓ Reviewer board finalized. Manuscript transitioned to Peer Review."

### Verify Manuscript Status Change
8. [ ] **IN SUPABASE:**
    - [ ] Check `manuscripts` table for this manuscript
    - [ ] **Verify:** `status = 'UNDER_REVIEW'` (changed from 'EDITOR_REVIEW')
    - [ ] Check `manuscript_status_history` table
    - [ ] **Verify:** New row exists
      - [ ] `from_status = 'EDITOR_REVIEW'`
      - [ ] `to_status = 'UNDER_REVIEW'`
      - [ ] Recent timestamp

9. [ ] Refresh page
10. [ ] **Verify:** Board shows finalized message: "✓ Reviewer Board Finalized"
11. [ ] **Verify:** All action buttons are HIDDEN or DISABLED:
    - [ ] No "[✓ Accept & Assign]" buttons
    - [ ] No "[✕ Decline]" buttons
    - [ ] No "[↻ Replace]" buttons
    - [ ] No "[+ Assign]" buttons (Available Reviewers hidden)
    - [ ] "Confirm Reviewer Assignments" button gone

12. [ ] **Verify:** Finalized reviewers still shown in "Assigned Reviewers" (read-only)

13. [ ] Refresh page multiple times
14. [ ] **Verify:** Board remains finalized, cannot interact

---

## TEST E: Security - Operations After Finalization (CRITICAL)

After finalization, attempt these operations. ALL MUST FAIL.

### Attempt 1: Try to Accept Another Suggestion
1. [ ] Assume there's another suggestion (Decline one suggestion first if needed)
2. [ ] Try to click "[✓ Accept & Assign]" on a pending suggestion
3. [ ] **Expected:** Button hidden or operation fails with error
4. [ ] **Verify in Console:** Check for RPC error if you try via API

### Attempt 2: Try to Decline a Suggestion
5. [ ] Try to click "[✕ Decline]"
6. [ ] **Expected:** Button hidden or modal doesn't open

### Attempt 3: Try to Replace a Reviewer
7. [ ] Try to click "[↻ Replace]"
8. [ ] **Expected:** Button hidden

### Attempt 4: Try to Direct Assign
9. [ ] Try to click "[+ Assign]" on available reviewer
10. [ ] **Expected:** Button hidden or operation fails

### Attempt 5: Try to Finalize Again
11. [ ] Look for "Confirm Assignments" button
12. [ ] **Expected:** Button doesn't exist (finalized message shown instead)

### Attempt 6: Modify via API (Advanced - Optional)
13. [ ] Open browser DevTools → Network tab
14. [ ] Try to call `coordinator_accept_suggestion()` RPC manually
15. [ ] **Expected:** RPC error: "Manuscript is not in editor review stage (status=UNDER_REVIEW)"
    - This proves server-side protection works

---

## TEST F: Multi-User Scenario

### Prerequisites
- [ ] Two browser windows/tabs ready
- [ ] One logged in as Editor, one as Coordinator
- [ ] Same manuscript in both

### Test Steps
1. [ ] **EDITOR WINDOW:** Submit evaluation + 3 reviewer suggestions
2. [ ] **COORDINATOR WINDOW:** Refresh/reopen manuscript
3. [ ] **Verify:** Editor suggested reviewers immediately visible
    - This proves editor suggestions sync across users

4. [ ] **COORDINATOR WINDOW:** Click "Accept" on first reviewer
5. [ ] **EDITOR WINDOW:** Refresh page
6. [ ] **Verify:** Assignment counter and Assigned Reviewers list updated
    - This proves coordinator actions visible to other users

---

## TEST G: Data Integrity Checks

### Check 1: No Duplicate Assignments
1. [ ] Attempt to assign the same reviewer twice via different paths
2. [ ] **Expected:** Second attempt fails with error
3. [ ] **Verify in Supabase:** Only one assignment row exists

### Check 2: Cannot Assign Inactive Reviewer
1. [ ] Find an inactive reviewer in profiles (status = 'PENDING' or 'REJECTED')
2. [ ] Try to assign directly or via replacement
3. [ ] **Expected:** Operation fails with "not an active reviewer" error

### Check 3: Cannot Finalize with < 2 Reviewers
1. [ ] With only 1 reviewer assigned:
2. [ ] **Verify:** Finalize button is DISABLED (grayed out)
3. [ ] Try to call RPC manually if possible
4. [ ] **Expected:** Error: "Exactly 2 reviewers are required"

### Check 4: Suggested Reviewers Only Show If Actually Suggested
1. [ ] In Review Board, check that suggested reviewers section ONLY contains reviewers with:
   - [ ] `manuscript_suggested_reviewers.suggested_by = 'EDITOR'`
   - [ ] NOT just any available reviewer

---

## TEST H: UI/UX Issues Checklist

While executing tests, watch for:

### Page/Loading Issues
- [ ] Review Board never goes blank
- [ ] Suggested reviewers section always visible (if any suggestions exist)
- [ ] Loading spinners appear and disappear properly
- [ ] No infinite loading states
- [ ] No "404" or "500" errors
- [ ] No "permission denied" messages (unless trying unauthorized action)

### Data Display Issues
- [ ] Suggested reviewers display ONLY those suggested by editor
- [ ] Available reviewers do NOT overlap with suggested section
- [ ] Assignment counter updates instantly after each action
- [ ] Duplicate reviewers cannot appear in suggestions
- [ ] Reviewer names/emails match database (not hardcoded)

### Button/Interaction Issues
- [ ] All action buttons work and respond immediately
- [ ] Loading spinner shows during operation
- [ ] Buttons disable while processing (no double-click)
- [ ] Buttons re-enable after operation completes
- [ ] Confirmation dialogs appear for destructive actions
- [ ] Can cancel operations (Decline reason, Replace selection)

### Persistence Issues
- [ ] Data persists after page refresh
- [ ] State not lost when navigating away and back
- [ ] Multiple refreshes maintain consistency
- [ ] No dependency on browser cache

### Console Issues
- [ ] No red errors in browser console
- [ ] No warnings about missing dependencies
- [ ] No "Cannot read property" errors
- [ ] No RLS/permission errors on allowed operations
- [ ] Success messages appropriate and clear

---

## Test Completion

### All Tests Passed: ✅ YES / ❌ NO

### Issues Found (if any):
```
[List any failures, unexpected errors, or inconsistencies here]
```

### Final Status
- [ ] Phase B (Editor Form): PASS / FAIL
- [ ] Phase C (Coordinator Board): PASS / FAIL
- [ ] Phase D (Finalization): PASS / FAIL
- [ ] Security (No modifications after finalize): PASS / FAIL

### Ready for Phase E?
- [ ] YES - All tests passed, no critical issues
- [ ] NO - Issues require fixing first

---

**IMPORTANT NOTES:**

1. **Do NOT claim success without running this checklist.**
2. **Every step must be executed with a real user and real Supabase data.**
3. **If any test FAILS, report the exact issue before proceeding to Phase E.**
4. **After completing this checklist, provide results in the following format:**

```
VERIFICATION RESULTS
===================

Phase B - Editor Evaluation: PASS / FAIL
  - Issues: [none] / [list if any]

Phase C - Coordinator Review Board: PASS / FAIL
  - Issues: [none] / [list if any]

Phase D - Finalization: PASS / FAIL
  - Issues: [none] / [list if any]

Phase E Readiness: READY / BLOCKED
  - Blocking issues: [if any]
```
