# Quick E2E Test Checklist - Copy & Paste Ready

**Execution Time:** ~90 minutes  
**Required:** 5 test accounts, staging environment  
**Result:** PASS/FAIL per workflow phase

---

## PHASE 0: SETUP (15 min)

### Create Test Accounts
Paste this in Supabase SQL Editor:
```sql
-- REPLACE: <PROJECT-UUID> with your actual UUIDs (gen_random_uuid())
INSERT INTO public.profiles (id, email, name, role, status) VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'author@test.com', 'Test Author', 'AUTHOR', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'coord@test.com', 'Test Coordinator', 'COORDINATOR', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'editor@test.com', 'Test Editor', 'EDITOR', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'rev1@test.com', 'Test Reviewer 1', 'REVIEWER', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000005'::uuid, 'rev2@test.com', 'Test Reviewer 2', 'REVIEWER', 'ACTIVE')
ON CONFLICT DO NOTHING;
```

### Browser Setup
Open 4 tabs:
1. **Coordinator** - http://localhost:3000
2. **Editor** - http://localhost:3000 (different window or incognito)
3. **Reviewer 1** - http://localhost:3000 (different window or incognito)
4. **Reviewer 2** - http://localhost:3000 (different window or incognito)

Arrange windows in 2x2 grid for side-by-side observation of realtime updates.

---

## PHASE 1: AUTHOR SUBMISSION (5 min)

### Author Actions
```
1. Log in as Author (author@test.com)
2. Click "New Submission"
3. Enter:
   - Title: "TEST MANUSCRIPT 001"
   - Abstract: "Test abstract for workflow validation"
   - References: "Reference 1, Reference 2"
   - Is Double Blind: ✓ (checked)
4. Upload manuscript file (any PDF)
5. Click "Submit"
```

### Success Indicators
- [ ] Manuscript appears in Author's "My Submissions" with status: SUBMITTED
- [ ] Status badge shows yellow/gold (SUBMITTED)
- [ ] Timestamp shows current time

### Database Verification
```sql
SELECT id, title, status, submitted_at FROM public.manuscripts 
WHERE title = 'TEST MANUSCRIPT 001';
-- Expected: status = 'SUBMITTED'
```

**Phase 1 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 2: COORDINATOR ASSIGNS EDITOR (5 min)

### Coordinator Actions
```
1. Log in as Coordinator (coord@test.com)
2. Open sidebar: "Submissions"
3. Find "TEST MANUSCRIPT 001"
4. Click on it
5. Click "Assign Editor"
6. Select "Test Editor"
7. Click "Assign" button
```

### Success Indicators
- [ ] Editor assignment modal closes
- [ ] Manuscript moves to "Editor Review" section
- [ ] Status badge changes to "EDITOR_REVIEW"

### Database Verification
```sql
SELECT id, status FROM public.editor_assignments 
WHERE manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
ORDER BY assigned_at DESC LIMIT 1;
-- Expected: status = 'INVITED'

SELECT status FROM public.manuscripts 
WHERE title = 'TEST MANUSCRIPT 001';
-- Expected: status = 'EDITOR_REVIEW'
```

**Phase 2 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 3: EDITOR ACCEPTS (3 min)

### Editor Actions
```
1. Log in as Editor (editor@test.com)
2. Sidebar: "Submissions"
3. See modal: "Accept Manuscript for Evaluation" / "Decline"
4. Click "Accept Manuscript for Evaluation"
5. Modal closes
```

### Success Indicators
- [ ] Modal disappears
- [ ] Evaluation form becomes visible
- [ ] Form shows manuscript title and abstract
- [ ] "3-Decision Panel" is DISABLED (greyed out)
- [ ] Can type in evaluation fields

### Coordinator Realtime Check (Tab 1)
- [ ] Without refresh, assignment status changes from "INVITED" to "ACCEPTED"
- [ ] Counter updates: "Active Submissions" increases by 1
- [ ] No manual refresh needed

### Database Verification
```sql
SELECT id, status, responded_at FROM public.editor_assignments 
WHERE manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
ORDER BY assigned_at DESC LIMIT 1;
-- Expected: status = 'ACCEPTED', responded_at = NOT NULL
```

**Phase 3 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 4: EDITOR EVALUATES (10 min)

### Editor Actions
```
1. Still on manuscript detail
2. Tab: "Evaluation"
3. Enter scores (1-10):
   Scientific Merit: 8
   Novelty & Innovation: 7
   Methodology Quality: 8
   Literature Adequacy: 9
   Ethical Compliance: 9
   Data Reliability: 8
   Writing Quality: 7
4. Enter text:
   Strengths: "Well-designed study"
   Weaknesses: "Limited sample"
   Mandatory Revisions: "Clarify methodology"
   Comments to Coordinator: "Ready for review"
5. Click "Submit Evaluation"
```

### Success Indicators
- [ ] Form becomes READ-ONLY (all fields disabled)
- [ ] Scores display as entered
- [ ] Comments display as entered
- [ ] "3-Decision Panel" appears and is ENABLED
- [ ] Success message displays

### Coordinator Realtime Check (Tab 1)
- [ ] Counter updates: "Evaluations Pending" decreases
- [ ] Manuscript card shows: "EVALUATION SUBMITTED"
- [ ] Reviewer assignment button becomes available
- [ ] No manual refresh needed

### Database Verification
```sql
SELECT assessment_status, assessment_submitted_at, scientific_merit 
FROM public.editor_assignments 
WHERE manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
ORDER BY assigned_at DESC LIMIT 1;
-- Expected: assessment_status = 'SUBMITTED', scientific_merit = 8
```

**Phase 4 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 5: EDITOR RECOMMENDATION (3 min)

### Editor Actions
```
1. On same page, "3-Decision Panel"
2. Click "MINOR_REVISION" button
3. Confirmation: "Submit recommendation?"
4. Click "Confirm"
```

### Success Indicators
- [ ] Button shows confirmation
- [ ] Recommendation saved message
- [ ] Button state changes (disabled or shows saved)

### Database Verification
```sql
SELECT recommendation, recommendation_submitted_at 
FROM public.editor_assignments 
WHERE manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
ORDER BY assigned_at DESC LIMIT 1;
-- Expected: recommendation = 'MINOR_REVISION', recommendation_submitted_at = NOT NULL
```

**Phase 5 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 6: COORDINATOR ASSIGNS REVIEWERS (5 min)

### Coordinator Actions
```
1. Log in as Coordinator (Tab 1)
2. Open "TEST MANUSCRIPT 001" again (if not already open)
3. Tab: "Reviewers" or "Review Assignment"
4. Button: "Assign Reviewers"
5. Modal: Select "Test Reviewer 1" and "Test Reviewer 2"
6. Click "Assign"
```

### Success Indicators
- [ ] Modal closes
- [ ] 2 reviewer cards appear showing "INVITED" status
- [ ] Reviewer names display correctly
- [ ] Counter appears: "0/2 Reviews Completed"

### Database Verification
```sql
SELECT reviewer_id, status FROM public.reviewer_assignments 
WHERE manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
ORDER BY invited_at DESC;
-- Expected: 2 rows, both status = 'INVITED'

SELECT status FROM public.manuscripts WHERE title = 'TEST MANUSCRIPT 001';
-- Expected: status = 'UNDER_REVIEW'
```

**Phase 6 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 7: REVIEWER 1 ACCEPTS (2 min)

### Reviewer 1 Actions (Tab 3)
```
1. Log in as Reviewer 1 (rev1@test.com)
2. Sidebar: "Reviews to Complete"
3. See "TEST MANUSCRIPT 001" with status "INVITED"
4. Click on it
5. Modal appears: "Accept Review" / "Decline Review"
6. Click "Accept Review"
7. Modal closes
```

### Success Indicators
- [ ] Review form appears
- [ ] All text fields enabled
- [ ] Can type in comments and scores

### Coordinator Realtime Check (Tab 1)
- [ ] Reviewer 1 card updates: status changes to "ACCEPTED"
- [ ] No manual refresh needed

### Database Verification
```sql
SELECT id, status, responded_at FROM public.reviewer_assignments 
WHERE reviewer_id = (SELECT id FROM profiles WHERE email = 'rev1@test.com')
AND manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001');
-- Expected: status = 'ACCEPTED', responded_at = NOT NULL
```

**Phase 7 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 8: REVIEWER 1 SUBMITS (10 min)

### Reviewer 1 Actions (Tab 3)
```
1. Tab: "Review Form"
2. Enter scores (1-10):
   Scientific Merit: 7
   Novelty & Innovation: 8
   Methodology Quality: 7
   Literature Adequacy: 8
   Ethical Compliance: 9
   Data Reliability: 7
   Writing Quality: 8
3. Comments to Author: "Methodology is sound"
4. Comments to Editor: "Recommend acceptance with clarification"
5. Recommendation: "MINOR_REVISION"
6. Click "Submit Review"
```

### Success Indicators
- [ ] Form becomes READ-ONLY
- [ ] Success message displays
- [ ] Data saved confirmation

### Coordinator Realtime Check (Tab 1)
- [ ] **CRITICAL:** Counter updates from "0/2" to "1/2" WITHOUT refresh
- [ ] Reviewer 1 card shows: "SUBMITTED" status
- [ ] Timestamp shows when submitted
- [ ] No page refresh occurred

### Database Verification
```sql
SELECT status, submitted_at, recommendation FROM public.reviewer_assignments 
WHERE reviewer_id = (SELECT id FROM profiles WHERE email = 'rev1@test.com')
AND manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001');
-- Expected: status = 'SUBMITTED', recommendation = 'MINOR_REVISION'
```

**Phase 8 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 9: REVIEWER 2 ACCEPTS & SUBMITS (12 min)

### Reviewer 2 Actions (Tab 4)
```
1. Log in as Reviewer 2 (rev2@test.com)
2. Sidebar: "Reviews to Complete"
3. Click "TEST MANUSCRIPT 001"
4. Modal: "Accept Review"
5. Click "Accept Review"
6. Fill review form with scores and comments
7. Recommendation: "MINOR_REVISION"
8. Click "Submit Review"
```

### Critical Realtime Check (Tab 1 - Coordinator)
- [ ] **MOST CRITICAL:** Counter updates from "1/2" to "2/2" WITHOUT refresh
- [ ] Both reviewer cards show "SUBMITTED" status
- [ ] Manuscript status badge changes to "AWAITING_DECISION"
- [ ] Editor receives notification (if configured)
- [ ] All updates happened in real-time with no page refresh

### Database Verification
```sql
SELECT COUNT(*) as total_submitted FROM public.reviewer_assignments 
WHERE manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
AND status = 'SUBMITTED';
-- Expected: total_submitted = 2

SELECT status FROM public.manuscripts WHERE title = 'TEST MANUSCRIPT 001';
-- Expected: status = 'AWAITING_DECISION'
```

**Phase 9 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 10: COORDINATOR FINAL DECISION (5 min)

### Coordinator Actions
```
1. Coordinator Tab 1: Open "TEST MANUSCRIPT 001" again
2. Tab: "Decision"
3. Review section displays:
   - Editor assessment (all 7 scores visible)
   - Reviewer 1 report (all 7 scores visible)
   - Reviewer 2 report (all 7 scores visible)
4. Text area: Decision Letter:
   "Thank you for submission. Minor revisions required."
5. Click "MINOR_REVISION" button
6. Confirmation dialog
7. Click "Confirm"
```

### Success Indicators
- [ ] Modal closes
- [ ] Status updates to "REVISION_REQUESTED"
- [ ] Decision letter saved
- [ ] Success notification appears

### Database Verification
```sql
SELECT status FROM public.manuscripts WHERE title = 'TEST MANUSCRIPT 001';
-- Expected: status = 'REVISION_REQUESTED'

SELECT revision_number, status FROM public.manuscript_revisions 
WHERE manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
ORDER BY revision_number DESC LIMIT 1;
-- Expected: revision_number = 1, status = 'AWAITING_AUTHOR_UPLOAD'
```

**Phase 10 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 11: AUTHOR SEES DECISION (3 min)

### Author Realtime Check (Author Tab - separate window)
```
1. Author should see status change WITHOUT refresh
2. Manuscript card updates:
   Status: "REVISION_REQUESTED" (orange badge)
   Decision Letter displayed
   Revision interface appears
```

### Success Indicators
- [ ] Status updated without page refresh
- [ ] Notification badge appears (if configured)
- [ ] Decision letter displays
- [ ] "Upload Revised Manuscript" button available

**Phase 11 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 12: AUTHOR SUBMITS REVISION (5 min)

### Author Actions
```
1. Click "Upload Revised Manuscript"
2. Select revised file (any PDF)
3. Enter response: "All comments addressed"
4. Click "Submit Revision"
```

### Success Indicators
- [ ] File uploaded confirmation
- [ ] Status changes to "EDITOR_REVIEW"
- [ ] Manuscript moves back to editor queue

### Database Verification
```sql
SELECT status FROM public.manuscripts WHERE title = 'TEST MANUSCRIPT 001';
-- Expected: status = 'EDITOR_REVIEW'

SELECT r.status, r.submitted_at FROM public.manuscript_revisions r 
WHERE r.manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
ORDER BY revision_number DESC LIMIT 1;
-- Expected: status = 'REVISION_SUBMITTED'
```

**Phase 12 Result:** ✅ PASS / ❌ FAIL

---

## PHASE 13: EDITOR RE-EVALUATES (10 min)

### Editor Actions
```
1. Editor Tab 2: Refresh or navigate to submissions
2. "TEST MANUSCRIPT 001" should appear in queue again
3. Status: "EDITOR_REVIEW"
4. Click on it
5. Assessment status resets to "NOT_STARTED"
6. Can enter new evaluation scores
7. Submit new evaluation
8. Make new recommendation
```

### Success Indicators
- [ ] Assessment status resets
- [ ] Can submit new evaluation
- [ ] Revision is properly linked
- [ ] Workflow continues normally

### Database Verification
```sql
SELECT assessment_status FROM public.editor_assignments 
WHERE manuscript_id = (SELECT id FROM manuscripts WHERE title = 'TEST MANUSCRIPT 001')
ORDER BY assigned_at DESC LIMIT 1;
-- Expected: assessment_status = 'NOT_STARTED' (reset for revision)
```

**Phase 13 Result:** ✅ PASS / ❌ FAIL

---

## REALTIME UPDATES SUMMARY

| Step | Realtime Update | Window | Expected Behavior | Result |
|------|-----------------|--------|-------------------|--------|
| 3 | Editor Accept | Coordinator | Assignment status INVITED→ACCEPTED | ✅/❌ |
| 4 | Evaluation Submit | Coordinator | Evaluation counter updates | ✅/❌ |
| 6 | Assign Reviewers | Coordinator | Reviewer cards appear 0/2 | ✅/❌ |
| 7 | Reviewer Accept | Coordinator | Reviewer status INVITED→ACCEPTED | ✅/❌ |
| 8 | Review Submit | Coordinator | Counter 0/2→1/2 WITHOUT refresh | ✅/❌ |
| 9 | Review Submit | Coordinator | Counter 1/2→2/2 WITHOUT refresh | ✅/❌ |
| 10 | Decision | Author | Status AWAITING_DECISION→REVISION_REQUESTED | ✅/❌ |
| 11 | Decision Deliver | Author | Decision letter appears in real-time | ✅/❌ |
| 12 | Revision Submit | Editor | Manuscript reappears in queue | ✅/❌ |

---

## FINAL VERIFICATION

After Phase 13, run:

```sql
-- Full workflow audit
SELECT 
  m.title, m.status, m.submitted_at,
  ea.recommendation, ea.assessment_status,
  (SELECT COUNT(*) FROM reviewer_assignments WHERE manuscript_id = m.id AND status = 'SUBMITTED') as reviews_completed,
  (SELECT COUNT(*) FROM manuscript_revisions WHERE manuscript_id = m.id) as revision_count
FROM manuscripts m
LEFT JOIN editor_assignments ea ON ea.manuscript_id = m.id
WHERE m.title = 'TEST MANUSCRIPT 001';
```

**Expected Final State:**
```
title: TEST MANUSCRIPT 001
status: EDITOR_REVIEW (or ACCEPTED if re-evaluation completed)
submitted_at: [initial submission time]
recommendation: MINOR_REVISION
assessment_status: SUBMITTED (or NOT_STARTED if re-evaluating)
reviews_completed: 2
revision_count: 1
```

---

## PASS/FAIL CRITERIA

### PASS: All 13 phases complete with ✅
- All database verifications show expected values
- All realtime updates happen without page refresh
- No console errors
- No database errors
- RLS properly enforces access

### FAIL: If ANY of these occur
- ❌ Any phase incomplete
- ❌ Realtime update requires manual refresh
- ❌ Database state incorrect
- ❌ Error messages in UI or console
- ❌ RLS allows unauthorized access
- ❌ Files fail to upload/persist
- ❌ Notifications fail to create

---

## TROUBLESHOOTING QUICK TIPS

**Counter doesn't update realtime?**
- Check browser console for JS errors
- Verify Supabase connection in dev tools
- Try manual refresh (should work but slower)
- Check Network tab for blocked requests

**Files don't upload?**
- Verify storage bucket policies
- Check file size limits
- Verify user_id matches author_id in files policy
- Check Supabase storage logs

**Notifications don't appear?**
- Verify workflow_notifications table has rows
- Check recipient_id matches logged-in user
- Check is_read_at column for read status
- Verify notification subscription in code

**RLS blocks access?**
- This is EXPECTED behavior
- Verify you're logged in as correct role
- Check SQL: `SELECT * FROM public.profiles WHERE id = auth.uid();`
- RLS is working correctly if properly blocking access

---

**Total Test Time:** ~90 minutes  
**Files Needed:** Any PDF (x2 for original + revision)  
**Expected Result:** PASS  
**Timeline to Production:** Immediate after PASS
