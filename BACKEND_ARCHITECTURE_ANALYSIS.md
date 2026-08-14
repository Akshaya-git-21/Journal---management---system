# Backend Architecture Analysis

**Date:** August 14, 2026  
**Status:** In-Progress Analysis  
**Purpose:** Document existing architecture BEFORE implementation

---

## 1. EXISTING TABLES (Verified)

### 1.1 Core Manuscript Table
```sql
public.manuscripts
├── id (text, primary key)
├── title, abstract, references
├── status (DRAFT|SUBMITTED|EDITOR_REVIEW|UNDER_REVIEW|REVISION_REQUESTED|AWAITING_DECISION|ACCEPTED|PUBLISHED|REJECTED)
├── author_id (uuid, references profiles)
├── assigned_editor_id (uuid, references profiles) ← Current editor assignment
├── submitted_at, published_at
└── created_at, updated_at
```

**Status Values:**
- DRAFT → SUBMITTED (Author submits)
- SUBMITTED → EDITOR_REVIEW (Coordinator assigns editor)
- EDITOR_REVIEW (Editor evaluates + submits suggestions)
- EDITOR_REVIEW → UNDER_REVIEW (Coordinator assigns 2 reviewers)
- UNDER_REVIEW → AWAITING_DECISION (All reviews submitted)
- AWAITING_DECISION → ACCEPTED|REJECTED|REVISION_REQUESTED (Final decision)

### 1.2 Editor Assignments Table
```sql
public.editor_assignments
├── id (uuid, primary key)
├── manuscript_id (text, fk manuscripts)
├── editor_id (uuid, fk profiles)
├── assigned_by (uuid, fk profiles) ← Who assigned editor
├── status (INVITED|ACCEPTED|DECLINED)
├── assessment_status (NOT_STARTED|SUBMITTED) ← KEY: Only when SUBMITTED can coordinator proceed
├── assigned_at, responded_at
├── assessment_submitted_at ← When evaluation was submitted
├── Evaluation criteria scores (scientific_merit, novelty_innovation, etc.)
├── strengths, weaknesses, mandatory_revisions
├── comments_to_coordinator
├── recommendation (ACCEPT|MINOR_REVISION|MAJOR_REVISION|REJECT|ADDITIONAL_REVIEW)
├── recommendation_submitted_at
└── created_at
```

**KEY CONSTRAINT:** Reviewer assignment can only happen if:
- `status = 'ACCEPTED'` AND
- `assessment_status = 'SUBMITTED'`

### 1.3 Suggested Reviewers Table
```sql
public.manuscript_suggested_reviewers
├── id (uuid, primary key)
├── manuscript_id (text, fk manuscripts)
├── suggested_by (AUTHOR|EDITOR) ← DISCRIMINATOR
├── suggested_by_user (uuid, fk profiles) ← Who made suggestion
├── name (text)
├── email (text)
├── note (text)
└── created_at
```

**Current Usage:**
- AUTHOR suggestions: During manuscript submission (DRAFT status)
- EDITOR suggestions: During evaluation submission (via `submit_editor_assessment` RPC)

**Gap to Fill:**
- No tracking of coordinator actions on suggestions (ACCEPTED|DECLINED|REPLACED)
- No link between suggestion and actual assignment
- Need to extend or add new table

### 1.4 Reviewer Assignments Table
```sql
public.reviewer_assignments
├── id (uuid, primary key)
├── manuscript_id (text, fk manuscripts)
├── reviewer_id (uuid, fk profiles)
├── assigned_by (uuid, fk profiles) ← Who assigned (Coordinator)
├── status (INVITED|ACCEPTED|DECLINED|SUBMITTED)
├── invited_at, responded_at, submitted_at
├── due_date
├── Review criteria scores
├── recommendation (ACCEPT|MINOR_REVISION|MAJOR_REVISION|REJECT|ADDITIONAL_REVIEW)
├── comments_to_author, comments_to_editor
└── created_at
```

**Current Status Values:**
- INVITED → ACCEPTED/DECLINED (Reviewer responds)
- ACCEPTED → SUBMITTED (Reviewer submits review)

### 1.5 Status History Table
```sql
public.manuscript_status_history
├── id (uuid, primary key)
├── manuscript_id (text, fk manuscripts)
├── from_status (text)
├── to_status (text)
├── actor_id (uuid, fk profiles)
├── note (text)
└── created_at
```

✅ **Can be reused** for tracking workflow transitions

### 1.6 Audit Log Table
```sql
public.audit_log
├── id (uuid, primary key)
├── actor_id (uuid, fk profiles)
├── action (text) ← Coordinator accept|decline|replace
├── manuscript_id (text, fk manuscripts)
├── before_status, after_status
├── metadata (jsonb)
└── created_at
```

✅ **Can be reused** for tracking coordinator actions

### 1.7 Workflow Notifications Table
```sql
public.workflow_notifications
├── id (uuid, primary key)
├── recipient_id (uuid, fk profiles)
├── type (text) ← REVIEW_INVITATION, etc.
├── manuscript_id (text, fk manuscripts)
├── title, body
├── read_at
└── created_at
```

✅ **Can be reused** for reviewer invitations

---

## 2. EXISTING RPC FUNCTIONS

### 2.1 Manuscript Status Transitions

**`submit_manuscript(p_manuscript_id text)`**
- Validates: Caller is author, manuscript is DRAFT
- Effect: DRAFT → SUBMITTED
- Notification: To all COORDINATOR roles

**`assign_editor(p_manuscript_id text, p_editor_id uuid)`**
- Validates: Caller is coordinator, editor is ACTIVE EDITOR
- Effect: SUBMITTED → EDITOR_REVIEW
- Creates: editor_assignment with status=INVITED
- Notification: To assigned editor

**`respond_to_editor_assignment(p_assignment_id uuid, p_accept boolean)`**
- Validates: Caller is the editor, assignment status=INVITED
- Effect: 
  - If accept: assignment status→ACCEPTED
  - If decline: manuscript status→SUBMITTED (reopen for reassignment)
- Notification: To coordinators

**`submit_editor_assessment(..., p_suggested_reviewers jsonb)`** ✅ KEY RPC
- Validates: Caller is assigned editor, assignment status=ACCEPTED
- Parameters:
  - p_scientific_merit, p_novelty_innovation, ... (scores)
  - p_strengths, p_weaknesses, p_mandatory_revisions
  - p_comments_to_coordinator
  - **p_suggested_reviewers** (jsonb array of {name, email, note})
- Effect:
  - Updates editor_assignment: assessment_status→SUBMITTED
  - **Inserts into manuscript_suggested_reviewers for each suggestion**
- Notification: To coordinators "Editor assessment ready for review"

⚠️ **ISSUE:** Suggestions are inserted as plain name/email, not linked to reviewer profiles
- No validation that suggested reviewer exists as active REVIEWER
- No deduplication within suggestions

**`assign_reviewers(p_manuscript_id text, p_reviewer_ids uuid[])`**
- Validates:
  - Caller is coordinator
  - Exactly 2 reviewers in array, no duplicates
  - Manuscript status=EDITOR_REVIEW
  - Editor assessment was submitted
  - All reviewers are ACTIVE REVIEWER role
- Effect:
  - EDITOR_REVIEW → UNDER_REVIEW
  - Creates 2 reviewer_assignment records with status=INVITED
  - Creates notifications (REVIEW_INVITATION) for each reviewer
- Returns: The created reviewer_assignments

⚠️ **ISSUE:** This RPC doesn't handle Accept/Decline/Replace flow
- Takes only reviewer IDs, no suggestion tracking
- No intermediate Review Board state
- No Accept/Decline/Replace coordinator actions

**`respond_to_review_invite(p_assignment_id uuid, p_accept boolean)`**
- Validates: Caller is reviewer, assignment status=INVITED
- Effect: assignment status→ACCEPTED or DECLINED
- Notification: If declined, notify coordinators

**`submit_review(...)`**
- Validates: Caller is reviewer, assignment status=ACCEPTED
- Effect: assignment status→SUBMITTED
- Auto-transition: If all reviews submitted, UNDER_REVIEW → AWAITING_DECISION

**`submit_editor_recommendation(p_manuscript_id text, p_recommendation text)`**
- Validates: Caller is assigned editor, assessment_status=SUBMITTED
- Effect: Sets editor recommendation
- Notification: To coordinators

**`publish_decision(p_manuscript_id text, p_decision text, p_decision_letter text)`**
- Validates: Caller is coordinator, manuscript status=AWAITING_DECISION, editor has recommendation
- Effect: AWAITING_DECISION → ACCEPTED|REJECTED|REVISION_REQUESTED
- If REVISION_REQUESTED: Creates manuscript_revision record
- Notification: To author with decision letter

---

## 3. RLS POLICIES (Verified)

### 3.1 Manuscript Access
```sql
-- SELECT allowed if:
author_id = auth.uid()
OR assigned_editor_id = auth.uid()
OR is_invited_editor_of(id) -- invited editor
OR is_reviewer_of(id) -- assigned reviewer
OR is_active_coordinator()
OR (is_active_publisher() AND status in ('ACCEPTED','PUBLISHED'))
```

✅ Coordinator can see all manuscripts

### 3.2 Suggested Reviewers Access
```sql
-- SELECT allowed if manuscript visible to user (via manuscripts RLS)
-- INSERT for AUTHOR: if manuscript author and manuscript.status='DRAFT'
-- INSERT for EDITOR: NOT YET IMPLEMENTED - needs new RLS
```

⚠️ **ISSUE:** No RLS for EDITOR inserts
- Currently uses RPC to enforce (submit_editor_assessment)
- But direct INSERT not protected
- Need to add RLS policy

### 3.3 Reviewer Assignments Access
```sql
-- SELECT allowed if:
reviewer_id = auth.uid()
OR is_active_coordinator()
OR manuscript assigned_editor_id = auth.uid()
```

✅ Good coverage

---

## 4. EXISTING WORKFLOW LOGIC

### Current Flow:
```
1. Author submits (DRAFT → SUBMITTED)
2. Coordinator assigns editor (SUBMITTED → EDITOR_REVIEW)
3. Editor accepts assignment
4. Editor submits evaluation + suggestions (assessment_status → SUBMITTED)
   - Suggestions stored as plain name/email
5. Coordinator calls assign_reviewers(2 reviewer UUIDs)
   - EDITOR_REVIEW → UNDER_REVIEW
   - Creates assignments, sends invitations
6. Reviewers accept, submit reviews
7. When all reviews in: UNDER_REVIEW → AWAITING_DECISION
8. Editor gives recommendation
9. Coordinator publishes decision
10. If revision: Author revises, loops back to step 3
```

### Missing Piece:
**Between step 4 and 5:** No coordinator Review Board stage
- No Accept/Decline/Replace actions
- No validation that suggested reviewers are actual profiles
- No tracking of which reviewers were accepted vs declined
- Direct jump from suggestion to assignment

---

## 5. ROLE-BASED PERMISSIONS

### Profiles Table Roles:
```sql
role in ('AUTHOR', 'EDITOR', 'REVIEWER', 'PUBLISHER', 'COORDINATOR')
status in ('ACTIVE', 'PENDING_APPROVAL', 'REJECTED')
```

### Helper Functions:
```sql
is_active_coordinator() -- Returns true if caller is COORDINATOR with status=ACTIVE
is_editor_of(p_manuscript_id) -- True if caller assigned and accepted editor
is_invited_editor_of(p_manuscript_id) -- True if caller invited editor
is_reviewer_of(p_manuscript_id) -- True if caller has assignment
is_active_publisher() -- True if caller is PUBLISHER with status=ACTIVE
```

✅ Reusable, security-definer pattern

---

## 6. NOTIFICATION & EMAIL

### Workflow Notifications:
- Table: `workflow_notifications` (in-app only)
- Used by: RPCs via `_notify()` helper function
- Types seen: MANUSCRIPT_SUBMITTED, EDITOR_ASSIGNED, EDITOR_ASSESSMENT_SUBMITTED, REVIEW_INVITATION, REVIEWER_DECLINED, REVIEWS_COMPLETE, DECISION_PUBLISHED, EDITOR_RECOMMENDATION_READY

### Email Sending:
⚠️ **NOT YET FOUND** - Need to check:
- Is there an email service configured in Supabase?
- Are there email functions/RPCs?
- Or are emails triggered externally?

**Action:** Search for email handling in frontend and migrations

---

## 7. REALTIME SUBSCRIPTIONS

✅ Supabase Realtime enabled by default on tables with RLS

Current subscriptions likely on:
- manuscripts (status changes)
- reviewer_assignments (status changes)
- workflow_notifications (new notifications)
- editor_assignments (assignment changes)

---

## 8. WHAT NEEDS TO BE ADDED/MODIFIED

### New Database Elements:

**Option A: Extend manuscript_suggested_reviewers**
Add columns:
- `coordinator_status` (SUGGESTED|ACCEPTED|DECLINED|REPLACED)
- `coordinator_action_at` (timestamptz)
- `coordinator_action_by` (uuid)
- `replacement_reviewer_id` (uuid) -- if REPLACED

⚠️ Concern: Mixes author/editor suggestions with coordinator actions

**Option B: Create new coordinator_reviewer_actions table**
```sql
coordinator_reviewer_actions
├── id (uuid)
├── manuscript_id (text)
├── suggestion_id (uuid, fk manuscript_suggested_reviewers)
├── action (ACCEPTED|DECLINED|REPLACED)
├── replacement_reviewer_id (uuid) -- if REPLACED
├── coordinator_id (uuid)
├── action_at (timestamptz)
└── reason (text, optional for decline)
```

**Recommendation:** Option B is cleaner
- Keeps suggestion history immutable
- Clear audit trail
- Separates concerns

### New RPCs Needed:

1. `coordinator_accept_suggestion(p_suggestion_id uuid)` 
   - Validates: Caller is coordinator, manuscript in EDITOR_REVIEW
   - Effect: Creates coordinator_reviewer_actions record, marks as ACCEPTED
   - May create reviewer_assignment if 2 confirmed

2. `coordinator_decline_suggestion(p_suggestion_id uuid, p_reason text default '')`
   - Validates: Caller is coordinator
   - Effect: Creates action record, marks as DECLINED
   - Does NOT create assignment

3. `coordinator_replace_suggestion(p_suggestion_id uuid, p_replacement_reviewer_id uuid)`
   - Validates: Caller is coordinator, replacement is ACTIVE REVIEWER
   - Effect: Creates action record, marks as REPLACED with replacement ID
   - Creates reviewer_assignment for replacement

4. `coordinator_assign_reviewer_directly(p_manuscript_id text, p_reviewer_id uuid)`
   - Validates: Caller is coordinator, reviewer is ACTIVE, not already assigned
   - Effect: Creates reviewer_assignment without suggestion
   - Used when assigning non-suggested reviewers

5. `finalize_reviewer_board(p_manuscript_id text)`
   - Validates: Caller is coordinator, manuscript status=EDITOR_REVIEW
   - Count: Exactly 2 active assignments exist
   - Effect: 
     - EDITOR_REVIEW → UNDER_REVIEW
     - Mark board as finalized
     - Send reviewer invitations
     - Create audit log
   - Prevents: Duplicate assignments, inactive reviewers

### New RLS Policies:

1. For coordinator_reviewer_actions (if new table)
   - SELECT: Coordinator
   - INSERT: Coordinator (via RPC only)
   - UPDATE: None (immutable)

---

## 9. EXISTING COMPONENTS (Frontend)

Need to inspect:
- EditorWorkspace.tsx
- EditorEvaluationTab.tsx
- CoordinatorWorkspace.tsx
- ReviewersTab.tsx
- Manuscript detail components

---

## 10. SUMMARY: REUSE VS NEW

### REUSE (No changes):
- ✅ manuscripts table
- ✅ editor_assignments table  
- ✅ reviewer_assignments table
- ✅ manuscript_status_history table
- ✅ audit_log table
- ✅ workflow_notifications table
- ✅ profiles + roles
- ✅ Helper functions (is_active_coordinator, etc.)
- ✅ RLS pattern (security_definer)

### EXTEND/MODIFY:
- ⚠️ manuscript_suggested_reviewers (add coordinator action tracking)
- ⚠️ submit_editor_assessment RPC (improve suggestion validation)
- ⚠️ assign_reviewers RPC (keep, but replace with new finalize RPC)

### CREATE NEW:
- ✅ coordinator_reviewer_actions table (or extend suggested_reviewers)
- ✅ coordinator_accept_suggestion RPC
- ✅ coordinator_decline_suggestion RPC
- ✅ coordinator_replace_suggestion RPC
- ✅ coordinator_assign_reviewer_directly RPC
- ✅ finalize_reviewer_board RPC
- ✅ RLS policies for new actions

### UI CHANGES:
- ✅ EditorEvaluationTab: Add reviewer suggestion form
- ✅ CoordinatorWorkspace: Redesign Review Board
- ✅ Add realtime subscriptions
- ✅ Add notification handlers

---

## 11. NEXT STEPS

1. ✅ Backend inspection COMPLETE
2. ⏳ Verify email/notification infrastructure
3. ⏳ Create new migration file with:
   - coordinator_reviewer_actions table OR extend suggested_reviewers
   - New RPC functions
   - New RLS policies
4. ⏳ Test RPCs with Supabase dashboard
5. ⏳ Build frontend Phase B (Editor suggestions)
6. ⏳ Build frontend Phase C (Coordinator Review Board)
7. ⏳ Full end-to-end testing

---

**Status:** Backend analysis complete. Ready for Phase A implementation (Database & RPCs)

