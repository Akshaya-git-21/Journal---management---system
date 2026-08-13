# STAGING DEPLOYMENT & REAL E2E TEST GUIDE

**Status:** READY FOR STAGING DEPLOYMENT  
**Commit:** `966abff` - "Complete editor evaluation and coordinator review package"  
**Test Date:** August 12, 2026  
**Goal:** Deploy P1 workflow to staging and execute complete real end-to-end test

---

## PART 1: STAGING DEPLOYMENT (YOUR RESPONSIBILITY)

### Prerequisites for Deployment
- [ ] Staging environment infrastructure ready
- [ ] Staging Supabase project configured (separate from production)
- [ ] Staging database schema migrated
- [ ] CI/CD pipeline access
- [ ] Deployment credentials ready

### Deployment Steps (Using Your Process)

Deploy commit `966abff` to staging using your standard deployment workflow:

```bash
# Option A: Via Git
git checkout main
git pull origin main
git checkout -b deploy/staging-p1-workflow
git deploy staging  # (or your deployment command)

# Option B: Via CI/CD Dashboard
1. Navigate to your CI/CD dashboard
2. Select branch: main
3. Select commit: 966abff
4. Select environment: staging
5. Click "Deploy"
6. Monitor deployment status
```

### Verify Staging Deployment
After deployment completes:

1. **Verify Frontend:**
   ```bash
   Visit: https://staging-your-domain.com
   Expected: Journal app loads without errors
   ```

2. **Verify Database Connection:**
   ```sql
   -- Connect to staging Supabase
   SELECT version();  -- Should return PostgreSQL version
   ```

3. **Verify Tables Exist:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('manuscripts', 'editor_assignments', 'reviewer_assignments', 
                      'workflow_notifications', 'manuscript_status_history', 'profiles');
   -- Expected: 6 rows
   ```

4. **Verify RPC Functions:**
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name IN ('respond_to_editor_assignment', 'submit_editor_assessment', 
                        'submit_editor_recommendation', 'assign_editor', 
                        'assign_reviewers', 'publishDecision');
   -- Expected: 6 rows
   ```

5. **Verify Supabase Storage:**
   - Navigate to Supabase Dashboard → Storage
   - Verify `manuscripts` bucket exists
   - Create test folder structure if needed

**Once verified, proceed to E2E testing.**

---

## PART 2: REAL E2E TEST EXECUTION (STAGING)

### Test Infrastructure Setup

#### Create Staging Test Accounts
Create 5 test accounts in staging Supabase:

```bash
# Via Supabase Dashboard → Authentication → Users
# Create:
1. Author: staging-author@test.com (password: StagingTestPass123!)
2. Coordinator: staging-coordinator@test.com (password: StagingTestPass123!)
3. Editor: staging-editor@test.com (password: StagingTestPass123!)
4. Reviewer1: staging-reviewer1@test.com (password: StagingTestPass123!)
5. Reviewer2: staging-reviewer2@test.com (password: StagingTestPass123!)
```

#### Activate Profiles
```sql
-- Ensure all profiles are ACTIVE
UPDATE profiles SET status='ACTIVE' WHERE email IN (
  'staging-author@test.com', 'staging-coordinator@test.com', 'staging-editor@test.com',
  'staging-reviewer1@test.com', 'staging-reviewer2@test.com'
);

-- Verify activation
SELECT email, role, status FROM profiles 
WHERE email IN ('staging-author@test.com', 'staging-coordinator@test.com', 
                'staging-editor@test.com', 'staging-reviewer1@test.com', 'staging-reviewer2@test.com');
-- All should show status='ACTIVE'
```

---

## COMPLETE E2E TEST CHECKLIST

### 🔵 PHASE 1: AUTHOR SUBMISSION

**Step 1.1: Author Logs In**
- [ ] Navigate to `https://staging-your-domain.com`
- [ ] Login with `staging-author@test.com` / `StagingTestPass123!`
- [ ] Verify "My Manuscripts" dashboard loads
- [ ] Expected: 0 active submissions

**Step 1.2: Create New Submission**
- [ ] Click "+ New Submission"
- [ ] Verify submission wizard loads (Step 1 of 9: Preparation)

**Step 1.3: Complete Step 1 - Preparation**
- [ ] Submission Language: Select "English (United States)"
- [ ] Primary Category: Select "Articles (Standard double-blind manuscript)"
- [ ] Check all 5 mandatory submission checklists
- [ ] Check "I have read and agree to the Author Instructions and Submission Guidelines"
- [ ] Check "Yes, I agree to the conditions outlined in the journal privacy statement"
- [ ] Check "I wish to represent myself as the Primary Contact for this submission block"
- [ ] Click "Save & Continue"
- [ ] ✅ EXPECTED: Step 2 loads (Manuscript Upload)

**Step 1.4: Step 2 - Manuscript Upload (CRITICAL)**
- [ ] **Title Page Upload:**
  - [ ] Click "browse files" or drag-and-drop
  - [ ] Upload any `.pdf` or `.docx` file
  - [ ] ✅ VERIFY: File appears in upload list
  - [ ] ✅ VERIFY: Shows filename and size

- [ ] **Blind Manuscript Upload:**
  - [ ] Click "browse files"
  - [ ] Upload `.pdf` or `.docx` file (must NOT contain author identifying info)
  - [ ] ✅ VERIFY: File appears in upload list
  - [ ] ✅ VERIFY: Shows "Upload successful"

- [ ] **Author Form Upload:**
  - [ ] Click "Download Form" to get template
  - [ ] Download and fill form with author info
  - [ ] Upload completed form
  - [ ] ✅ VERIFY: File appears in upload list

- [ ] **Database Verification - CRITICAL:**
  ```sql
  -- Query manuscript that was just created
  SELECT id, title, status, created_at FROM manuscripts 
  WHERE author_id = (SELECT id FROM profiles WHERE email='staging-author@test.com')
  ORDER BY created_at DESC LIMIT 1;
  
  -- Should show: status='DRAFT' (not yet submitted)
  -- Note the manuscript_id for later queries
  ```

  ```sql
  -- Verify files uploaded to Supabase Storage
  SELECT file_path, file_size, created_at FROM manuscript_files 
  WHERE manuscript_id = '[manuscript_id from above]'
  ORDER BY created_at;
  
  -- ✅ VERIFY: 3 rows (title page, manuscript, form)
  -- ✅ VERIFY: file_path format like: manuscripts/[id]/filename.pdf
  -- ✅ VERIFY: file_size > 0
  ```

  ```sql
  -- Verify files actually exist in Supabase Storage
  -- (Check via Supabase Dashboard → Storage → manuscripts bucket)
  -- ✅ VERIFY: See [manuscript_id] folder with 3 files inside
  ```

- [ ] Click "Save & Continue"
- [ ] ✅ EXPECTED: Step 3 loads (Metadata Entry)

**Step 1.5: Steps 3-8 - Complete Remaining Steps**
- [ ] **Step 3 - Metadata Entry:**
  - [ ] Title: "Real E2E Test Manuscript - Fuzzy Logic Cotton Yarn"
  - [ ] Abstract: "This manuscript demonstrates the complete P1 workflow with real file uploads and realtime updates."
  - [ ] Click "Save & Continue"

- [ ] **Step 4 - List of Authors:**
  - [ ] Add author: John Smith, john@example.com, Test University
  - [ ] Click "Save & Continue"

- [ ] **Step 5 - Additional Files:**
  - [ ] (Optional) Add supplementary files if desired
  - [ ] Click "Save & Continue"

- [ ] **Step 6 - Reviewers:**
  - [ ] Add suggested reviewers (optional)
  - [ ] Click "Save & Continue"

- [ ] **Step 7 - Publication Details:**
  - [ ] Select options as needed
  - [ ] Click "Save & Continue"

- [ ] **Step 8 - Confirmation:**
  - [ ] Review all information
  - [ ] Click "Submit Manuscript"
  - [ ] ✅ EXPECTED: Step 9 loads (Completion) with Manuscript ID

**Step 1.6: Manuscript Submitted**
- [ ] ✅ VERIFY: Completion screen shows Manuscript ID (e.g., "JMS-2026-XXXXXX")
- [ ] Note this ID for all future steps
- [ ] ✅ VERIFY: Status shows "SUBMITTED"

**Step 1.7: Database Verification After Submission**
```sql
-- Verify submission
SELECT id, status, submitted_at FROM manuscripts 
WHERE id = '[manuscript_id from above]';
-- ✅ EXPECTED: status='SUBMITTED', submitted_at=NOW()

-- Verify audit trail
SELECT action, status_before, status_after, created_at FROM manuscript_status_history 
WHERE manuscript_id = '[manuscript_id]'
ORDER BY created_at;
-- ✅ EXPECTED: Show DRAFT → SUBMITTED transition
```

---

### 🔵 PHASE 2: COORDINATOR RECEIVES SUBMISSION

**Step 2.1: Coordinator Logs In**
- [ ] Logout Author
- [ ] Login as `staging-coordinator@test.com` / `StagingTestPass123!`
- [ ] Navigate to "Manuscript Queue"
- [ ] ✅ VERIFY: Test manuscript appears in "Unassigned Queue"

**Step 2.2: Verify Manuscript in Queue**
```sql
-- Verify manuscript visible to coordinator
SELECT id, title, author_id, status FROM manuscripts 
WHERE id = '[manuscript_id]';
-- ✅ EXPECTED: Can query manuscript
```

---

### 🔵 PHASE 3: COORDINATOR ASSIGNS EDITOR

**Step 3.1: Assign Editor**
- [ ] Click on manuscript in queue
- [ ] Click "Assign Editor" or "Request Editor Review"
- [ ] Select: `staging-editor@test.com`
- [ ] Click "Assign"
- [ ] ✅ EXPECTED: Assignment successful message

**Step 3.2: Database Verification**
```sql
-- Verify editor_assignments created
SELECT id, editor_id, status, responded_at FROM editor_assignments 
WHERE manuscript_id = '[manuscript_id]';
-- ✅ EXPECTED: 1 row with status='INVITED', responded_at=NULL
```

```sql
-- Verify notification sent
SELECT type, created_at FROM workflow_notifications 
WHERE manuscript_id = '[manuscript_id]' AND type LIKE '%EDITOR%'
ORDER BY created_at DESC LIMIT 1;
-- ✅ EXPECTED: EDITOR_ASSIGNED or similar notification
```

```sql
-- Verify manuscript status changed
SELECT status FROM manuscripts WHERE id = '[manuscript_id]';
-- ✅ EXPECTED: status='EDITOR_REVIEW'
```

---

### 🔵 PHASE 4: EDITOR ACCEPTS (P1.1 TEST)

**Step 4.1: Editor Logs In**
- [ ] Logout Coordinator
- [ ] Login as `staging-editor@test.com` / `StagingTestPass123!`
- [ ] Navigate to "ACTION REQUIRED" section
- [ ] ✅ VERIFY: Test manuscript appears with INVITED status

**Step 4.2: P1.1 Modal Test - CRITICAL**
- [ ] Click on manuscript
- [ ] ✅ **VERIFY P1.1 MODAL APPEARS:**
  - [ ] Modal title: "Editorial Assignment"
  - [ ] Shows: "You have been invited to evaluate a manuscript"
  - [ ] Shows manuscript title
  - [ ] Shows author name
  - [ ] "✓ Accept Assignment" button present
  - [ ] "✕ Decline Assignment" button present
  - [ ] Decline message: "If you decline, the Coordinator will be notified and can assign another editor"

**Step 4.3: Editor Accepts**
- [ ] Click "✓ Accept Assignment"
- [ ] ✅ VERIFY: Modal shows loading spinner
- [ ] ✅ VERIFY: Modal closes
- [ ] ✅ EXPECTED: Evaluation form appears

**Step 4.4: Database Verification**
```sql
-- Verify status changed to ACCEPTED
SELECT status, responded_at FROM editor_assignments 
WHERE manuscript_id = '[manuscript_id]';
-- ✅ EXPECTED: status='ACCEPTED', responded_at=NOW()

-- Verify notification sent
SELECT type, created_at FROM workflow_notifications 
WHERE manuscript_id = '[manuscript_id]' AND type LIKE '%ACCEPT%'
ORDER BY created_at DESC LIMIT 1;
-- ✅ EXPECTED: EDITOR_ACCEPTED notification
```

---

### 🔵 PHASE 5: EDITOR COMPLETES EVALUATION (P1.2 TEST)

**Step 5.1: P1.2 Evaluation Form Test - CRITICAL**
- [ ] ✅ **VERIFY FORM APPEARS:**
  - [ ] "EVALUATION CRITERIA" section visible
  - [ ] All 7 score fields present (1-10 sliders):
    1. SCIENTIFIC MERIT
    2. NOVELTY & INNOVATION
    3. METHODOLOGY QUALITY
    4. VALIDITY OF RESULTS
    5. CLARITY & PRESENTATION
    6. ETHICAL STANDARDS
    7. (7th criterion)
  - [ ] "QUALITATIVE APPRAISALS" section with comment fields:
    - [ ] Strengths
    - [ ] Weaknesses
    - [ ] Mandatory Revisions
  - [ ] "SUGGEST PEER REFEREES" section

**Step 5.2: Fill Evaluation Scores**
- [ ] Scientific Merit: Click 8
- [ ] Novelty & Innovation: Click 7
- [ ] Methodology Quality: Click 8
- [ ] Validity of Results: Click 7
- [ ] Clarity & Presentation: Click 8
- [ ] Ethical Standards: Click 9
- [ ] (7th criterion): Click 8
- [ ] ✅ VERIFY: Each click shows selected state

**Step 5.3: Fill Comments**
- [ ] Strengths: "This is a well-structured paper with solid methodology and clear presentation."
- [ ] Weaknesses: "Some minor issues with the literature review and a few typos."
- [ ] Mandatory Revisions: "Please expand discussion of related work and fix identified typos."

**Step 5.4: Submit Evaluation**
- [ ] Click "Save Evaluation" or submit button
- [ ] ✅ VERIFY: Form shows loading state
- [ ] ✅ VERIFY: Message appears: "✓ Evaluation Submitted - Read-Only Mode"

**Step 5.5: P1.2 Read-Only Verification**
- [ ] ✅ **VERIFY FORM IS READ-ONLY:**
  - [ ] All score sliders disabled (greyed out)
  - [ ] All comment fields disabled
  - [ ] Cannot modify any field
  - [ ] Message clearly shows "Read-Only Mode"

**Step 5.6: Database Verification**
```sql
-- Verify all scores saved
SELECT scientific_merit, novelty_innovation, methodology_quality, 
       literature_adequacy, ethical_compliance, data_reliability, writing_quality,
       assessment_status, assessment_submitted_at
FROM editor_assignments 
WHERE manuscript_id = '[manuscript_id]';

-- ✅ EXPECTED:
-- - All 7 score fields = 7, 8, 8, 7, 8, 9, 8 (in some order)
-- - assessment_status = 'SUBMITTED'
-- - assessment_submitted_at = NOW()
```

```sql
-- Verify comments saved
SELECT strengths, weaknesses, mandatory_revisions FROM editor_assignments 
WHERE manuscript_id = '[manuscript_id]';
-- ✅ EXPECTED: All comment fields populated
```

---

### 🔵 PHASE 6: EDITOR MAKES DECISION (P1.2 3-DECISION PANEL)

**Step 6.1: P1.2 3-Decision Panel - CRITICAL**
- [ ] ✅ **VERIFY 4 DECISION BUTTONS APPEAR:**
  - [ ] Button 1: "✓ Accept Manuscript"
  - [ ] Button 2: "◊ Request Minor Revision"
  - [ ] Button 3: "◆ Request Major Revision"
  - [ ] Button 4: "✕ Reject"

**Step 6.2: Editor Selects Decision**
- [ ] Click "✓ Accept Manuscript"
- [ ] ✅ VERIFY: Button shows loading state
- [ ] ✅ VERIFY: Decision submitted

**Step 6.3: Database Verification**
```sql
-- Verify recommendation saved
SELECT recommendation, recommendation_submitted_at FROM editor_assignments 
WHERE manuscript_id = '[manuscript_id]';
-- ✅ EXPECTED: recommendation='ACCEPT', recommendation_submitted_at=NOW()

-- Verify notification sent
SELECT type FROM workflow_notifications 
WHERE manuscript_id = '[manuscript_id]' AND type LIKE '%RECOMMENDATION%'
ORDER BY created_at DESC LIMIT 1;
-- ✅ EXPECTED: EDITOR_RECOMMENDATION_READY or similar
```

---

### 🔵 PHASE 7: COORDINATOR RECEIVES REALTIME UPDATE (P1.3 TEST)

**Step 7.1: Coordinator Receives Update**
- [ ] Logout Editor
- [ ] Go back to Coordinator browser (or login again)
- [ ] **WITHOUT REFRESHING THE PAGE:**
- [ ] ✅ **VERIFY P1.3 REALTIME UPDATE:**
  - [ ] Manuscript status updated to show editor's recommendation
  - [ ] Update appeared within 2-3 seconds of editor submitting
  - [ ] No manual refresh needed

**Step 7.2: Verify Realtime Subscription Working**
```sql
-- Confirm subscription would pick up changes
SELECT created_at FROM workflow_notifications 
WHERE manuscript_id = '[manuscript_id]' 
ORDER BY created_at DESC LIMIT 1;
-- ✅ EXPECTED: Very recent timestamp (seconds ago)
```

---

### 🔵 PHASE 8: COORDINATOR ASSIGNS REVIEWERS

**Step 8.1: Assign Reviewers**
- [ ] Click on manuscript
- [ ] Click "Assign Reviewers"
- [ ] Add Reviewer 1: `staging-reviewer1@test.com`
- [ ] Add Reviewer 2: `staging-reviewer2@test.com`
- [ ] Click "Assign"
- [ ] ✅ EXPECTED: "Assignment successful" message

**Step 8.2: Database Verification**
```sql
-- Verify reviewer_assignments created
SELECT reviewer_id, status FROM reviewer_assignments 
WHERE manuscript_id = '[manuscript_id]'
ORDER BY created_at;
-- ✅ EXPECTED: 2 rows, both status='INVITED'

-- Verify notifications sent
SELECT type FROM workflow_notifications 
WHERE manuscript_id = '[manuscript_id]' AND type LIKE '%REVIEWER%'
ORDER BY created_at DESC LIMIT 2;
-- ✅ EXPECTED: 2 REVIEWER_ASSIGNED notifications
```

**Step 8.3: P1.3 Counter Verification**
- [ ] ✅ **VERIFY: Counter shows "0/2"** (0 reviews submitted out of 2)

```sql
-- Verify counter query works
SELECT COUNT(CASE WHEN status='SUBMITTED' THEN 1 END) as submitted,
       COUNT(CASE WHEN status IN ('INVITED','ACCEPTED') THEN 1 END) as pending
FROM reviewer_assignments 
WHERE manuscript_id = '[manuscript_id]';
-- ✅ EXPECTED: submitted=0, pending=2
```

---

### 🔵 PHASE 9: REVIEWER 1 ACCEPTS & SUBMITS REVIEW

**Step 9.1: Reviewer 1 Logs In**
- [ ] Logout Coordinator
- [ ] Login as `staging-reviewer1@test.com` / `StagingTestPass123!`
- [ ] Navigate to "ACTION REQUIRED"
- [ ] ✅ VERIFY: Test manuscript appears with INVITED status

**Step 9.2: Reviewer 1 Accepts**
- [ ] Click on manuscript
- [ ] ✅ VERIFY: Accept/Decline modal appears (similar to P1.1)
- [ ] Click "✓ Accept"
- [ ] ✅ VERIFY: Review form appears

**Step 9.3: Reviewer 1 Completes Review**
- [ ] Fill all 7 score fields (suggest: 7, 8, 7, 8, 7, 8, 7)
- [ ] Add review comments
- [ ] Click "Submit Review"
- [ ] ✅ VERIFY: Form becomes read-only

**Step 9.4: Database Verification**
```sql
-- Verify reviewer1 submission
SELECT reviewer_id, status, submitted_at FROM reviewer_assignments 
WHERE manuscript_id = '[manuscript_id]' 
AND reviewer_id = (SELECT id FROM profiles WHERE email='staging-reviewer1@test.com');
-- ✅ EXPECTED: status='SUBMITTED', submitted_at=NOW()
```

**Step 9.5: P1.3 REALTIME COUNTER UPDATE - CRITICAL**
- [ ] **WITHOUT REFRESHING**, check if counter in Coordinator's browser updates
- [ ] ✅ **VERIFY: Counter automatically changed to "1/2"** within 2-3 seconds
- [ ] ✅ This tests P1.3 realtime subscription functionality

---

### 🔵 PHASE 10: REVIEWER 2 ACCEPTS & SUBMITS REVIEW

**Step 10.1: Reviewer 2 Logs In**
- [ ] Logout Reviewer 1
- [ ] Login as `staging-reviewer2@test.com` / `StagingTestPass123!`
- [ ] Navigate to "ACTION REQUIRED"
- [ ] Click on manuscript

**Step 10.2: Reviewer 2 Accepts & Submits**
- [ ] Click "✓ Accept" (P1.1 modal)
- [ ] Fill review form with scores (suggest: 8, 7, 8, 7, 8, 7, 8)
- [ ] Add comments
- [ ] Click "Submit Review"

**Step 10.3: Database Verification**
```sql
-- Verify reviewer2 submission
SELECT COUNT(CASE WHEN status='SUBMITTED' THEN 1 END) as submitted_count
FROM reviewer_assignments 
WHERE manuscript_id = '[manuscript_id]';
-- ✅ EXPECTED: submitted_count=2 (both reviewers submitted)
```

**Step 10.4: P1.3 REALTIME COUNTER UPDATE - CRITICAL**
- [ ] **WITHOUT REFRESHING**, verify Coordinator's counter updates to "2/2"
- [ ] ✅ This is the FINAL realtime update test for P1.3
- [ ] ✅ Counter should show 2/2 without any page refresh

---

### 🔵 PHASE 11: COORDINATOR REVIEWS COMPLETE PACKAGE (P1.3)

**Step 11.1: Coordinator Reviews P1.3 Package**
- [ ] Logout Reviewer 2, login as Coordinator
- [ ] Navigate to manuscript
- [ ] Click "Review Package" or "Complete Review"
- [ ] ✅ **VERIFY P1.3 REVIEW PACKAGE DISPLAYS:**

**Tab 1 - Summary:**
- [ ] ✅ Shows Editor assessment with all 7 scores
- [ ] ✅ Shows Editor recommendation: "ACCEPT"
- [ ] ✅ Shows "2/2" review counter
- [ ] ✅ Shows submission progress

**Tab 2 - Reviewers:**
- [ ] ✅ **Reviewer 1 Report:**
  - [ ] Name and status visible
  - [ ] Submission timestamp shown
  - [ ] All 7 review scores displayed
  - [ ] Full comments visible (not truncated)
  - [ ] Recommendation shown

- [ ] ✅ **Reviewer 2 Report:**
  - [ ] Name and status visible
  - [ ] Submission timestamp shown
  - [ ] All 7 review scores displayed
  - [ ] Full comments visible (not truncated)
  - [ ] Recommendation shown

**Tab 3 - Decision:**
- [ ] 4 decision buttons present:
  - [ ] Accept
  - [ ] Minor Revision
  - [ ] Major Revision
  - [ ] Reject
- [ ] Decision letter text area present

**Step 11.2: Database Verification**
```sql
-- Verify all reviewer data accessible
SELECT reviewer_id, 
       scientific_merit, novelty_innovation, methodology_quality,
       literature_adequacy, ethical_compliance, data_reliability, writing_quality,
       submitted_at
FROM reviewer_assignments 
WHERE manuscript_id = '[manuscript_id]'
ORDER BY submitted_at;
-- ✅ EXPECTED: 2 rows with all 7 scores for each reviewer, submitted_at timestamps
```

---

### 🔵 PHASE 12: COORDINATOR MAKES FINAL DECISION

**Step 12.1: Select Decision**
- [ ] Click "Decision" tab
- [ ] Select: "Accept"
- [ ] (Optional) Write decision letter: "Congratulations! Your manuscript has been accepted for publication."
- [ ] Click "Publish Decision" or "Send to Author"
- [ ] ✅ EXPECTED: Confirmation modal appears

**Step 12.2: Confirm Decision**
- [ ] Click "Confirm" or "Yes, publish"
- [ ] ✅ EXPECTED: "Decision published successfully" message

**Step 12.3: Database Verification**
```sql
-- Verify final status
SELECT status FROM manuscripts WHERE id = '[manuscript_id]';
-- ✅ EXPECTED: status='ACCEPTED'

-- Verify decision recorded
SELECT type FROM workflow_notifications 
WHERE manuscript_id = '[manuscript_id]' AND type='DECISION_PUBLISHED'
ORDER BY created_at DESC LIMIT 1;
-- ✅ EXPECTED: DECISION_PUBLISHED notification

-- Verify audit trail
SELECT action, status_before, status_after FROM manuscript_status_history 
WHERE manuscript_id = '[manuscript_id]'
ORDER BY created_at;
-- ✅ EXPECTED: Complete trail from SUBMITTED → ACCEPTED
```

---

### 🔵 PHASE 13: AUTHOR RECEIVES DECISION

**Step 13.1: Author Sees Decision**
- [ ] Logout Coordinator
- [ ] Login as `staging-author@test.com` / `StagingTestPass123!`
- [ ] Navigate to "Accepted" or "My Submissions"
- [ ] ✅ VERIFY: Test manuscript shows status "ACCEPTED"
- [ ] ✅ VERIFY: Can view decision letter
- [ ] ✅ VERIFY: Sees notification

---

## FINAL VERIFICATION

### Complete Audit Trail Check
```sql
SELECT action, status_before, status_after, created_at 
FROM manuscript_status_history 
WHERE manuscript_id = '[manuscript_id]'
ORDER BY created_at;

-- ✅ EXPECTED COMPLETE SEQUENCE:
-- 1. DRAFT → SUBMITTED (Author submitted)
-- 2. SUBMITTED → EDITOR_REVIEW (Coordinator assigned editor)
-- 3. EDITOR_REVIEW → UNDER_REVIEW (Coordinator assigned reviewers)
-- 4. UNDER_REVIEW → AWAITING_DECISION (Both reviewers submitted)
-- 5. AWAITING_DECISION → ACCEPTED (Coordinator made decision)
```

### RLS Enforcement Check
```sql
-- Verify editor cannot see reviewer reports
-- (Login as Editor, query reviewer_assignments)
-- ✅ EXPECTED: Should return 0 rows (RLS blocks access)

-- Verify reviewer1 cannot see reviewer2 reports
-- (Login as Reviewer 1, query OTHER reviewer's reports)
-- ✅ EXPECTED: Should return 0 rows (RLS blocks access)

-- Verify author cannot see assignments
-- (Login as Author, query editor_assignments)
-- ✅ EXPECTED: Should return 0 rows (RLS blocks access)
```

---

## TEST RESULT REPORTING

### For Each Phase, Report:

#### ✅ PASS Example:
```
✅ PHASE 4: EDITOR ACCEPTS (P1.1)
- Modal appeared with correct title and content
- Accept button functional
- Database: editor_assignments.status changed to ACCEPTED
- Database: Notification created for coordinator
- No errors in console
```

#### ❌ FAIL Example:
```
❌ PHASE 9: REVIEWER 1 REALTIME COUNTER UPDATE (P1.3)
- Counter did NOT update automatically
- Required manual page refresh to see "1/2"
- Expected: Update within 2-3 seconds without refresh
- Actual: No change until refresh
- Issue: Realtime subscription may not be working for reviewer_assignments
```

#### ⚠️ NOT TESTED Example:
```
⚠️ PHASE 13: AUTHOR NOTIFICATION
- Email notification not tested (email not configured in staging)
- In-app notification verified
- Cannot verify email delivery without email service
```

---

## SUCCESS CRITERIA FOR PRODUCTION APPROVAL

### 🟢 PRODUCTION READY IF ALL BELOW ARE TRUE:

#### 1. File Upload Works
- ✅ Files uploaded to Supabase Storage
- ✅ Files appear in manuscript_files table
- ✅ Files are link to correct manuscript_id
- ✅ Form submission succeeds after upload

#### 2. P1.1 Accept/Decline Works
- ✅ Modal appears when assignment is INVITED
- ✅ Accept updates database to status='ACCEPTED'
- ✅ Decline updates database to status='DECLINED'
- ✅ Coordinator receives notification

#### 3. P1.2 Evaluation Works
- ✅ All 7 score fields save to database
- ✅ Comments save to database
- ✅ Form becomes read-only after submission
- ✅ Read-only message displays

#### 4. P1.2 3-Decision Panel Works
- ✅ All 4 decision buttons functional
- ✅ Selected decision saves to database
- ✅ Coordinator receives notification

#### 5. P1.3 Realtime Updates Work
- ✅ Coordinator sees editor update WITHOUT refresh
- ✅ Coordinator sees 0/2 → 1/2 → 2/2 counter WITHOUT refresh
- ✅ Updates occur within 2-3 seconds
- ✅ Subscription actively monitoring changes

#### 6. Complete Workflow
- ✅ Manuscript status transitions: SUBMITTED → EDITOR_REVIEW → UNDER_REVIEW → AWAITING_DECISION → ACCEPTED
- ✅ All notifications delivered
- ✅ All timestamps accurate
- ✅ Audit trail complete
- ✅ RLS properly enforced

#### 7. No Errors
- ✅ No browser console errors
- ✅ No database constraint violations
- ✅ No RLS permission errors
- ✅ No application crashes

---

### 🔴 PRODUCTION BLOCKED IF ANY:

- ❌ File upload fails
- ❌ P1.1 modal doesn't appear
- ❌ P1.2 scores don't save
- ❌ P1.2 read-only state doesn't work
- ❌ P1.2 3-decision buttons don't work
- ❌ P1.3 realtime updates require page refresh
- ❌ Counter doesn't update live
- ❌ Database operation fails
- ❌ RLS violation occurs
- ❌ Any workflow step fails
- ❌ Any error in console/logs

---

## FINAL REPORT FORMAT

After completing all phases, provide report:

```
═══════════════════════════════════════════════════════════════
P1 WORKFLOW END-TO-END TEST - STAGING RESULTS
═══════════════════════════════════════════════════════════════

PHASE 1: Author Submission          ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 2: Coordinator Receives       ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 3: Coordinator Assigns Editor ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 4: Editor Accepts (P1.1)      ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 5: Editor Evaluation (P1.2)   ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 6: Editor Decision (P1.2)     ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 7: Coordinator Realtime (P1.3) ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 8: Assign Reviewers           ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 9: Reviewer 1 Submits         ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 10: Reviewer 2 Submits        ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 11: Review Package (P1.3)     ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 12: Final Decision            ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
PHASE 13: Author Receives Decision  ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED

═══════════════════════════════════════════════════════════════
OVERALL STATUS
═══════════════════════════════════════════════════════════════

Database Verification:  ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
RLS Enforcement:        ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
Realtime Updates:       ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
Audit Trail:            ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED
No Errors:              ✅ PASS / ❌ FAIL / ⚠️ NOT TESTED

FINAL VERDICT:
✅ PRODUCTION READY
❌ PRODUCTION BLOCKED - Issues found [list]
⚠️ PARTIAL - [describe what works/what doesn't]

═══════════════════════════════════════════════════════════════
ISSUES FOUND (if any):
═══════════════════════════════════════════════════════════════
[List each failed phase with root cause and fix applied]

═══════════════════════════════════════════════════════════════
FIXES APPLIED (if any):
═══════════════════════════════════════════════════════════════
[List each fix and retest result]

═══════════════════════════════════════════════════════════════
```

---

## NEXT STEPS

### If ✅ ALL PHASES PASS:
1. Mark system as "STAGING VALIDATED"
2. Schedule production deployment
3. Deploy commit 966abff to production
4. Monitor production for issues

### If ❌ ANY PHASE FAILS:
1. Document failure details
2. Identify root cause
3. Fix the issue in code
4. Create new commit
5. Redeploy to staging
6. Retest failed phase(s)
7. Repeat until all phases pass

### If ⚠️ PARTIAL SUCCESS:
1. Verify which parts work
2. Document known limitations
3. Decide: deploy with known limitations or wait for fixes

---

**Ready for staging deployment and real E2E testing.**

