# Reviewer Assignment Workflow - Implementation Plan

**Date:** August 14, 2026  
**Status:** Planning Phase  
**Scope:** Complete Editor Reviewer Suggestion → Coordinator Evaluation → Reviewer Assignment flow

---

## Phase Breakdown & Sequence

### PHASE 1: Database Schema Inspection ✅ COMPLETE
**Status:** Done - Schema already supports this workflow

**Findings:**
- `manuscript_suggested_reviewers` table EXISTS
  - `suggested_by`: 'AUTHOR' | 'EDITOR'
  - `suggested_by_user`: UUID of who suggested
  - Already tracks editor suggestions
  
- `reviewer_assignments` table EXISTS
  - Has all fields needed for assignments
  - Tracks `assigned_by`, `status`, `invited_at`, etc.

- `editor_assignments` table EXISTS
  - Tracks editor evaluation submissions
  - Has `assessment_status` field

- Workflow RPCs EXIST:
  - `submit_editor_assessment(p_suggested_reviewers jsonb)` - accepts suggestions
  - `assign_reviewers(p_reviewer_ids uuid[])` - assigns 2 reviewers
  - `_record_transition()` & `_notify()` helpers
  
- RLS policies already support:
  - Editor suggestions on their manuscripts
  - Coordinator viewing all suggestions

**Conclusion:** Database is ready. No schema changes needed.

---

### PHASE 2: UI Component Inspection
**Status:** In Progress

**EditorWorkspace.tsx findings:**
- Already has reviewer suggestion UI
- Shows suggestions in a list
- Has "Add Another Reviewer" functionality
- But: Not integrated into the evaluation submission form yet

**EditorEvaluationTab.tsx findings:**
- Display-only component
- Shows submitted evaluation details
- Does NOT show reviewer suggestions

**CoordinatorWorkspace.tsx findings:**
- Has Review Board section (need to check current state)
- Shows available reviewers list
- Need to split into: Editor Suggested vs Available

---

### PHASE 3: Workflow Integration

**Current Workflow (from schema):**
```
SUBMITTED
  ↓
EDITOR_REVIEW (editor assigned)
  ↓
EDITOR_REVIEW (assessment submitted)
  ↓
UNDER_REVIEW (reviewers assigned via assign_reviewers RPC)
  ↓
AWAITING_DECISION
```

**Target Workflow:**
```
SUBMITTED
  ↓
EDITOR_REVIEW (editor assigned)
  ↓
EDITOR_REVIEW (editor evaluation submitted with 2+ reviewer suggestions)
  ↓
EDITOR_REVIEW (coordinator reviews suggestions - NEW STAGE)
  ↓
UNDER_REVIEW (coordinator finalizes 2 reviewers and sends invitations)
  ↓
AWAITING_DECISION
```

**Issue:** Current `assign_reviewers` RPC accepts only reviewer IDs, doesn't handle Accept/Decline/Replace

**Solution:** Create new RPC functions:
- `coordinator_accept_suggested_reviewer(p_suggestion_id uuid)` - accept suggestion
- `coordinator_decline_suggested_reviewer(p_suggestion_id uuid)` - decline suggestion  
- `coordinator_replace_suggested_reviewer(p_suggestion_id uuid, p_replacement_id uuid)` - replace
- `finalize_reviewer_board(p_manuscript_id text)` - confirm and transition

---

### PHASE 4: Implementation Tasks

#### 4.1 Database Updates (RPC Functions)
**Required:** New server-side RPC functions for Coordinator actions

#### 4.2 Frontend - Editor Side
- **EditorEvaluationTab.tsx** → Add submission form
  - Evaluation criteria form (existing, refactor if needed)
  - Add "Reviewer Suggestions" section below evaluation
  - Implement reviewer selection with "Add Another" button
  - Validate 2+ reviewers before submission
  - Submit evaluation + suggestions together

#### 4.3 Frontend - Coordinator Side
- **CoordinatorWorkspace.tsx** → Redesign Review Board
  - Split view: Editor Suggested vs Available
  - Add Accept/Decline/Replace actions for suggestions
  - Implement direct assignment from Available
  - Show assignment count progress (0/2 → 1/2 → 2/2)
  - Finalize button after 2 assigned

#### 4.4 Realtime Updates
- Use existing Supabase realtime subscriptions
- Updates should reflect instantly across components

#### 4.5 Email/Notifications
- Use existing `_notify()` helper for in-app notifications
- Email sending (check if Supabase email configured)

---

## Implementation Order

1. **Database & RPCs** (backend)
   - Create new RPC functions for coordinator actions
   - Test with Supabase dashboard

2. **Editor Submission** (frontend)
   - Create EditorEvaluationFormTab component
   - Integrate reviewer suggestions
   - Test submission with suggestions

3. **Coordinator Review Board** (frontend)
   - Split reviewers into two sections
   - Implement action buttons
   - Wire up RPC calls

4. **Finalization & Workflow** (backend + frontend)
   - Implement finalize logic
   - Trigger email sending
   - Test workflow transition

5. **Realtime & Testing** (full stack)
   - Enable realtime subscriptions
   - End-to-end testing

---

## Key Decisions Made

✅ **Keep existing `submit_editor_assessment` RPC** - Already handles suggestions as JSONB

✅ **Don't modify `assign_reviewers` RPC** - Create new RPCs for coordinator actions

✅ **Reuse existing notification system** - Use `workflow_notifications` table

✅ **No database schema changes** - Existing schema supports full workflow

✅ **Realtime via Supabase** - Use existing subscription pattern

---

## Testing Strategy

### Test 1: Editor Flow
- Login as Editor
- Submit evaluation with 2+ reviewer suggestions  
- Verify data in database
- Verify notification to Coordinator

### Test 2: Coordinator Initial View
- Verify suggested reviewers appear with badge
- Verify available reviewers listed separately
- Verify UI shows 0/2 status

### Test 3: Accept Suggestion
- Accept one suggestion
- Verify status updates realtime
- Verify count becomes 1/2
- Verify assignment created in database

### Test 4: Decline Suggestion
- Decline a suggestion
- Verify no assignment created
- Verify audit log recorded
- Verify realtime update

### Test 5: Replace Suggestion
- Replace a suggestion with different reviewer
- Verify original marked as REPLACED
- Verify new reviewer assigned
- Verify no duplicates

### Test 6: Direct Assignment
- Assign reviewer not in suggestions
- Verify works without suggestion required
- Verify 2/2 count correct

### Test 7: Finalization
- Assign 2 reviewers
- Click "Confirm Reviewer Assignments"
- Verify manuscript moves to UNDER_REVIEW
- Verify status becomes "Awaiting Reviews"
- Verify notifications sent
- Verify in Reviewers tab

### Test 8: Security
- Prevent unauthorized access
- Prevent duplicate assignments
- Prevent finalization with < 2 reviewers
- Prevent modification after finalization
- Server-side validation only

### Test 9: Realtime
- Open same manuscript in 2 windows
- Make changes in one
- Verify other updates without refresh

---

## Files to Modify/Create

### Backend (Database/RPCs)
- `supabase/migrations/0002_manuscripts_workflow.sql` - Add new RPCs

### Frontend Components  
- `src/components/EditorWorkspace.tsx` - Refactor evaluation submission
- `src/components/manuscript-detail/tabs/EditorEvaluationTab.tsx` - Add submission form
- `src/components/CoordinatorWorkspace.tsx` - Redesign Review Board
- Possibly: Create `EditorEvaluationFormTab.tsx` - New component for submission

### Frontend Library
- `src/lib/workflow.ts` - Add new RPC wrapper functions
- `src/lib/editorWorkspace.ts` - Refactor editor submission logic

---

## Completion Criteria

✅ Phase 1: Database inspection done  
⏳ Phase 2: UI component inspection (in progress)  
⏳ Phase 3-16: Implementation and testing  

**Definition of Done:**
- All 16 phases implemented
- All 9 test cases passing
- Zero console errors
- Realtime updates working
- Email/notifications sent
- Security validation passing
- Complete documentation
- Ready for production

---

**Next Step:** Complete Phase 2 (UI inspection), then proceed with Phase 3 (create RPCs)
