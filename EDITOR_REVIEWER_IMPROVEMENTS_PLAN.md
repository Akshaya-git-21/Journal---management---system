# Editor/Reviewer Improvements Implementation Plan

**Status:** Ready for Implementation  
**Priority:** HIGH

---

## Issue 1: Evaluation Reasons Display Below Scores

### Problem
Evaluation reasons entered by editors/reviewers are not displayed below their corresponding scores in the evaluation tab view.

### Solution
**File:** `src/components/manuscript-detail/tabs/EditorEvaluationTab.tsx`

**Implementation:**
1. Create a read-only view component that displays:
   - Score (1-10)
   - Reason below the score
   - Proper formatting and styling

**Code Example:**
```javascript
const DisplayEvaluationCriteria = ({ scores, reasons }) => (
  <div className="space-y-6">
    {CRITERIA.map((criterion) => (
      <div key={criterion.key} className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-slate-900">{criterion.label}</h4>
          <div className="text-2xl font-bold text-emerald-600">
            {scores[criterion.key]}/10
          </div>
        </div>
        
        {/* Reason below score */}
        {reasons[criterion.key] && (
          <div className="bg-slate-50 p-3 rounded border-l-2 border-emerald-600">
            <p className="text-xs font-semibold text-slate-600 mb-1">REASONING:</p>
            <p className="text-sm text-slate-700">{reasons[criterion.key]}</p>
          </div>
        )}
      </div>
    ))}
  </div>
);
```

**Testing:**
- [ ] View submitted evaluation
- [ ] Verify scores display (1-10)
- [ ] Verify reasons appear below scores
- [ ] Check formatting on mobile

---

## Issue 2: Fix Reviewer Account Creation & Temporary Password

### Problem
Reviewer account creation with temporary password is not working properly.

### Files Involved
- `src/lib/auth.ts` - `createReviewerAccount()` function (line 175)
- `src/components/CoordinatorWorkspace.tsx` - Account creation form

### Root Cause Analysis
1. Check if password is being hashed/stored correctly
2. Check if temporary password generation is working
3. Verify email verification is not blocking account access
4. Ensure role assignment is correct

### Fix Implementation

**Step 1:** Verify password storage in `createReviewerAccount()`
```javascript
export async function createReviewerAccount(
  email: string, 
  password: string, 
  fullName: string, 
  specialization: string
): Promise<{ temporaryPassword: string }> {
  // Ensure password meets requirements
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  
  // Create account and return temp password
  await createUserAccount(email, password, fullName, 'REVIEWER', {
    specialization,
    invited_by: 'coordinator',
    created_without_email: true,
    needs_password_reset: false  // Don't force reset immediately
  });
  
  return { temporaryPassword: password };
}
```

**Step 2:** Update account creation form to display temp password
```javascript
const [tempPassword, setTempPassword] = useState<string | null>(null);

const handleCreateReviewer = async () => {
  try {
    const result = await createReviewerAccount(email, password, name, specialization);
    setTempPassword(result.temporaryPassword);
    showSuccessMessage('Account created successfully');
  } catch (error) {
    showErrorMessage(error.message);
  }
};

// Display temp password in modal
{tempPassword && (
  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
    <p className="text-sm font-bold text-emerald-900 mb-2">Temporary Password:</p>
    <code className="bg-white p-2 rounded border border-emerald-200 text-sm text-slate-900">
      {tempPassword}
    </code>
    <button onClick={() => copyToClipboard(tempPassword)}>
      Copy to Clipboard
    </button>
  </div>
)}
```

**Testing:**
- [ ] Create reviewer account with temp password
- [ ] Verify temp password displays
- [ ] Log in with temp password
- [ ] Verify reviewer can access workspace
- [ ] Check if password reset needed on first login

---

## Issue 3: Fix Editor Account Creation & Temporary Password

### Problem
Editor account creation with temporary password is not working properly.

### Files Involved
- `src/lib/auth.ts` - `createEditorAccount()` function (line 166)
- `src/components/CoordinatorWorkspace.tsx` - Account creation form

### Fix Implementation
**Same as Issue 2** - Apply identical fix to `createEditorAccount()`:

```javascript
export async function createEditorAccount(
  email: string,
  password: string,
  fullName: string,
  specialization: string,
  editorialRole: string
): Promise<{ temporaryPassword: string }> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  
  await createUserAccount(email, password, fullName, 'EDITOR', {
    specialization,
    editorial_role: editorialRole,
    invited_by: 'coordinator',
    created_without_email: true,
    needs_password_reset: false
  });
  
  return { temporaryPassword: password };
}
```

**Testing:**
- [ ] Create editor account with temp password
- [ ] Verify temp password displays
- [ ] Log in with temp password
- [ ] Verify editor can access workspace
- [ ] Test all editor features work

---

## Issue 4: Add Assignment Confirmation Dialog

### Problem
Users can accidentally assign editors/reviewers without confirmation, leading to errors.

### Solution
Add confirmation dialog before any assignment action.

### Files to Modify

**1. OverviewTab.tsx (Editor Assignment)**
```javascript
const [showConfirmation, setShowConfirmation] = useState(false);
const [assignmentInProgress, setAssignmentInProgress] = useState(false);

// Before assignment, show confirmation
const handleAssignEditorClick = () => {
  setShowConfirmation(true);
};

// Confirmation approved
const handleConfirmAssignment = async () => {
  setAssignmentInProgress(true);
  try {
    await assignEditor(manuscript.id, selectedEditorId);
    setShowConfirmation(false);
    await load();
  } catch (error) {
    showErrorMessage(error.message);
  } finally {
    setAssignmentInProgress(false);
  }
};
```

**2. Confirmation Dialog Component**
```javascript
const AssignmentConfirmationDialog = ({
  isOpen,
  editorName,
  manuscriptTitle,
  onConfirm,
  onCancel,
  isLoading
}) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="bg-blue-600 text-white p-6 rounded-t-2xl">
          <h2 className="text-lg font-bold">Confirm Assignment</h2>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-slate-700">
            Do you confirm the assignment of
            <strong className="block text-slate-900 mt-2">{editorName}</strong>
            to evaluate
            <strong className="block text-slate-900">{manuscriptTitle}</strong>
          </p>
          
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Assigning...' : 'Confirm Assign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

**Testing:**
- [ ] Click assign button → confirmation dialog appears
- [ ] Click Cancel → dialog closes, no assignment
- [ ] Click Confirm Assign → assignment proceeds
- [ ] Verify loading state shows
- [ ] Check error handling if assignment fails

---

## Implementation Priority

**1. Fix Reviewer Account Creation** (Quick win, blocking)
**2. Fix Editor Account Creation** (Quick win, blocking)
**3. Add Assignment Confirmation Dialog** (UX improvement)
**4. Display Evaluation Reasons Below Scores** (Display improvement)

---

## Testing Checklist

### Reviewer Account Creation
- [ ] Create reviewer account
- [ ] Temp password displays
- [ ] Can copy password
- [ ] Can log in with temp password
- [ ] Reviewer workspace accessible

### Editor Account Creation
- [ ] Create editor account
- [ ] Temp password displays
- [ ] Can copy password
- [ ] Can log in with temp password
- [ ] Editor workspace accessible

### Assignment Confirmation
- [ ] Assign editor shows dialog
- [ ] Assign reviewers shows dialog
- [ ] Cancel works
- [ ] Confirm works
- [ ] Loading state displays

### Evaluation Reasons Display
- [ ] View submitted evaluation
- [ ] Scores display correctly
- [ ] Reasons appear below scores
- [ ] Formatting is clean
- [ ] Mobile display works

---

## Files to Modify Summary

| File | Changes | Priority |
|------|---------|----------|
| `src/lib/auth.ts` | Fix reviewer/editor account creation | P1 |
| `src/components/CoordinatorWorkspace.tsx` | Display temp password, add confirmation dialog | P1-P2 |
| `src/components/manuscript-detail/tabs/OverviewTab.tsx` | Add assignment confirmation dialog | P2 |
| `src/components/manuscript-detail/tabs/EditorEvaluationTab.tsx` | Display evaluation reasons below scores | P3 |

---

## Notes

- All changes are backward compatible
- No database schema changes needed
- No API changes required
- Ready for immediate implementation

