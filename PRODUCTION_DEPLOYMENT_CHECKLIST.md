# Production Deployment Checklist

**Status:** 🟢 Ready to Deploy (After Staging E2E Pass)  
**Timeline:** 2-4 hours deployment + monitoring  
**Risk Level:** Low  

---

## PRE-DEPLOYMENT VERIFICATION

### Code Review ✅
- [ ] Code has passed code review
- [ ] No known bugs or security issues
- [ ] TypeScript build succeeds
- [ ] Commit hash: `966abff` (or latest approved)
- [ ] All migrations are idempotent
- [ ] RLS policies are secure

### Staging E2E Test ✅
- [ ] **MUST PASS before proceeding**
- [ ] All 13 workflow phases complete
- [ ] All database verifications pass
- [ ] All realtime updates work without refresh
- [ ] No console errors
- [ ] No database errors
- [ ] Performance is acceptable

### Database Verification ✅
Run in Supabase SQL Console before deployment:

```sql
-- Verify all tables exist
SELECT COUNT(*) as table_count FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN (
  'manuscripts', 'editor_assignments', 'reviewer_assignments',
  'manuscript_files', 'manuscript_revisions', 'manuscript_discussions',
  'workflow_notifications', 'manuscript_status_history', 'audit_log'
);
-- Expected: 9

-- Verify all RPC functions exist
SELECT COUNT(*) as rpc_count FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' 
AND routine_name IN (
  'submit_manuscript', 'assign_editor', 'respond_to_editor_assignment',
  'submit_editor_assessment', 'assign_reviewers', 'respond_to_review_invite',
  'submit_review', 'submit_editor_recommendation', 'publish_decision',
  'submit_revision', 'mark_published'
);
-- Expected: 11

-- Verify RLS is enabled
SELECT COUNT(*) as rls_enabled FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true 
AND tablename IN ('manuscripts', 'editor_assignments', 'reviewer_assignments');
-- Expected: 3

-- Verify test data is cleaned up (no "TEST MANUSCRIPT" records)
SELECT COUNT(*) as test_records FROM public.manuscripts 
WHERE title LIKE 'TEST%';
-- Expected: 0
```

### Security Verification ✅

```sql
-- Verify service_role key is NOT used in frontend code
-- (Manual check: search codebase for SUPABASE_SERVICE_ROLE_KEY)

-- Verify no hardcoded user IDs
-- (Manual check: no hardcoded UUIDs in TypeScript files)

-- Verify RLS policies block unauthorized access
-- (Already tested in staging)

-- Verify passwords are never logged
-- (Already verified in code review)

-- Check audit_log has entries from staging test
SELECT COUNT(*) as audit_entries FROM public.audit_log;
-- Expected: > 0
```

---

## DEPLOYMENT STEPS

### Step 1: Pre-Deployment Backup (5 min)

```bash
# In your deployment pipeline/tooling:

# 1. Export current production database (if exists)
pg_dump $PROD_DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Export storage (if exists)
# (Use Supabase console or custom export script)

# 3. Tag current production code
git tag production-$(date +%Y%m%d_%H%M%S)
```

### Step 2: Deploy Database Schema (2 min)

```bash
# In Supabase Production Project:

# 1. Go to SQL Editor
# 2. Copy migrations from: supabase/migrations/0001_profiles_rbac.sql
# 3. Run (idempotent - safe to re-run)
# 4. Copy migrations from: supabase/migrations/0002_manuscripts_workflow.sql
# 5. Run (idempotent - safe to re-run)
# 6. Run verification queries above
```

Alternatively, if using Supabase migrations CLI:
```bash
supabase migration up --linked
```

### Step 3: Verify Database (2 min)

```bash
# Run verification queries from Pre-Deployment section
# All queries must return expected results
# If any fail, STOP and investigate

# Check for errors in migration logs:
SELECT * FROM storage.s3_multipart_uploads LIMIT 1; -- Should work
```

### Step 4: Deploy Application Code (5 min)

```bash
# Production deployment (example for Vercel/Netlify):

# 1. Ensure staging test branch is merged to main
git checkout main
git pull origin main

# 2. Deploy to production
# Using your deployment service (Vercel, Netlify, etc.)
npm run build  # Verify locally first
vercel deploy --prod  # Or your deployment command

# 3. Verify deployment successful
# Check for:
# - No build errors
# - API endpoints responding
# - UI loads at https://your-domain.com
```

### Step 5: Run Smoke Tests (10 min)

```bash
# In production environment, with test accounts:

# 1. Test Author can submit manuscript
# 2. Test Coordinator sees manuscript in queue
# 3. Test Editor can view assignment
# 4. Test Reviewer can see invitation
# 5. Verify realtime updates work

# Document results:
# ✅ All smoke tests pass
```

### Step 6: Enable Monitoring (5 min)

```bash
# Set up alerts for:
- Database connection errors
- RPC execution failures
- API error rates
- Performance degradation
- Storage write failures

# Enable in:
- Supabase project settings
- Application error logging (Sentry, etc.)
- Database monitoring (if available)
```

---

## STEP-BY-STEP DEPLOYMENT

### Timeline

| Step | Duration | Owner | Status |
|------|----------|-------|--------|
| Pre-deployment verification | 15 min | DevOps | [ ] |
| Database migration | 2 min | DBA | [ ] |
| Verify database | 2 min | DBA | [ ] |
| Deploy application | 5 min | DevOps | [ ] |
| Run smoke tests | 10 min | QA | [ ] |
| Enable monitoring | 5 min | DevOps | [ ] |
| Notify team | 5 min | PM | [ ] |
| **Total** | **44 min** | | |

### Deployment Checklist

```
PRE-DEPLOYMENT
[ ] Staging E2E test passed
[ ] Code review approved
[ ] Backup created
[ ] Database verified
[ ] Security verified

DEPLOYMENT
[ ] Database migrations applied
[ ] Database verification passed
[ ] Application deployed
[ ] Smoke tests passed
[ ] Monitoring enabled

POST-DEPLOYMENT
[ ] Team notified
[ ] Customer notifications sent
[ ] Performance baseline recorded
[ ] On-call engineer briefed
[ ] Incident response plan ready
```

---

## MONITORING & ALERTS

### Critical Alerts (Immediate Escalation)

Set these to page on-call:

```
1. Database Connection Errors
   - Trigger: > 5 errors in 1 minute
   - Action: Check database status, restart if needed

2. RPC Execution Failures
   - Trigger: > 10% failure rate
   - Action: Check RPC logs, verify data integrity

3. Application Errors
   - Trigger: > 1% error rate
   - Action: Check logs, restart app if needed

4. Storage Write Failures
   - Trigger: Any storage errors
   - Action: Check storage bucket policies

5. Realtime Connection Errors
   - Trigger: > 25% connection loss
   - Action: Check WebSocket availability
```

### Metrics to Monitor (First 48 Hours)

```
Performance:
- Request latency (p50, p95, p99)
  Target: < 500ms, < 2s, < 5s
  
- Database query latency
  Target: < 100ms average
  
- API error rate
  Target: < 0.1%
  
- File upload success rate
  Target: > 99%

Realtime Updates:
- WebSocket connection success rate
  Target: > 99.5%
  
- Message delivery latency
  Target: < 500ms

Functionality:
- Workflow completion rate
  Track: % of submitted manuscripts completing each phase
  Target: > 95% for each phase
  
- Notification delivery rate
  Track: % of notifications reaching recipients
  Target: > 99%
  
- File persistence
  Track: % of uploaded files remaining accessible
  Target: 100%
```

### Logs to Check

```
Application Logs:
- Check for unexpected errors
- Monitor for slow queries
- Watch for RLS policy violations

Database Logs:
- Check for constraint violations
- Monitor for deadlocks
- Watch for statement timeouts

Storage Logs:
- Check for upload failures
- Monitor for quota issues
- Watch for access violations

Realtime Logs:
- Check connection errors
- Monitor message delays
- Watch for subscription failures
```

---

## INCIDENT RESPONSE

### If Deployment Fails

**Stop deployment immediately and:**

1. **Check Error Message**
   - Database error? → Check migrations
   - API error? → Check environment variables
   - Build error? → Check dependencies

2. **Rollback**
   ```bash
   # Option A: Rollback to previous deployment
   vercel rollback
   
   # Option B: Restore from backup
   psql $PROD_DATABASE_URL < backup_[timestamp].sql
   
   # Option C: Revert code
   git revert [commit-hash]
   git push origin main
   ```

3. **Communicate**
   - Notify team on Slack
   - Update status page
   - Document issue
   - Create post-mortem

### If Errors After Deployment

**Do NOT modify RLS policies without investigating first:**

1. **Identify the Error**
   - Check application logs
   - Check database logs
   - Review recent changes

2. **Verify Data Integrity**
   ```sql
   SELECT COUNT(*) FROM manuscripts;
   SELECT COUNT(*) FROM editor_assignments;
   SELECT COUNT(*) FROM reviewer_assignments;
   -- All should have expected row counts
   ```

3. **If RLS Policy Issue**
   - Do NOT loosen policies
   - Instead, verify user role and profile
   - Check is_active_coordinator() etc.

4. **If Performance Issue**
   - Check database indexes
   - Monitor query performance
   - Enable query logging if needed

### Critical Issues Requiring Immediate Action

```
Critical Issue 1: Database Corruption
- Symptom: Constraint violation errors
- Action: Check backup, consider restore
- Prevention: Regular backups

Critical Issue 2: RLS Blocks All Access
- Symptom: All users get "permission denied"
- Action: Verify RLS policies exist
- Prevention: Test RLS in staging

Critical Issue 3: Realtime Stopped Working
- Symptom: Manual refresh required for updates
- Action: Check WebSocket connection
- Prevention: Monitor realtime metrics

Critical Issue 4: Files Not Persisting
- Symptom: Files upload but disappear
- Action: Check storage policies
- Prevention: Verify storage during test
```

---

## ROLLBACK PROCEDURE

If critical issue discovered after deployment:

### Immediate (< 5 min)
```bash
# Option 1: Quick rollback (fastest)
vercel rollback

# Option 2: Manual rollback to previous working version
git checkout [previous-working-commit]
npm run build
vercel deploy --prod
```

### Extended (if needed)
```bash
# Option 3: Database restore from backup
psql $PROD_DATABASE_URL < backup_[timestamp].sql

# Verify restore:
SELECT COUNT(*) FROM manuscripts;
-- Should match backup timestamp
```

### After Rollback
1. Notify team
2. Document issue
3. Create detailed incident report
4. Schedule post-mortem
5. Fix underlying issue
6. Re-test in staging before next deployment

---

## PRODUCTION SUPPORT

### First 24 Hours (Critical Monitoring)

```
Monitoring Frequency: Every 15 minutes

Checks:
[ ] Application is responding
[ ] Database connections healthy
[ ] Error rate < 0.1%
[ ] Realtime updates working
[ ] File uploads succeeding
[ ] Notifications delivering
[ ] Performance within baseline

Action: Check every 15 min, alert if any issues
```

### Days 2-7 (Intensive Monitoring)

```
Monitoring Frequency: Every 1 hour

Checks:
[ ] No memory leaks detected
[ ] Database performance stable
[ ] User workflows completing
[ ] No cascading errors
[ ] Performance sustainable

Action: Check every hour, escalate if trends worsen
```

### Days 8+ (Normal Monitoring)

```
Monitoring Frequency: Daily

Checks:
[ ] Weekly error rate summary
[ ] Performance trend analysis
[ ] User feedback collection
[ ] Database maintenance status
[ ] Security incident checks

Action: Check daily, investigate weekly anomalies
```

### On-Call Responsibilities

**Assigned on-call engineer:**
- Responds to alerts within 5 minutes
- Diagnoses issue within 15 minutes
- Escalates if unable to fix within 30 minutes
- Documents all actions taken
- Updates status page

---

## SUCCESS CRITERIA

### ✅ Deployment Successful When

1. **Immediate (0-1 hour)**
   - ✅ All code deployed to production
   - ✅ Database migrations applied
   - ✅ Application responding on production domain
   - ✅ Smoke tests pass
   - ✅ No critical errors in logs

2. **Short-term (1-24 hours)**
   - ✅ Error rate < 0.1%
   - ✅ Realtime updates working
   - ✅ Users can submit manuscripts
   - ✅ Coordinator can assign editors
   - ✅ Editors can evaluate
   - ✅ Reviewers can submit reviews
   - ✅ No data corruption detected

3. **Medium-term (24-72 hours)**
   - ✅ Multiple workflows completed successfully
   - ✅ Database performance stable
   - ✅ File uploads reliable
   - ✅ Notifications delivered correctly
   - ✅ No memory leaks
   - ✅ Performance within targets

### ❌ Deployment Failed If

- ❌ Build failed or doesn't deploy
- ❌ Database migrations error
- ❌ Application won't start
- ❌ Error rate > 1%
- ❌ Realtime updates not working
- ❌ Users cannot complete workflows
- ❌ Data corruption detected
- ❌ Security breach detected
- ❌ RLS policies not enforced

---

## POST-DEPLOYMENT

### Day 1 After Deployment

```
Morning:
- [ ] Check overnight logs for errors
- [ ] Review alert summary
- [ ] Verify key workflows completed
- [ ] Check user feedback channels

Afternoon:
- [ ] Review performance metrics
- [ ] Update monitoring alerts if needed
- [ ] Brief team on status
- [ ] Plan day 2 activities

Evening:
- [ ] Check for any new issues
- [ ] Ensure on-call rotation active
- [ ] Prepare incident response if needed
```

### Week 1 After Deployment

```
Daily:
- [ ] Check error logs
- [ ] Verify performance metrics
- [ ] Review user submissions
- [ ] Monitor storage usage

Weekly:
- [ ] Performance analysis
- [ ] User feedback review
- [ ] Database optimization if needed
- [ ] Security audit
```

### Month 1 After Deployment

```
Ongoing:
- [ ] Monitor error trends
- [ ] Collect user feedback
- [ ] Plan optimization phase
- [ ] Document lessons learned
- [ ] Schedule retrospective
```

---

## DEPLOYMENT SIGN-OFF

**Before production deployment, all parties must confirm:**

```
Manager Approval:
- [ ] Budget approved
- [ ] Timeline acceptable
- [ ] Risk level acceptable
- [ ] Support plan in place
Signed: _____________ Date: _______

Technical Lead Approval:
- [ ] Code quality verified
- [ ] All tests passing
- [ ] Security review complete
- [ ] Database migration safe
Signed: _____________ Date: _______

DevOps Approval:
- [ ] Infrastructure ready
- [ ] Monitoring configured
- [ ] Rollback procedure tested
- [ ] On-call coverage arranged
Signed: _____________ Date: _______

QA Approval:
- [ ] Staging E2E test passed
- [ ] All known issues documented
- [ ] Performance acceptable
- [ ] No critical bugs found
Signed: _____________ Date: _______
```

---

## CUSTOMER COMMUNICATION

### Pre-Deployment Notification (24 hours before)

```
Subject: Scheduled Maintenance - JMS Platform Update

Dear Users,

We will be deploying a major update to the Journal Management System 
on [DATE] at [TIME] ([TIMEZONE]).

Expected Duration: 30-60 minutes
Impact: Brief service interruption expected

Changes in this update:
- Enhanced workflow management
- Improved real-time updates
- Better reviewer assignment
- Enhanced security

No data will be lost. Your manuscripts and reviews are safe.

We appreciate your patience.

Best regards,
The JMS Team
```

### Post-Deployment Notification

```
Subject: JMS Platform Update Complete

Dear Users,

The Journal Management System has been successfully updated.

New Features:
- Real-time manuscript status updates
- Improved reviewer assignment workflow
- Enhanced editor evaluation interface
- Better notification delivery

Please report any issues to support@journal.com

Thank you,
The JMS Team
```

---

## FINAL CHECKLIST BEFORE GOING LIVE

### Code & Database
- [ ] Staging E2E test: PASS
- [ ] TypeScript build: PASS
- [ ] Database migrations: Ready
- [ ] RLS policies: Verified
- [ ] RPC functions: Working
- [ ] No mock data: Confirmed
- [ ] No secrets in code: Confirmed

### Infrastructure
- [ ] Production environment: Ready
- [ ] Database: Accessible
- [ ] Storage: Configured
- [ ] WebSocket: Available
- [ ] DNS: Pointing to production
- [ ] SSL/TLS: Enabled
- [ ] Backups: Configured

### Monitoring & Support
- [ ] Alerts configured: YES
- [ ] On-call coverage: Assigned
- [ ] Support plan: Ready
- [ ] Incident response: Documented
- [ ] Rollback procedure: Tested
- [ ] Team trained: YES
- [ ] Documentation: Complete

### Team Readiness
- [ ] Developers notified: YES
- [ ] QA briefed: YES
- [ ] Customers notified: YES
- [ ] Support team ready: YES
- [ ] Manager approval: YES
- [ ] Technical lead: Approved
- [ ] DevOps: Ready

---

**Status:** 🟢 READY FOR PRODUCTION  
**Deployment Date:** [To be scheduled after staging pass]  
**Expected Timeline:** 44 minutes  
**Risk Level:** Low  

All systems are ready. Proceed when staging E2E test passes.
