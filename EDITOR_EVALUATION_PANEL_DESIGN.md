# Editor Evaluation Panel - Design & Implementation Guide

## Overview

A professional, modern right-sidebar component for the Editor Evaluation / Peer Review page. The panel provides a complete evaluation workflow with recommendation selection, criteria rating, and comment management in a compact, scannable interface.

## Component: `EditorEvaluationPanel.tsx`

### Props

```typescript
interface EditorEvaluationPanelProps {
  currentEvaluation?: number;        // Current manuscript number (e.g., 2)
  totalEvaluations?: number;         // Total manuscripts (e.g., 5)
  onSaveDraft?: (state: EvaluationState) => void;
  onSubmitEvaluation?: (state: EvaluationState) => void;
  initialState?: EvaluationState;
  isSaving?: boolean;                // Show loading state for draft save
  isSubmitting?: boolean;             // Show loading state for submission
}
```

### State Structure

```typescript
interface EvaluationState {
  recommendation: 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null;
  criteria: {
    originality: number;             // 1-5 rating
    methodology: number;
    clarity: number;
    significance: number;
    technicalQuality: number;
  };
  commentsToAuthors: string;
  confidentialComments: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}
```

## Layout & Structure

### Sidebar Container
- **Width**: 320px (fits precisely with 80px = w-80 Tailwind class)
- **Position**: Fixed/sticky to right side of viewport
- **Height**: Full screen (h-screen)
- **Background**: Slate-50 (#f8fafc equivalent)
- **Border**: 1px left border (slate-200) for separation
- **Scrolling**: Independent scroll within content area

### Visual Hierarchy

```
┌─ Header (Sticky, white background) ─────────────────┐
│ EDITOR EVALUATION                    [In Progress]   │
│ Assessment in progress                               │
│ Progress: 2 of 5 [████░░░░░░░░░░░░░░░]              │
├─ Scrollable Content ────────────────────────────────┤
│ Overall Recommendation                               │
│ [✓] Accept                                           │
│ [ ] Minor Revisions                                  │
│ [ ] Major Revisions                                  │
│ [ ] Reject                                           │
│                                                      │
│ Evaluation Criteria                                  │
│ Originality: [1] [2] [3] [4] [5]                    │
│ Methodology: [1] [2] [3] [4] [5]                    │
│ ... (5 criteria total)                               │
│                                                      │
│ Comments to Authors                                  │
│ [Multiline textarea]                                │
│                                                      │
│ 🔒 Confidential Comments                             │
│ Only visible to editor/coordinator                  │
│ [Multiline textarea]                                │
│                                                      │
│ Confidence Level                                     │
│ [◉] Low [ ] Medium [ ] High                         │
│                                                      │
│ ┌─ Evaluation Summary ────────────────┐             │
│ │ Recommendation: Major Revisions     │             │
│ │ Confidence: High                    │             │
│ │ Criteria Rated: 4 / 5               │             │
│ └────────────────────────────────────┘             │
│                                                      │
│ [⚠] Validation errors (if any)                      │
├─ Sticky Actions (white background, top border) ────┤
│ [Secondary Button] Save Draft                       │
│ [Primary Button]   Submit Evaluation                │
└────────────────────────────────────────────────────┘
```

## Section-by-Section Design

### 1. Header Section (Sticky)

**Purpose**: Quick status overview + progress tracking

**Components**:
- **Title**: "EDITOR EVALUATION" (13px, semibold, uppercase)
- **Subtitle**: "Assessment in progress" (11px, gray, muted)
- **Status Badge**: Blue pill with icon (Clock icon + "In Progress")
- **Progress Tracker**:
  - Label: "Evaluation Progress" (11px, gray)
  - Current/Total: "2 of 5" (11px, bold)
  - Progress Bar: Thin blue bar (height: 6px, border-radius: full)

**Styling**:
```
Background: white
Border-bottom: 1px slate-200
Padding: 24px (6 Tailwind units)
Space between elements: 16px (4 Tailwind units)
```

### 2. Overall Recommendation (Radio Cards)

**Purpose**: Primary decision control—positioned near top for prominence

**Options**:
1. **Accept** - Green (#16a34a)
2. **Minor Revisions** - Blue (#3b82f6)
3. **Major Revisions** - Amber (#f59e0b)
4. **Reject** - Red (#ef4444)

**Card Styling**:
```
Unselected: white background, slate-200 border, slate-700 text
Selected: colored background (opacity 50), colored border (opacity 100), colored text

Example (when Minor Revisions selected):
bg-blue-50, border-blue-300, text-blue-900
```

**Radio Indicator**:
- **Unselected**: Empty circle with 2px border
- **Selected**: Filled circle with checkmark (white text)
- **Size**: 16px diameter

**Card Dimensions**:
- **Height**: 48px (3 Tailwind units)
- **Padding**: 12px (3 Tailwind units)
- **Border radius**: 8px
- **Spacing between cards**: 8px

### 3. Evaluation Criteria (1-5 Rating Buttons)

**Purpose**: Quick rating controls for 5 assessment dimensions

**Criteria**:
1. Originality
2. Methodology
3. Clarity
4. Significance
5. Technical Quality

**Rating Controls**:
- **Type**: Button grid (1-5)
- **Button Height**: 32px (8 Tailwind units)
- **Button Width**: Equal flex distribution (flex-1)
- **Button Spacing**: 4px (1 Tailwind unit)
- **Selected State**: Blue-500 background, white text, blue-600 border
- **Unselected State**: White background, slate-600 text, slate-200 border

**Current Value Display**:
- **Position**: Right of criterion name
- **Styling**: 11px, bold, slate-500 text
- **Placeholder**: "—" when no rating selected

**Spacing**:
- **Between criteria**: 16px
- **Name label to rating buttons**: 8px

### 4. Comments to Authors

**Purpose**: Public feedback section

**Component**:
- **Label**: "COMMENTS TO AUTHORS" (uppercase, 13px, bold)
- **Textarea**:
  - **Rows**: 4
  - **Placeholder**: "Provide constructive feedback for the authors..."
  - **Styling**: White background, slate-200 border, slate-900 text
  - **Focus State**: Ring-2 ring-blue-500, border transparent
  - **Font**: 13px
  - **Resize**: Disabled (resize-none)
  - **Padding**: 12px

### 5. Confidential Comments

**Purpose**: Private notes visible only to editor/coordinator

**Components**:
- **Header**:
  - **Icon**: Lock icon (16px, slate-400)
  - **Label**: "CONFIDENTIAL COMMENTS" (uppercase, 13px, bold)
- **Description**: "Only visible to the editor and coordinator" (11px, slate-500)
- **Textarea**:
  - **Rows**: 3
  - **Placeholder**: "These comments will only be visible to the editor/coordinator..."
  - **Background**: Slate-50 (muted appearance)
  - **Text**: Slate-700 (distinct from normal text)
  - **Border**: Slate-200

**Visual Distinction**:
- Subtle lock icon signals confidentiality
- Muted background color (slate-50) vs. white for public comments
- Darker text (slate-700) vs. slate-900

### 6. Confidence Level

**Purpose**: Indicator of evaluator's confidence in assessment

**Options**:
- Low
- Medium
- High

**Styling**:
- **Type**: Segmented buttons (similar to recommendation, but simpler)
- **Selected**: Blue-50 background, blue-300 border, blue-900 text
- **Unselected**: White background, slate-200 border, slate-700 text
- **Height**: 40px (10 Tailwind units)
- **Spacing**: 8px between buttons

### 7. Evaluation Summary Card

**Purpose**: Compact readout of current evaluation state

**Layout**:
```
┌────────────────────────────┐
│ EVALUATION SUMMARY         │
├────────────────────────────┤
│ Recommendation: Accept     │
│ Confidence: High           │
│ Criteria Rated: 3 / 5      │
└────────────────────────────┘
```

**Styling**:
- **Card**: White background, slate-200 border, 8px border-radius
- **Padding**: 16px
- **Internal spacing**: 12px between rows

**Each Row**:
- **Label**: 11px, bold, uppercase, slate-500 (right-aligned)
- **Value**: 13px, bold, slate-900
- **Placeholder**: "—" (slate-400) when no value selected

**Responsive to State**:
- Recommendation: Shows selected option label or "—"
- Confidence: Shows selected level or "—"
- Criteria: Shows "X / 5" (e.g., "3 / 5")

### 8. Validation Error Display (Conditional)

**Purpose**: Provide clear feedback on missing required fields

**Components**:
- **Container**: Amber-50 background, amber-200 border, 8px border-radius
- **Padding**: 12px
- **Internal spacing**: 8px between errors

**Each Error**:
- **Icon**: AlertCircle (16px, amber-600)
- **Text**: 12px, amber-800
- **Layout**: Flexbox with gap

**Errors Checked**:
1. "Please select a recommendation"
2. "Please rate at least one criterion"
3. "Comments to authors are required"

**Timing**: Only displayed when user attempts to submit with incomplete fields

### 9. Action Buttons (Sticky)

**Purpose**: Submission workflow controls

**Layout**:
```
[Save Draft Button]
[Submit Evaluation Button]
```

**Spacing**: 8px between buttons, 24px padding all around

**Save Draft Button**:
- **Type**: Secondary button
- **Styling**: White background, slate-300 border, slate-700 text
- **Hover**: Slate-50 background
- **Disabled**: Opacity 50%
- **Label**: "Save Draft" or "Saving Draft..." (when isSaving=true)

**Submit Evaluation Button**:
- **Type**: Primary button (prominently blue)
- **Styling**: Blue-600 background, white text
- **Hover**: Blue-700 background
- **Icon**: Send icon (16px, white)
- **Gap**: 8px between icon and text
- **Disabled Condition**:
  - When `isSubmitting=true` → show loading state with "Submitting..."
  - When required fields incomplete (`!hasRequiredFields`) → disabled with opacity 75%
- **Required Fields**:
  - Recommendation selected (not null)
  - At least one criterion rated (criteriaCompleted > 0)
  - Optionally: comments to authors filled

**Sticky Positioning**:
- **Background**: White
- **Border-top**: 1px slate-200
- **Position**: Always visible at bottom of sidebar, doesn't scroll away
- **Padding**: 24px

## Visual Design System

### Colors

**Primary (Interactive)**:
- Blue-600: Primary buttons, selected states
- Blue-500: Progress bar, focus rings
- Blue-50: Selected radio cards, confidence buttons

**Success/Acceptance**:
- Green (#16a34a): Accept recommendation
- Green-50: Selected Accept card

**Warnings/Revisions**:
- Amber (#f59e0b): Major Revisions recommendation
- Amber-50: Selected Major Revisions card
- Amber-200: Validation error borders

**Neutral**:
- Slate-900: Primary text, headings
- Slate-700: Secondary text
- Slate-500: Tertiary text, labels
- Slate-400: Disabled text, placeholders
- Slate-300: Borders (light), disabled buttons
- Slate-200: Borders (standard)
- Slate-50: Muted backgrounds (sidebar, confidential section)
- White: Card backgrounds, containers

**Destructive**:
- Red (#ef4444): Reject recommendation
- Red-50: Selected Reject card

### Typography

**Headings**:
- Section titles: 13px, semibold, uppercase, tracking-wide, slate-900
- Card titles: Same as section titles

**Body Text**:
- Standard: 13px, normal weight, slate-900
- Secondary: 13px, normal weight, slate-700
- Tertiary: 11px, normal weight, slate-500

**Labels**:
- 11px, bold, uppercase, slate-500 (in summary cards)
- 11px, normal, slate-500 (helper text)

**Buttons**:
- 13px, semibold

### Spacing

**Horizontal**:
- Component padding: 24px (6 units)
- Internal spacing: 16px (4 units), 12px (3 units), 8px (2 units)
- Button gaps: 8px (2 units)

**Vertical**:
- Section spacing: 24px (6 units)
- Element spacing: 12px (3 units)
- Button spacing: 8px (2 units)

### Border Radius

- Cards: 8px
- Buttons: 8px
- Full round (radio indicators): Full

### Borders

- Standard: 1px, slate-200
- Accent/Hover: 1px, slate-300
- Selected: 2px, color-specific (blue, green, amber, red)

## Interaction Patterns

### Recommendation Selection

**Interaction**:
1. Click radio card
2. Card background changes to light color variant
3. Radio indicator fills with color
4. Summary card updates with selected option

**Accessibility**: Radio buttons use native semantics with custom styling

### Criteria Rating

**Interaction**:
1. Click number button (1-5)
2. Button background turns blue-500, text white
3. Current value display updates
4. Summary card updates criteria count

**Multiple Ratings**: Can rate multiple criteria. Each criterion is independent.

### Comments Editing

**Interaction**:
1. Click textarea
2. Focus ring appears (ring-2 ring-blue-500)
3. Type freely
4. State updates on change (no submission needed)

**Validation**: Checked only on submit attempt

### Draft Saving

**Interaction**:
1. Click "Save Draft"
2. Button enters loading state ("Saving Draft...")
3. Callback invoked with current evaluation state
4. Success indicator shown (optional via parent)

### Evaluation Submission

**Interaction**:
1. Complete required fields
2. Click "Submit Evaluation"
3. Validation runs (checks required fields)
4. If valid:
   - Button enters loading state ("Submitting...")
   - Callback invoked with evaluation state
   - Parent handles API submission
5. If invalid:
   - Validation errors display above buttons
   - User can see what's missing

**Required Fields**:
- Recommendation selected
- At least one criterion rated
- (Comments to authors can be made optional by removing from validation)

## Responsive Behavior

### Desktop (≥1024px)
- Fixed right sidebar, 320px width
- Full viewport height
- Independent scrolling within content area
- Sticky header and actions

### Tablet (768px-1023px)
- Reduced sidebar width (280px) or full-width drawer
- Same layout structure
- Sticky header/actions remain functional

### Mobile (<768px)
- Full-width drawer/bottom sheet
- Can slide up from bottom or overlay
- Same functionality, optimized for touch
- Full-width buttons for easier tapping

## Integration Example

```typescript
import EditorEvaluationPanel from './EditorEvaluationPanel';

function EditorWorkspaceView() {
  const [evaluation, setEvaluation] = useState<EvaluationState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSaveDraft = async (state: EvaluationState) => {
    setIsSaving(true);
    try {
      await saveDraftEvaluation(manuscriptId, state);
      // Show success toast
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitEvaluation = async (state: EvaluationState) => {
    setIsSubmitting(true);
    try {
      await submitEvaluation(manuscriptId, state);
      // Navigate to next manuscript or show success
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Manuscript content */}
      </main>

      {/* Evaluation sidebar */}
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

## Accessibility Features

- **Semantic Radio/Checkbox Elements**: Native input semantics for screen readers
- **Focus Indicators**: Visible focus rings on all interactive elements
- **Keyboard Navigation**: Tab through all controls, Enter/Space to activate
- **Color Contrast**: All text meets WCAG AA standards (4.5:1 for normal text)
- **Labels**: All form elements have associated labels
- **Error Messages**: Clear, actionable error text

## Performance Considerations

- **No External Dependencies**: Only Lucide React icons (already used elsewhere)
- **Memoization**: Calculation of `criteriaCompleted` and `hasRequiredFields` happens on every render, but it's O(n) where n=5, negligible impact
- **State Management**: Simple local state with callbacks to parent; no complex subscriptions
- **Scrolling**: Native scrolling with hardware acceleration (no custom scroll logic)

## Customization Points

**Colors**: All colors are in Tailwind classes, easily themeable:
- Change `blue-600` to `emerald-600` for different primary
- Update recommendation option colors in `RECOMMENDATION_OPTIONS`

**Criteria**: Modify `CRITERIA` array to add/remove/rename assessment dimensions

**Validation Rules**: Extend `validateEvaluation()` function with additional checks

**Action Labels**: Update button text strings for different workflows

## File Location

`src/components/EditorEvaluationPanel.tsx`

## Dependencies

- React 18+
- Lucide React (for Lock, AlertCircle, Send, Clock icons)
- Tailwind CSS 3.0+
- TypeScript 4.5+

## Testing Recommendations

### Unit Tests
- State updates correctly on each interaction
- Validation logic catches incomplete evaluations
- Summary card displays correct values

### Integration Tests
- Sidebar renders within editor workspace layout
- Scrolling works independently from main content
- Sticky header/actions stay visible
- Save/Submit callbacks fire with correct data

### E2E Tests
- Complete evaluation workflow end-to-end
- Validate form submission with incomplete fields
- Test on multiple viewport sizes
- Keyboard navigation

## Future Enhancements

1. **Undo/Redo**: Allow reverting recent changes
2. **Template Comments**: Predefined comment snippets
3. **Criteria Weights**: Assign importance to each criterion
4. **Rubric Integration**: Load scoring rubric from database
5. **Comparison Mode**: Side-by-side with previous evaluations
6. **Export**: Download evaluation as PDF
7. **Multi-step Wizard**: Break evaluation into steps for complex workflows
8. **Collaboration**: Real-time co-evaluation with another editor
