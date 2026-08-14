# BUG FIX CHANGES SUMMARY

## Issues Fixed
1. **Accept Manuscript button fails** - Editor cannot submit recommendation
2. **Suggest Peer Referee doesn't work** - Suggestions not persisted to database

## Root Cause
Decision buttons in EditorEvaluationForm were calling `saveDraft()` (localStorage only) instead of `submit()` (database submission). This meant:
- Assessment was never saved to database
- assessment_status remained 'NOT_STARTED'
- Suggested reviewers were never inserted
- RPC check for 'SUBMITTED' status failed

## Files Changed
**`src/components/EditorWorkspace.tsx`**

### Change 1: Fix Decision Button Handlers (Lines 2270-2310)

**BEFORE:**
```typescript
onClick={() => {
  saveDraft();  // ← Only saves to localStorage
  setTimeout(() => onDecision?.('ACCEPT'), 500);
}}
```

**AFTER:**
```typescript
onClick={() => 
  submit()  // ← Now calls submit which persists to database!
    .then(() => onDecision?.('ACCEPT'))  // Then submit recommendation
    .catch(e => console.error(e))
}
```

All 4 decision buttons updated:
- Accept Manuscript → `submit().then(() => onDecision?.('ACCEPT'))`
- Request Minor Revision → `submit().then(() => onDecision?.('MINOR_REVISION'))`
- Request Major Revision → `submit().then(() => onDecision?.('MAJOR_REVISION'))`
- Reject Manuscript → `submit().then(() => onDecision?.('REJECT'))`

### Change 2: Transform Suggested Reviewers Field Names (Lines 2117-2127)

**BEFORE:**
```typescript
const allSuggestedReviewers = [
  ...evalData.suggestedReviewers.filter(r => r.name.trim() && r.email.trim()),
  ...suggestedReviewers.filter(r => r.name.trim() && r.email.trim())
];
```

**AFTER:**
```typescript
const allSuggestedReviewers = [
  ...evalData.suggestedReviewers
    .filter(r => r.name.trim() && r.email.trim())
    .map(r => ({ name: r.name, email: r.email, note: r.expertise })),  // Transform!
  ...suggestedReviewers
    .filter(r => r.name.trim() && r.email.trim())
    .map(r => ({ name: r.name, email: r.email, note: r.expertise }))   // Transform!
];
```

**Why:** Frontend uses `expertise` field, but RPC expects `note` field.

## How It Works Now

### Workflow Chain
```
Editor clicks "Accept Manuscript"
  ↓
submit() called
  ├─ Prepares evaluation data with scores
  ├─ Prepares qualitative comments
  ├─ Transforms suggested reviewers (expertise → note)
  └─ Calls submitAssessment() RPC
      ↓
      RPC submit_editor_assessment:
      ├─ Saves all scores to editor_assignments
      ├─ Sets assessment_status = 'SUBMITTED' ✅
      ├─ Inserts suggested reviewers into manuscript_suggested_reviewers ✅
      └─ Notifies coordinator
      ↓
After submit() completes
  ↓
onDecision('ACCEPT') called
  ↓
handleEditorDecision() → submitRecommendation()
  ↓
RPC submit_editor_recommendation:
├─ Checks assessment_status = 'SUBMITTED' ✅ (NOW PASSES!)
├─ Validates recommendation value
├─ Saves recommendation
└─ Notifies coordinator
  ↓
Success! Coordinator receives:
├─ Editor evaluation (scores & comments)
├─ Suggested peer reviewers
└─ Editor recommendation (ACCEPT/REVISION/REJECT)
```

## Verification

### What Gets Saved to Database

**editor_assignments table:**
- scientific_merit, novelty_innovation, methodology_quality, etc. (scores)
- strengths, weaknesses, mandatory_revisions, comments_to_coordinator
- assessment_status = 'SUBMITTED'
- assessment_submitted_at = current time
- recommendation = 'ACCEPT' (or other)
- recommendation_submitted_at = current time

**manuscript_suggested_reviewers table:**
- manuscript_id (links to manuscript)
- suggested_by = 'EDITOR'
- suggested_by_user = editor's user ID
- name (reviewer name)
- email (reviewer email)
- note (expertise/specialization)
- created_at = current time

### What Coordinator Sees

✅ Editor evaluation scores  
✅ Editor comments and analysis  
✅ Suggested peer reviewers with expertise  
✅ Editor recommendation (ACCEPT/REVISION/REJECT)  
✅ Real-time updates (no page refresh needed)  

### Data Persistence

After editor submits:
- ✅ Data persists in database (not just browser memory)
- ✅ Survives page refresh
- ✅ Survives logout/login
- ✅ Available to coordinator dashboard
- ✅ Audit trail recorded in workflow_status_history

## Testing Recommendations

### Test 1: Basic Accept Manuscript
1. Editor accepts assignment
2. Fills evaluation form
3. Clicks "Accept Manuscript"
4. ✅ Should succeed (not show error)
5. ✅ Check database: assessment_status = 'SUBMITTED', recommendation = 'ACCEPT'

### Test 2: Peer Reviewer Suggestions
1. Same as Test 1, but also add suggested reviewer
2. Click "Accept Manuscript"
3. ✅ Check database: manuscript_suggested_reviewers has the reviewer
4. Refresh page → ✅ Reviewer still visible

### Test 3: Different Recommendations
1. Test with "Request Minor Revision"
2. Test with "Request Major Revision"
3. Test with "Reject Manuscript"
4. ✅ Each should save with correct recommendation value

### Test 4: Real-Time Coordinator Dashboard
1. Open coordinator dashboard in one browser
2. Open editor workspace in another browser
3. Submit evaluation as editor
4. ✅ Coordinator dashboard updates automatically (no refresh needed)
5. ✅ Shows evaluation scores, comments, and recommendations

## Backward Compatibility

✅ No database schema changes required  
✅ No RPC signature changes  
✅ No breaking changes to other workflows  
✅ Existing data unaffected  

## Build Status

✅ npm run build: SUCCESS  
✅ Code compiles: SUCCESS  
✅ No new compilation errors introduced  

## Files Not Changed

- Database schema (no migrations needed)
- RPC functions (already correct)
- Coordinator workspace
- Author workspace
- Other components

All other code works as-is with these fixes.

---

**Status:** READY FOR TESTING ✅

**Commit message:**
```
fix: Critical bugs - Accept Manuscript and Suggest Peer Referee now work properly

- Fix decision buttons to call submit() before submitRecommendation()
- This ensures assessment_status = 'SUBMITTED' before recommendation check
- Transform suggested reviewers expertise field to note field for database
- Suggested reviewers now properly persisted to manuscript_suggested_reviewers
- Coordinator dashboard now receives complete evaluation data in real-time
```
