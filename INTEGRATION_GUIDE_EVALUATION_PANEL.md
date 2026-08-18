# Integration Guide: EditorEvaluationPanel

## Quick Start

### 1. Import the Component

```typescript
import EditorEvaluationPanel from './EditorEvaluationPanel';
```

### 2. Add to Your Layout

The component works best in a flex layout with the main content area:

```typescript
export default function EditorWorkspaceView() {
  return (
    <div className="flex h-screen">
      {/* Main content area */}
      <main className="flex-1 overflow-auto bg-white">
        {/* Manuscript display, content tabs, etc. */}
      </main>

      {/* Evaluation sidebar */}
      <EditorEvaluationPanel
        currentEvaluation={2}
        totalEvaluations={5}
      />
    </div>
  );
}
```

### 3. Wire Up State Management

```typescript
import EditorEvaluationPanel, { EvaluationState } from './EditorEvaluationPanel';

export default function EditorWorkspaceView({ manuscriptId }) {
  const [evaluation, setEvaluation] = useState<EvaluationState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSaveDraft = async (state: EvaluationState) => {
    setIsSaving(true);
    try {
      const response = await supabase
        .rpc('save_evaluation_draft', {
          p_manuscript_id: manuscriptId,
          p_editor_id: currentUser.id,
          p_evaluation: state
        });
      
      // Show success notification
      showToast('Draft saved successfully', 'success');
    } catch (error) {
      showToast('Failed to save draft', 'error');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitEvaluation = async (state: EvaluationState) => {
    setIsSubmitting(true);
    try {
      const response = await supabase
        .rpc('submit_editor_assessment', {
          p_manuscript_id: manuscriptId,
          p_editor_id: currentUser.id,
          p_recommendation: state.recommendation,
          p_scores: state.criteria,
          p_comments_to_authors: state.commentsToAuthors,
          p_confidential_comments: state.confidentialComments,
          p_confidence: state.confidence
        });

      // Show success notification
      showToast('Evaluation submitted successfully', 'success');

      // Navigate to next manuscript or show completion message
      navigateToNextManuscript();
    } catch (error) {
      showToast('Failed to submit evaluation', 'error');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen">
      <main className="flex-1 overflow-auto bg-white">
        {/* Content */}
      </main>

      <EditorEvaluationPanel
        currentEvaluation={currentIndex}
        totalEvaluations={totalCount}
        initialState={evaluation}
        isSaving={isSaving}
        isSubmitting={isSubmitting}
        onSaveDraft={handleSaveDraft}
        onSubmitEvaluation={handleSubmitEvaluation}
      />
    </div>
  );
}
```

## Integration Points

### Loading Initial Evaluation

If resuming a draft:

```typescript
useEffect(() => {
  const fetchDraftEvaluation = async () => {
    try {
      const { data } = await supabase
        .from('editor_assignments')
        .select('assessment_draft')
        .eq('id', assignmentId)
        .single();

      if (data?.assessment_draft) {
        setEvaluation(data.assessment_draft);
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  };

  if (assignmentId) {
    fetchDraftEvaluation();
  }
}, [assignmentId]);
```

### Auto-Save on Scroll

Optionally auto-save draft while user works:

```typescript
const autoSaveTimeout = useRef<NodeJS.Timeout>();

const handleEvaluationChange = (newEvaluation: EvaluationState) => {
  setEvaluation(newEvaluation);

  // Clear previous timeout
  if (autoSaveTimeout.current) {
    clearTimeout(autoSaveTimeout.current);
  }

  // Set new timeout for auto-save (e.g., 5 seconds after last change)
  autoSaveTimeout.current = setTimeout(() => {
    handleSaveDraft(newEvaluation);
  }, 5000);
};

useEffect(() => {
  return () => {
    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current);
    }
  };
}, []);
```

### Success Notification

Show a toast/snackbar after submission:

```typescript
const handleSubmitEvaluation = async (state: EvaluationState) => {
  setIsSubmitting(true);
  try {
    await submitEvaluation(state);
    
    // Success notification
    if (notification) {
      setNotification({
        type: 'success',
        message: `✓ Evaluation submitted. Moving to next manuscript...`
      });
    }

    // Brief delay before navigation
    setTimeout(() => {
      navigateToNextManuscript();
    }, 1500);
  } catch (error) {
    // Error notification
    setNotification({
      type: 'error',
      message: `Failed to submit: ${error.message}`
    });
  } finally {
    setIsSubmitting(false);
  }
};
```

## Customization

### Custom Criteria

To use different evaluation dimensions:

**Option 1: Modify component**
Edit the `CRITERIA` constant in `EditorEvaluationPanel.tsx`:

```typescript
const CRITERIA = [
  { key: 'scientificRigor', label: 'Scientific Rigor' },
  { key: 'novelty', label: 'Novelty & Innovation' },
  { key: 'impact', label: 'Potential Impact' },
  // ... add or remove as needed
] as const;

// Update EvaluationState interface to match:
interface EvaluationState {
  criteria: {
    scientificRigor: number;
    novelty: number;
    impact: number;
  };
  // ... rest of fields
}
```

**Option 2: Make it configurable via props (recommended)**
```typescript
interface EditorEvaluationPanelProps {
  criteria?: Array<{ key: string; label: string }>;
  // ... other props
}
```

### Custom Recommendation Options

Edit `RECOMMENDATION_OPTIONS`:

```typescript
const RECOMMENDATION_OPTIONS = [
  { value: 'ACCEPT', label: 'Publish As-Is', color: 'green' },
  { value: 'MINOR_REVISION', label: 'Minor Changes', color: 'blue' },
  { value: 'MAJOR_REVISION', label: 'Major Revision', color: 'amber' },
  { value: 'REJECT', label: 'Decline', color: 'red' }
] as const;
```

### Styling Customization

Change the color theme by updating Tailwind classes:

**Blue → Emerald (for teal aesthetic)**:
- Replace `bg-blue-50` with `bg-emerald-50`
- Replace `border-blue-300` with `border-emerald-300`
- Replace `text-blue-900` with `text-emerald-900`
- Replace `bg-blue-600` with `bg-emerald-600`
- Replace `ring-blue-500` with `ring-emerald-500`

**Full color override**:
```bash
# Use sed to replace all blue references
sed -i 's/blue-600/emerald-600/g' EditorEvaluationPanel.tsx
sed -i 's/blue-50/emerald-50/g' EditorEvaluationPanel.tsx
# ... etc
```

### Layout Customization

**Wider sidebar (360px)**:
```typescript
<aside className="w-96 bg-slate-50 border-l border-slate-200 ...">
```

**Darker background**:
```typescript
<aside className="w-80 bg-slate-100 ...">
```

**Different separation border**:
```typescript
<aside className="w-80 bg-slate-50 border-l-2 border-l-blue-600 ...">
```

## Responsive Behavior

### Desktop Layout
```
┌────────────────────────────┬──────────────────────┐
│                            │                      │
│     Main Content           │  Evaluation Panel    │
│     (flex-1)               │  (w-80, fixed)       │
│                            │                      │
│                            │                      │
└────────────────────────────┴──────────────────────┘
```

### Tablet Layout (Optional)
```
┌────────────────────────────┬─────────────────┐
│                            │  Eval Panel     │
│     Main Content           │  (w-64)         │
│     (flex-1)               │                 │
│                            │                 │
└────────────────────────────┴─────────────────┘
```

### Mobile Layout (Optional)
```
┌──────────────────────────────┐
│      Main Content            │
│      (full width)            │
│                              │
├──────────────────────────────┤
│  Evaluation Panel (drawer)   │
│  (slides up from bottom)     │
└──────────────────────────────┘
```

To implement mobile drawer version, wrap component in a conditional:

```typescript
{windowWidth < 768 ? (
  <Drawer open={showEvaluation} onClose={() => setShowEvaluation(false)}>
    <EditorEvaluationPanel {...props} />
  </Drawer>
) : (
  <EditorEvaluationPanel {...props} />
)}
```

## Database Integration

### Required RPC Functions

```sql
-- Save evaluation draft
create or replace function save_evaluation_draft(
  p_manuscript_id text,
  p_editor_id uuid,
  p_evaluation jsonb
) returns void as $$
begin
  update editor_assignments
  set assessment_draft = p_evaluation
  where manuscript_id = p_manuscript_id
    and editor_id = p_editor_id;
end;
$$ language plpgsql;

-- Submit evaluation
create or replace function submit_editor_assessment(
  p_manuscript_id text,
  p_editor_id uuid,
  p_recommendation text,
  p_scores jsonb,
  p_comments_to_authors text,
  p_confidential_comments text,
  p_confidence text
) returns void as $$
begin
  update editor_assignments
  set 
    assessment_status = 'SUBMITTED',
    recommendation = p_recommendation,
    scores = p_scores,
    comments_to_authors = p_comments_to_authors,
    confidential_comments = p_confidential_comments,
    confidence = p_confidence,
    assessment_submitted_at = now(),
    assessment_draft = null
  where manuscript_id = p_manuscript_id
    and editor_id = p_editor_id;
end;
$$ language plpgsql;
```

### Schema Updates

Add these columns to `editor_assignments` table:

```sql
alter table editor_assignments add column if not exists assessment_draft jsonb;
alter table editor_assignments add column if not exists scores jsonb;
alter table editor_assignments add column if not exists comments_to_authors text;
alter table editor_assignments add column if not exists confidential_comments text;
alter table editor_assignments add column if not exists confidence text;
alter table editor_assignments add column if not exists recommendation text;
alter table editor_assignments add column if not exists assessment_submitted_at timestamp;
```

## Testing

### Manual Testing Checklist

- [ ] Recommendation selection updates summary card
- [ ] Criteria ratings update as you click buttons
- [ ] Comments text areas accept input
- [ ] Confidence level can be toggled
- [ ] Save Draft button is clickable and shows loading state
- [ ] Submit Evaluation is disabled until required fields filled
- [ ] Validation errors display when trying to submit incomplete
- [ ] Scrolling in content area doesn't affect sticky header/actions
- [ ] Focus states are visible on all interactive elements
- [ ] Keyboard navigation works (Tab through controls)
- [ ] Responsive sizing on different viewport widths

### Component Testing (Jest/Vitest)

```typescript
describe('EditorEvaluationPanel', () => {
  it('should update recommendation when clicked', () => {
    const { getByText } = render(<EditorEvaluationPanel />);
    fireEvent.click(getByText('Accept'));
    expect(evaluation.recommendation).toBe('ACCEPT');
  });

  it('should calculate criteria completed correctly', () => {
    // Test that criteriaCompleted updates with each rating
  });

  it('should disable submit button when incomplete', () => {
    const { getByText } = render(<EditorEvaluationPanel />);
    expect(getByText('Submit Evaluation')).toBeDisabled();
  });

  it('should enable submit when all required fields set', () => {
    // Fill all required fields
    // Assert submit button is enabled
  });
});
```

## Troubleshooting

### Component Not Appearing

**Issue**: Sidebar not visible on page

**Solutions**:
1. Check parent container has `display: flex` or proper layout
2. Verify sidebar width class is applied (`w-80`)
3. Ensure parent height is set to `h-screen`
4. Check z-index conflicts with other elements

### Sticky Header/Actions Not Working

**Issue**: Header scrolls with content

**Solutions**:
1. Verify parent container has `overflow-hidden`
2. Check that header/actions containers have `shrink-0`
3. Ensure scrollable content area has `flex-1 overflow-y-auto`

### Form Data Not Persisting

**Issue**: Entered data clears when scrolling

**Solutions**:
1. Data is stored in React state (doesn't clear on scroll)
2. Check for accidental state reset in parent component
3. Verify initialState prop is not being recreated each render

### Validation Not Triggering

**Issue**: Submit button allows incomplete submissions

**Solutions**:
1. Check that validation function is called in handleSubmitEvaluation
2. Verify required field checks match your business logic
3. Add debug logging to validateEvaluation()

## Performance Tips

1. **Memoize callbacks**: Use `useCallback` for onSaveDraft/onSubmitEvaluation
2. **Lazy load**: Defer loading evaluation panel until needed
3. **Debounce auto-save**: Wait 5+ seconds before saving drafts
4. **Virtual scrolling**: If adding many more sections, consider virtualization

## Accessibility Checklist

- [x] All form inputs have associated labels
- [x] Color not the only indicator (icons, text also distinguish)
- [x] Focus indicators visible on all interactive elements
- [x] Keyboard navigation complete (Tab, Enter, Space)
- [x] Screen reader compatible (semantic HTML)
- [x] Error messages clear and actionable
- [x] Sufficient color contrast (WCAG AA)

## Summary

The EditorEvaluationPanel is a self-contained, professional evaluation form that:

✅ Requires no additional dependencies beyond React + Tailwind  
✅ Handles all evaluation workflows with clear visual hierarchy  
✅ Provides validation feedback without being obstructive  
✅ Scales to mobile/tablet with minimal code changes  
✅ Integrates with any backend via simple callbacks  
✅ Is fully customizable via component props  

For questions or issues, refer to `EDITOR_EVALUATION_PANEL_DESIGN.md` for detailed design documentation.
