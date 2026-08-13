# STAGING DEPLOYMENT GUIDE - P1 WORKFLOW

**Status:** ⏳ CODE COMMITTED, READY FOR STAGING  
**Last Commit:** "Complete editor evaluation and coordinator review package"  
**IMPORTANT:** ⚠️ NOT YET PRODUCTION-READY - Real-user E2E testing required in staging

---

## PRE-STAGING CHECKLIST

- [x] Code implemented (P1.1, P1.2, P1.3)
- [x] TypeScript build succeeds
- [x] No mock or hardcoded data
- [x] RLS not weakened or bypassed
- [x] All changes committed
- [ ] **Staging deployment** ← Next step
- [ ] **Real-user E2E testing** ← After staging is live
- [ ] **Production deployment** ← After staging tests pass

---

## STAGING DEPLOYMENT STEPS

### 1. Deploy to Staging Environment
```bash
# In your deployment pipeline/dashboard:
# 1. Select branch: main (commit: 966abff)
# 2. Select environment: staging
# 3. Deploy
# 4. Wait for build & deployment to complete
# 5. Verify staging URL is accessible
```

### 2. Verify Database in Staging
```sql
-- Connect to staging Supabase database
-- Verify all required tables exist:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('manuscripts', 'editor_assignments', 'reviewer_assignments', 
                   'workflow_notifications', 'manuscript_status_history', 'profiles');

-- Expected: 6 rows returned
```

### 3. Verify RPC Functions in Staging
```sql
-- Check all P1 workflow RPC functions exist:
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('respond_to_editor_assignment', 'submit_editor_assessment', 
                     'submit_editor_recommendation', 'assign_editor', 
                     'assign_reviewers', 'publishDecision');

-- Expected: 6 rows returned
```

### 4. Create Staging Test Accounts
```bash
# Use Supabase Dashboard → Authentication → Users
# OR use admin API:

# Create 5 test accounts:
1. Author: staging-author@test.com (Password: StagingTestPass123!)
2. Coordinator: staging-coordinator@test.com (Password: StagingTestPass123!)
3. Editor: staging-editor@test.com (Password: StagingTestPass123!)
4. Reviewer1: staging-reviewer1@test.com (Password: StagingTestPass123!)
5. Reviewer2: staging-reviewer2@test.com (Password: StagingTestPass123!)

# Activate all profiles:
UPDATE profiles SET status='ACTIVE' WHERE email IN (
  'staging-author@test.com', 'staging-coordinator@test.com', 'staging-editor@test.com',
  'staging-reviewer1@test.com', 'staging-reviewer2@test.com'
);
```

### 5. Verify Staging Frontend
```bash
# Open staging URL in browser
# Verify:
- [ ] Login page loads
- [ ] Can login with test accounts
- [ ] No console errors (F12)
- [ ] Realtime subscriptions active (check network tab)
```

---

## STAGING END-TO-END TEST PROCEDURE

### CRITICAL: Real-User Workflow Testing
**This is NOT a feature demo. This is a full validation of:**
- Database state at each step
- RLS policy enforcement
- Realtime updates without page refresh
- Status transitions
- Audit trail accuracy
- Notification delivery

### Test Flow (90 minutes)

#### Phase 1: Author Submits Manuscript (10 min)
1. **Login as Author** → staging-author@test.com
2. **Create new manuscript:**
   - Title: "Staging Test Manuscript - [timestamp]"
   - Abstract: "This is a staging test manuscript"
   - Upload a PDF file
3. **Submit manuscript**
4. **Verify database:**
   ```sql
   SELECT id, title, status, created_at FROM manuscripts 
   WHERE author_id = (SELECT id FROM profiles WHERE email='staging-author@test.com')
   ORDER BY created_at DESC LIMIT 1;
   -- Expected: status='SUBMITTED'
   ```
5. **Note manuscript ID** (e.g., `jms-2026-xxx`)

#### Phase 2: Coordinator Assigns Editor (10 min)
1. **Logout Author, Login as Coordinator** → staging-coordinator@test.com
2. **Navigate to Manuscript Queue**
3. **Find the test manuscript** (status='SUBMITTED')
4. **Assign Editor** to manuscript:
   - Select Editor: staging-editor@test.com
   - Submit assignment
5. **Verify database:**
   ```sql
   SELECT id, status, responded_at FROM editor_assignments 
   WHERE manuscript_id='jms-2026-xxx' LIMIT 1;
   -- Expected: status='INVITED', responded_at=NULL
   ```
6. **Check workflow_notifications:**
   ```sql
   SELECT type, created_at FROM workflow_notifications 
   WHERE manuscript_id='jms-2026-xxx' 
   ORDER BY created_at DESC LIMIT 3;
   -- Expected: MANUSCRIPT_ASSIGNED notification for editor
   ```

#### Phase 3: Editor Sees Invitation (5 min)
1. **Logout Coordinator, Login as Editor** → staging-editor@test.com
2. **Navigate to "ACTION REQUIRED" section**
3. **Verify test manuscript appears** with INVITED status
4. **Verify database reflects:**
   ```sql
   SELECT assignment_id, status FROM editor_assignments 
   WHERE editor_id=(SELECT id FROM profiles WHERE email='staging-editor@test.com') 
   LIMIT 1;
   ```

#### Phase 4: P1.1 - Editor Accept (P1.1 TEST) (15 min)
**This is the P1.1 critical test. Verify modal and database update.**

1. **Click manuscript** in ACTION REQUIRED section
2. **VERIFY MODAL APPEARS:**
   - [ ] "Editorial Assignment" modal title visible
   - [ ] Manuscript title shown
   - [ ] "✓ Accept Assignment" button visible
   - [ ] "✕ Decline Assignment" button visible
3. **Click "✓ Accept Assignment"**
4. **Verify loading state** (spinner shows, buttons disabled)
5. **Wait for response** (~2 seconds)
6. **Verify modal closes**
7. **Verify database updated:**
   ```sql
   SELECT status, responded_at FROM editor_assignments 
   WHERE manuscript_id='jms-2026-xxx' LIMIT 1;
   -- Expected: status='ACCEPTED', responded_at=CURRENT_TIMESTAMP
   ```
8. **Check notification sent to coordinator:**
   ```sql
   SELECT type, created_at FROM workflow_notifications 
   WHERE manuscript_id='jms-2026-xxx' AND type='EDITOR_ACCEPTED' LIMIT 1;
   -- Expected: EDITOR_ACCEPTED notification exists
   ```

**🎯 P1.1 SUCCESS CRITERIA:**
- ✅ Modal appeared when assignment was INVITED
- ✅ Database updated: status → ACCEPTED
- ✅ Notification created for coordinator
- ✅ Transition was instantaneous or <2 seconds

#### Phase 5: P1.2 - Editor Evaluation (P1.2 TEST) (30 min)
**This is the P1.2 critical test. Verify form saves all scores.**

1. **After clicking Accept** → Evaluation form should appear
2. **Verify form displays:**
   - [ ] "EVALUATION CRITERIA" heading
   - [ ] All 7 score fields:
     1. SCIENTIFIC MERIT (1-10)
     2. NOVELTY & INNOVATION (1-10)
     3. METHODOLOGY QUALITY (1-10)
     4. VALIDITY OF RESULTS (1-10)
     5. CLARITY & PRESENTATION (1-10)
     6. ETHICAL STANDARDS (1-10)
     7. (7th criterion - verify visible)
   - [ ] "QUALITATIVE APPRAISALS" section with comment fields
   - [ ] "SUGGEST PEER REFEREES" section (add 2 reviewers)

3. **Fill evaluation form:**
   - Score 1: 8 (SCIENTIFIC MERIT)
   - Score 2: 7 (NOVELTY & INNOVATION)
   - Score 3: 8 (METHODOLOGY QUALITY)
   - Score 4: 7 (VALIDITY OF RESULTS)
   - Score 5: 8 (CLARITY & PRESENTATION)
   - Score 6: 9 (ETHICAL STANDARDS)
   - Score 7: 8
   - Strengths: "This is a strong paper with solid methodology"
   - Weaknesses: "Some minor presentation issues"
   - Mandatory Revisions: "Please clarify section 3.2"
   - Add 2 suggested reviewers (name, email, expertise)

4. **Click "Accept Manuscript"** (3-decision button)
5. **Verify decision save** and form submission

6. **Verify database - Scores saved:**
   ```sql
   SELECT scientific_merit, novelty_innovation, methodology_quality, 
          literature_adequacy, ethical_compliance, data_reliability, writing_quality,
          assessment_status, assessment_submitted_at, recommendation
   FROM editor_assignments 
   WHERE manuscript_id='jms-2026-xxx' LIMIT 1;
   -- Expected: All scores populated, assessment_status='SUBMITTED', 
   --           recommendation='ACCEPT', timestamps set
   ```

7. **Verify notification sent to coordinator:**
   ```sql
   SELECT type FROM workflow_notifications 
   WHERE manuscript_id='jms-2026-xxx' 
   AND type IN ('EDITOR_ASSESSMENT_SUBMITTED', 'EDITOR_RECOMMENDATION_READY');
   -- Expected: Both notifications exist
   ```

8. **Verify form is READ-ONLY after submission:**
   - [ ] "✓ Evaluation Submitted - Read-Only Mode" message visible
   - [ ] All fields disabled (cannot click or type)
   - [ ] Buttons disabled
   - [ ] Refresh page, verify form still read-only

**🎯 P1.2 SUCCESS CRITERIA:**
- ✅ Form displayed all 7 score fields
- ✅ All scores saved to database
- ✅ Comments saved correctly
- ✅ Decision (ACCEPT/Minor/Major/Reject) saved
- ✅ Read-only state after submission
- ✅ Notifications created for coordinator
- ✅ Data persists after page refresh

#### Phase 6: P1.3 - Coordinator Sees Real-Time Update (P1.3 TEST) (15 min)
**This is the P1.3 critical test. Verify realtime counter and review package.**

1. **Logout Editor, Login as Coordinator** → staging-coordinator@test.com
2. **Navigate to manuscript details page** for test manuscript
3. **Verify editor assessment visible:**
   - [ ] All 7 editor scores display
   - [ ] Editor recommendation shows: "ACCEPT"
   - [ ] Editor comments visible

4. **DO NOT refresh the page** - verify realtime update triggered automatically:
   - [ ] Page data updated within 2 seconds of editor submitting
   - [ ] No manual refresh needed
   - [ ] Browser console shows no errors

5. **Assign 2 Reviewers:**
   - Reviewer 1: staging-reviewer1@test.com
   - Reviewer 2: staging-reviewer2@test.com
   - Submit assignments

6. **Verify reviewer assignments created:**
   ```sql
   SELECT id, reviewer_id, status FROM reviewer_assignments 
   WHERE manuscript_id='jms-2026-xxx' 
   ORDER BY created_at;
   -- Expected: 2 rows, both status='INVITED'
   ```

7. **Verify review progress counter shows 0/2:**
   - [ ] Counter visible: "0/2 reviews submitted"
   - [ ] Both reviewers in INVITED status

#### Phase 7: Reviewers Submit Reports (15 min)
1. **Logout Coordinator**
2. **Login as Reviewer 1** → staging-reviewer1@test.com
3. **Navigate to assigned manuscript**
4. **View assignment** (should show INVITED status)
5. **Click Accept** (P1.1-style modal or button)
6. **Fill review form:**
   - Add scores for all 7 criteria
   - Add review comments
   - Submit review

7. **Verify database - Reviewer 1 report:**
   ```sql
   SELECT status, scientific_merit, submitted_at FROM reviewer_assignments 
   WHERE reviewer_id=(SELECT id FROM profiles WHERE email='staging-reviewer1@test.com')
   AND manuscript_id='jms-2026-xxx' LIMIT 1;
   -- Expected: status='SUBMITTED', all scores populated, submitted_at set
   ```

8. **WITHOUT REFRESHING COORDINATOR PAGE:**
   - Go back to coordinator (if still logged in via second window)
   - Verify counter automatically updated to "1/2"
   - Verify Reviewer 1 report appears
   - Verify realtime notification shows

9. **Repeat for Reviewer 2** → staging-reviewer2@test.com
   - Accept assignment
   - Submit review
   - Verify counter updates to "2/2" in real-time

**🎯 P1.3 REALTIME SUCCESS CRITERIA:**
- ✅ 0/2 counter visible initially
- ✅ Counter auto-updates to 1/2 when Reviewer 1 submits (no refresh)
- ✅ Counter auto-updates to 2/2 when Reviewer 2 submits (no refresh)
- ✅ Updates occur within 2-3 seconds of reviewer submission
- ✅ All 7 reviewer scores display correctly
- ✅ Reviewer comments visible
- ✅ Submission timestamps accurate

#### Phase 8: Coordinator Makes Final Decision (10 min)
1. **Login as Coordinator** (or stay logged in)
2. **Navigate to test manuscript review package**
3. **Verify Review Package displays:**
   - [ ] Summary tab: Editor assessment + recommendation
   - [ ] Reviewers tab: Both reviewer reports with all 7 scores
   - [ ] Decision tab: 4 decision options

4. **Click "DECISION" tab**
5. **Select decision:** "Accept" (or other option)
6. **Write decision letter** to author (optional comment)
7. **Click "Publish Decision"**
8. **Confirm in modal** when prompted

9. **Verify database - Final decision:**
   ```sql
   SELECT status FROM manuscripts WHERE id='jms-2026-xxx' LIMIT 1;
   -- Expected: status='ACCEPTED' (or REJECTED/REVISION_REQUESTED based on decision)
   ```

10. **Verify author notification:**
    ```sql
    SELECT type FROM workflow_notifications 
    WHERE manuscript_id='jms-2026-xxx' AND type='DECISION_PUBLISHED' LIMIT 1;
    -- Expected: DECISION_PUBLISHED notification for author
    ```

#### Phase 9: Author Sees Decision (5 min)
1. **Logout Coordinator, Login as Author**
2. **Navigate to submissions**
3. **Verify manuscript status updated** to reflect decision
4. **Verify author can see decision letter**
5. **Verify notification badge shows** new decision

**🎯 E2E WORKFLOW SUCCESS CRITERIA:**
- ✅ Author → Coordinator → Editor (Accept/Decline)
- ✅ Editor → Evaluation form → 3-Decision (P1.1, P1.2 working)
- ✅ Coordinator → Realtime notification (P1.3 working)
- ✅ Coordinator → 2 Reviewers assigned
- ✅ Reviewers → Reports submitted
- ✅ Coordinator → Real-time 0/2 → 1/2 → 2/2 update
- ✅ Coordinator → Review package displays correctly
- ✅ Coordinator → Final decision publishes
- ✅ Author → Receives decision notification
- ✅ **All status transitions logged** in manuscript_status_history
- ✅ **All timestamps accurate**
- ✅ **RLS enforced** (editors can't see reviewer reports, etc.)
- ✅ **No database errors or constraint violations**

---

## VERIFICATION QUERIES FOR STAGING

### Complete Workflow Status Check
```sql
-- Check manuscript journey:
SELECT 
  m.id, m.title, m.status, m.created_at,
  ea.status as editor_status, ea.assessment_status, ea.recommendation,
  ra1.status as reviewer1_status, ra2.status as reviewer2_status,
  COUNT(DISTINCT wn.id) as notification_count
FROM manuscripts m
LEFT JOIN editor_assignments ea ON m.id = ea.manuscript_id
LEFT JOIN reviewer_assignments ra1 ON m.id = ra1.manuscript_id AND ra1.reviewer_id=(SELECT id FROM profiles WHERE email='staging-reviewer1@test.com')
LEFT JOIN reviewer_assignments ra2 ON m.id = ra2.manuscript_id AND ra2.reviewer_id=(SELECT id FROM profiles WHERE email='staging-reviewer2@test.com')
LEFT JOIN workflow_notifications wn ON m.id = wn.manuscript_id
WHERE m.author_id = (SELECT id FROM profiles WHERE email='staging-author@test.com')
GROUP BY m.id, m.title, m.status, m.created_at, ea.status, ea.assessment_status, ea.recommendation, ra1.status, ra2.status;
```

### Audit Trail Verification
```sql
SELECT action, status_before, status_after, created_by, created_at 
FROM manuscript_status_history 
WHERE manuscript_id='jms-2026-xxx'
ORDER BY created_at;
-- Expected: Complete history of status transitions with timestamps
```

### RLS Enforcement Check
```sql
-- Verify Editor cannot see reviewer reports:
-- (Login as editor in staging DB session)
SELECT COUNT(*) FROM reviewer_assignments 
WHERE manuscript_id='jms-2026-xxx';
-- Expected: 0 rows (RLS hides reviewer data from editor)

-- Verify Reviewer cannot see other reviewer's report:
-- (Login as reviewer1 in staging DB session)
SELECT COUNT(*) FROM reviewer_assignments 
WHERE manuscript_id='jms-2026-xxx' 
AND reviewer_id != (SELECT id FROM profiles WHERE email='staging-reviewer1@test.com');
-- Expected: 0 rows (RLS hides other reviewer data)
```

---

## TROUBLESHOOTING COMMON STAGING ISSUES

### Issue: Modal Doesn't Appear
**Check:**
1. Assignment status is INVITED: `SELECT status FROM editor_assignments WHERE ...`
2. Browser console has no errors (F12)
3. Component mounted: Check Network tab for EditorWorkspace load
4. Hard refresh page: Ctrl+Shift+R

### Issue: Evaluation Form Doesn't Save
**Check:**
1. Submit button clicked (check for loading spinner)
2. Network tab (F12) shows RPC call to `submit_editor_assessment`
3. No error messages in browser console
4. Database: Check if scores are NULL

### Issue: Realtime Counter Not Updating
**Check:**
1. Reviewer actually submitted (check database status)
2. Coordinator page subscription active (Network tab → WebSocket)
3. Try page refresh (should update)
4. Check browser console for subscription errors

### Issue: RLS Blocking Access
**Symptoms:** 403 Forbidden, "User does not have permission"

**Check:**
1. User profile status is 'ACTIVE'
2. User has correct role (author, editor, coordinator, reviewer)
3. Manuscript author_id matches if user is author

**Solution:**
```sql
-- Ensure profile is active:
UPDATE profiles SET status='ACTIVE' WHERE email='staging-user@test.com';

-- Verify role:
SELECT email, role, status FROM profiles WHERE email='staging-user@test.com';
```

---

## WHEN TO PROCEED TO PRODUCTION

### ✅ Safe to Proceed to Production IF:
- [x] All Phase 1-8 tests completed successfully
- [x] All database queries returned expected results
- [x] All timestamps accurate
- [x] All notifications delivered
- [x] RLS properly enforced (editors can't see reviewer data, etc.)
- [x] Realtime updates worked without page refresh
- [x] No errors in browser console
- [x] No errors in server logs
- [x] Complete workflow end-to-end passed

### ❌ DO NOT Proceed to Production IF:
- ❌ Any test phase failed
- ❌ Database data missing or incorrect
- ❌ RLS not enforced (users seeing data they shouldn't)
- ❌ Realtime updates not working (required manual refresh)
- ❌ Errors in console or logs
- ❌ Timestamps incorrect
- ❌ Notifications not delivered
- ❌ Any workflow step failed

---

## PRODUCTION DEPLOYMENT CHECKLIST

Only proceed to production after ALL staging tests pass:

- [ ] P1.1 Modal appears and database updates
- [ ] P1.2 Evaluation saves all 7 scores
- [ ] P1.2 Form becomes read-only after submission
- [ ] P1.2 3-decision buttons work
- [ ] P1.3 Realtime counter updates 0/2 → 1/2 → 2/2
- [ ] P1.3 Review package displays all data
- [ ] Editor can see own assignments only
- [ ] Reviewer cannot see other reviewer reports
- [ ] Author cannot see assignments
- [ ] Coordinator can see all assignments
- [ ] All notifications delivered
- [ ] All status transitions logged
- [ ] All timestamps accurate
- [ ] No RLS violations
- [ ] No database errors
- [ ] No console errors
- [ ] Complete workflow passed

---

## CRITICAL NOTES

### ⚠️ NOT PRODUCTION-READY YET
The code has been verified and committed, but it requires real-user testing in staging to validate:
- Realtime updates at scale
- Database consistency
- RLS enforcement
- Complete workflow end-to-end

### ⚠️ STAGING IS FOR VALIDATION, NOT DEMOS
- Use real test data
- Follow the procedure exactly
- Document any issues
- Do not skip steps
- Do not claim success until all criteria pass

### ⚠️ PRODUCTION ONLY AFTER STAGING PASSES
- Deploy to production ONLY after staging E2E test completes successfully
- Keep staging running for regression testing
- Monitor production closely for first 48 hours

---

## SUMMARY

**Current Status:** Code committed, staging ready  
**Next Step:** Deploy to staging  
**Testing Timeline:** ~90 minutes for full E2E test  
**Production Readiness:** After staging E2E test passes  

**Do not skip any test phases. Do not claim success without database verification. Do not deploy to production until staging passes.**

---

*Last Updated: August 12, 2026*  
*Prepared for: Staging Deployment & Real-User Testing*  
*Status: READY FOR STAGING*
