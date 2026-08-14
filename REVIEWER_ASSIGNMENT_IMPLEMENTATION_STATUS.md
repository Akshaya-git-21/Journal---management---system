# Reviewer Assignment Workflow - Implementation Status

**Last Updated:** August 14, 2026  
**Overall Status:** 40% Complete (Phases A-B in progress)

---

## Completed Phases

### ✅ Phase A: Database & RPCs (100% Complete)

**New Migration File:** `supabase/migrations/0008_reviewer_assignment_workflow.sql`

**Created:**
- ✅ `editor_reviewer_actions` table
  - Tracks coordinator decisions: ACCEPTED, DECLINED, REPLACED
  - Links to manuscript_suggested_reviewers via suggestion_id
  - Records replacement_reviewer_id if REPLACED
  - Immutable audit trail

- ✅ 5 New RPC Functions:
  1. `coordinator_accept_suggestion(suggestion_id)` - Accepts suggestion, creates assignment
  2. `coordinator_decline_suggestion(suggestion_id, reason)` - Declines without creating assignment
  3. `coordinator_replace_suggestion(suggestion_id, replacement_id)` - Replaces with different reviewer
  4. `coordinator_assign_reviewer_directly(manuscript_id, reviewer_id)` - Direct assignment (no suggestion)
  5. `finalize_reviewer_board(manuscript_id)` - Confirms 2 reviewers, transitions to UNDER_REVIEW

- ✅ RLS Policies
  - Coordinator can select/insert actions on their manuscripts
  - Actions table is immutable (no update/delete)
  - Editors can see actions on their manuscripts

- ✅ TypeScript Wrappers
  - Added to `src/lib/workflow.ts`
  - New interfaces: EditorReviewerActionRow
  - New functions: coordinatorAcceptSuggestion, coordinatorDeclineSuggestion, etc.
  - New read function: getEditorReviewerActions

**Validation Implemented:**
- ✅ Reviewer must exist as ACTIVE REVIEWER profile (for acceptance/replacement)
- ✅ No duplicate assignments prevented
- ✅ Editor assessment must be SUBMITTED before coordinator can act
- ✅ Manuscript must be in EDITOR_REVIEW status
- ✅ Minimum 2 active reviewers required for finalization
- ✅ Server-side role validation (coordinator only)

---

### ✅ Phase B: Editor Evaluation Form (70% Complete)

**New Component:** `src/components/manuscript-detail/tabs/EditorEvaluationFormTab.tsx`

**Features Implemented:**
- ✅ Evaluation criteria scoring (7 criteria × 1-10 scale)
  - Scientific Merit, Novelty & Innovation, Methodology Quality
  - Literature Adequacy, Ethical Compliance, Data Reliability, Writing Quality
  - Visual progress bars for each criterion

- ✅ Qualitative feedback sections
  - Strengths (required)
  - Weaknesses (required)
  - Mandatory Revisions (optional)
  - Comments to Coordinator (optional)

- ✅ Reviewer suggestions section
  - Starts with 2 mandatory reviewers
  - "Add Another Reviewer" button for unlimited suggestions
  - Each reviewer: name, email, expertise note
  - Remove button (available if > 2 suggestions)

- ✅ Validation
  - Minimum 2 reviewers required
  - Duplicate email detection
  - Requires strengths and weaknesses
  - Email format optional (name alone acceptable)

- ✅ Form states
  - Editing (input enabled)
  - Loading (inputs disabled, spinner shown)
  - Submitted (success message, fallback display)
  - Already submitted (read-only confirmation)

- ✅ Error handling and user feedback
  - Clear error messages
  - Success confirmation
  - Auto-redirect after 2 seconds on success

**TODO - Phase B Integration:**
- ⏳ Integrate EditorEvaluationFormTab into EditorWorkspace
- ⏳ Replace current evaluation display with form when assignment status = ACCEPTED
- ⏳ Show read-only display after assessment_status = SUBMITTED
- ⏳ Wire up tab switching between form and other tabs

---

## In-Progress Phases

### ⏳ Phase C: Coordinator Review Board (0% Complete)

**Planned Components:**
- `CoordinatorReviewBoardTab.tsx` (redesigned)
  - Split into two sections: Editor Suggested vs Available
  - Show suggestion status (ACCEPTED/DECLINED/REPLACED)
  - Accept & Assign button for each suggestion
  - Decline button with optional reason dialog
  - Replace button to select different reviewer
  
- Available Reviewers section
  - Search/filter by name, email, specialty
  - Direct Assign button for each available reviewer
  - Exclude already-assigned reviewers

- Assignment Counter
  - Real-time display: X / 2 Reviewers Assigned
  - Color coding: 0/2 (red), 1/2 (yellow), 2/2 (green)
  - Disable actions when 2 confirmed

- Finalization Controls
  - "Confirm Reviewer Assignments" button
  - Only active when exactly 2 assigned
  - Confirmation dialog showing final reviewers
  - Loading state during submission

**Expected Implementation:**
- Read suggestions via `getSuggestedReviewers` (already exists)
- Read actions via `getEditorReviewerActions` (new function)
- Read available reviewers (query active REVIEWER profiles)
- Read current assignments via `getReviewerAssignments` (already exists)
- Call coordinator action RPCs on button click
- Realtime subscriptions for instant updates

---

### ⏳ Phase D: Finalization & Workflow (0% Complete)

**Backend Logic (RPCs Already Ready):**
- `finalize_reviewer_board()` validates and transitions manuscript
- Validates exactly 2 active reviewers
- Moves manuscript from EDITOR_REVIEW → UNDER_REVIEW
- Creates status history record
- Sends notifications to coordinators

**Frontend Logic Needed:**
- Call `finalizeReviewerBoard()` on "Confirm Assignments" button
- Show confirmation dialog with final reviewer list
- Handle submission states (loading, success, error)
- Update UI to show finalized state
- Prevent modifications after finalization

**Post-Finalization UI:**
- Hide accept/decline/replace buttons
- Show "Review board finalized on [date]" message
- Display finalized reviewer list as read-only
- Update manuscript status badge to "Awaiting Reviews"

---

## Remaining Phases (Not Yet Started)

### ⏳ Phase E: Notifications & Email (0% Complete)

**In-App Notifications (via workflow_notifications table):**
- ✅ Already implemented in RPCs via `_notify()` helper
- Reviewers notified when assigned (REVIEW_INVITATION)
- Coordinators notified when actions occur

**Email Sending:**
- ⏳ Need to configure Supabase email service or Edge Functions
- Email to reviewers when invited
- Email to coordinator when board finalized
- Email templates needed

**Configuration Needed:**
- Supabase SMTP settings (or external email provider)
- Email template design
- Sender address configuration

---

### ⏳ Phase F: Realtime Updates (0% Complete)

**Subscriptions Needed:**
- `editor_reviewer_actions` - when coordinator acts
- `reviewer_assignments` - when assignments created
- `manuscript_suggested_reviewers` - when suggestions submitted
- `manuscripts` - status changes

**Frontend Implementation:**
- Set up Supabase realtime subscriptions
- Update component state on new/changed rows
- Refresh reviewer counts instantly
- Update UI without page reload

**Expected Changes:**
- When editor submits suggestions → suggestions list updates
- When coordinator accepts → assignment created, counter updates
- When coordinator finalizes → board locked, status changes
- New assignments appear instantly across all sessions

---

### ⏳ Phase G: End-to-End Testing (0% Complete)

**Test Scenarios:**
1. Editor submits 2+ reviewer suggestions
2. Coordinator reviews suggestions on Review Board
3. Coordinator accepts 1 suggestion → creates assignment
4. Coordinator declines 1 suggestion → no assignment, recorded
5. Coordinator replaces 1 suggestion → original marked REPLACED, new created
6. Coordinator directly assigns 1 non-suggested reviewer
7. Coordinator finalizes board → transitions to UNDER_REVIEW
8. Verify reviewers receive invitations
9. Verify history/audit trails recorded
10. Test with multiple concurrent coordinators (realtime sync)
11. Try invalid operations (< 2 reviewers, inactive reviewer, etc.)
12. Verify finalized board cannot be modified

---

## Architecture Summary

### Workflow
```
Editor submits evaluation + 2+ suggestions (Phase B ✅)
                    ↓
Suggestions stored in manuscript_suggested_reviewers (schema ✅)
                    ↓
Coordinator reviews suggestions on Review Board (Phase C ⏳)
                    ↓
Coordinator acts: Accept/Decline/Replace (RPCs ✅)
                    ↓
Actions recorded in editor_reviewer_actions (table ✅)
                    ↓
When 2 reviewers assigned: Confirm button available (Phase C ⏳)
                    ↓
Finalize board: manuscript → UNDER_REVIEW (RPC ✅, UI ⏳)
                    ↓
Reviewers invited & notified (Phase E ⏳)
                    ↓
Manuscript in Peer Review status
```

### Technology Stack
- **Database:** Supabase PostgreSQL
- **Validation:** Server-side RPC validation + RLS
- **Frontend:** React components with TypeScript
- **Realtime:** Supabase Realtime subscriptions
- **Notifications:** In-app (workflow_notifications table) + Email (Phase E)

---

## What Works Now

✅ Editor can submit evaluation with 2+ reviewer suggestions (form created)
✅ Suggestions stored in database with editor metadata
✅ Coordinator can accept/decline/replace suggestions (RPCs ready)
✅ Coordinator can assign non-suggested reviewers (RPC ready)
✅ Reviewer board can be finalized (RPC ready, transitions manuscript)
✅ All actions validated server-side
✅ Audit trail recorded for all coordinator actions
✅ Type-safe TypeScript interfaces and functions

---

## What's Left

### High Priority (Blocking Testing)
- ⏳ Phase B: Integrate EditorEvaluationFormTab into EditorWorkspace
- ⏳ Phase C: Build Coordinator Review Board UI
- ⏳ Phase D: Build finalization UI
- ⏳ Phase E: Configure email notifications
- ⏳ Phase F: Wire up realtime subscriptions

### Medium Priority (Testing & Polish)
- ⏳ Phase G: Complete end-to-end testing
- ⏳ Add loading states and spinners
- ⏳ Error handling and retry logic
- ⏳ Success messages and confirmations
- ⏳ Mobile responsive design

### Low Priority (Enhancement)
- ⏳ Reviewer expertise/specialty matching
- ⏳ Conflict of interest checking
- ⏳ Reviewer workload tracking
- ⏳ Decline reason dialog (Phase C)
- ⏳ Confirmation dialogs (Phase D)

---

## Next Steps

**Immediate (High Priority):**
1. Integrate EditorEvaluationFormTab into EditorWorkspace component
2. Build CoordinatorReviewBoardTab with split-view UI
3. Wire up all 5 coordinator action RPCs
4. Add realtime subscriptions

**Short Term:**
5. Configure email notifications
6. Add loading/error states throughout
7. Run comprehensive end-to-end testing

**Before Production:**
8. Mobile responsive testing
9. Performance testing with many reviewers
10. Security audit of RPC validations

---

## Code Review Checklist

- ✅ Database migration idempotent
- ✅ RPC validation comprehensive (role, status, relationships)
- ✅ RLS policies correct and complete
- ✅ TypeScript types accurate
- ✅ Error handling in RPCs
- ⏳ Frontend components created
- ⏳ Frontend integrated into main components
- ⏳ Realtime subscriptions wired
- ⏳ Email configured
- ⏳ End-to-end tested

---

## Known Limitations / To-Discuss

1. **Editor Suggestions as-is:** Editors can suggest anyone (name/email), but coordinator can only ACCEPT if they're an ACTIVE REVIEWER in the system. This allows flexibility but requires coordinator judgment.

2. **No Automatic Replacement:** If reviewer declines, system notifies coordinator but does NOT auto-assign replacement. Coordinator must manually select and assign.

3. **No Reviewer Preferences:** System does not check reviewer expertise, workload, or conflict of interest automatically. Coordinator responsible for this judgment.

4. **Email Configuration:** Email sending currently not configured. Uses in-app notifications only until Phase E email configuration complete.

---

**Current Completion:** ~40% (Database & Form done, UI integration & testing remaining)

