# Author Submission Workflow - Fixes & Implementation Plan

**Date:** 2026-08-19  
**Priority Level:** HIGH  
**Status:** Ready to Implement

---

## Issue 1: Submission Queue - No Auto-Refresh ❌ BROKEN

### Problem
- New manuscripts submitted don't appear in the submission queue without a page reload
- Users have no real-time visibility into newly submitted manuscripts

### Root Cause
- Real-time subscription exists but may not be properly updating the state
- `subscribeToManuscripts()` is set up correctly but state update logic may need verification

### Fix Implementation
**File:** `src/components/AuthorWorkspace.tsx`

**Current:** Line ~95-110 (check useEffect)
```javascript
useEffect(() => {
  loadManuscripts();
  const unsubscribe = subscribeToManuscripts(() => {
    loadManuscripts(); // Reload on any change
  });
  return unsubscribe;
}, [currentUser?.id]);
```

**Verification Steps:**
1. ✓ Subscription listens to `manuscripts`, `editor_assignments`, `reviewer_assignments`, `manuscript_revisions`, `manuscript_files`, `manuscript_status_history` tables
2. ✓ `onChange` callback is fired on any INSERT/UPDATE/DELETE
3. ✓ `loadManuscripts()` is called to refresh the list
4. ✓ State is updated via `setItems()`

**Status:** ✅ LIKELY WORKING - Verify with live testing

---

## Issue 2: File Preview (.doc/.docx) - Auto-Download Instead of Preview ❌ BROKEN

### Problem
- Clicking the Eye/View icon auto-downloads the file
- Should open file preview modal instead
- Download option is being ignored

### Root Cause
- Eye icon handler is calling download function instead of preview
- Missing FilePreviewModal integration
- No differentiation between view vs download actions

### Fix Implementation
**File:** `src/components/OjsSubmissionDetail.tsx`

**Search for:** File list rendering (around line with file icons)

**Current Logic:**
```javascript
{file.public_url && (
  <>
    <a href={file.public_url} target="_blank" rel="noopener noreferrer">👁️</a>  // WRONG: direct link
    <a href={file.public_url} download>📥</a>  // Download button
  </>
)}
```

**Fix:**
```javascript
{file.public_url && (
  <>
    <button 
      onClick={() => handlePreviewFile(file)}
      className="text-slate-600 hover:text-slate-900 p-2"
      title="Preview"
    >
      👁️
    </button>
    <a 
      href={file.public_url} 
      download={file.file_name}
      className="text-slate-600 hover:text-slate-900 p-2"
      title="Download"
    >
      📥
    </a>
  </>
)}
```

**Add Handler:**
```javascript
const [selectedFile, setSelectedFile] = useState<any>(null);
const [showPreview, setShowPreview] = useState(false);

const handlePreviewFile = (file: any) => {
  setSelectedFile(file);
  setShowPreview(true);
};
```

**Add Modal Component:**
```javascript
{showPreview && selectedFile && (
  <FilePreviewModal 
    file={selectedFile}
    onClose={() => setShowPreview(false)}
  />
)}
```

**Status:** 🔧 NEEDS IMPLEMENTATION

---

## Issue 3: Discussions - Navigation & Display ❌ BROKEN

### Problem
- Back button doesn't return to main chat area
- Coordinator message count not displayed
- Missing real-time discussion sync
- Discussion thread not opening properly

### Root Cause
- Missing view state management for discussion detail view
- No message count calculation in sidebar
- Subscription not hooked to discussion_messages table
- No click handler for opening individual discussions

### Fix Implementation
**File:** `src/components/SubmissionSidebar.tsx` and `src/components/ManuscriptDiscussion.tsx`

**Part A: Add Message Count Badge**

In `SubmissionSidebar.tsx`:
```javascript
const discussionBadge = manuscript?.discussions?.length || 0;

// In the sidebar item:
{
  id: 'discussions',
  label: 'Discussions',
  badge: discussionBadge,
  icon: MessageSquare
}
```

**Part B: Add Back Button Handler**

In `ManuscriptDiscussion.tsx`:
```javascript
interface ManuscriptDiscussionProps {
  discussionId: string;
  onBack?: () => void;  // Add this prop
  // ... other props
}

// In the component:
<button 
  onClick={onBack}
  className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
>
  <ChevronLeft className="w-4 h-4" />
  Back to Messages
</button>
```

**Part C: Integrate with AuthorWorkspace**

```javascript
const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null);

// When clicking discussion sidebar item:
const handleDiscussionClick = (discussionId: string) => {
  setSelectedDiscussionId(discussionId);
  setView('discussion');
};

// In discussion view:
{view === 'discussion' && selectedDiscussionId && (
  <ManuscriptDiscussion
    discussionId={selectedDiscussionId}
    onBack={() => {
      setView('list');
      setSelectedDiscussionId(null);
    }}
  />
)}
```

**Status:** 🔧 NEEDS IMPLEMENTATION

---

## Issue 4: Supplementary Files - Missing File Categories ❌ BROKEN

### Problem
- Sidebar only shows some supplementary files
- Missing: Additional Files, Data Sets, Figures
- File categorization not working

### Root Cause
- File filter in sidebar only looks for specific keywords
- `file_type` field not being used properly
- Missing categorization for all file types

### Fix Implementation
**File:** `src/components/SubmissionSidebar.tsx`

**Current Logic (Line ~60):**
```javascript
const supplementaryFiles = manuscript.files?.filter(f => 
  f.file_type?.toLowerCase().includes('supplementary') || 
  f.file_type?.toLowerCase().includes('additional')
) || [];
```

**Fix:**
```javascript
const supplementaryFiles = manuscript.files?.filter(f => {
  if (!f.file_type) return false;
  const type = f.file_type.toLowerCase();
  return (
    type.includes('supplementary') ||
    type.includes('additional') ||
    type.includes('dataset') ||
    type.includes('data set') ||
    type.includes('figure') ||
    type.includes('appendix')
  );
}) || [];
```

**In Sidebar Render:**
```javascript
{
  id: 'supplementary',
  label: 'Supplementary Files',
  badge: supplementaryFiles.length,
  icon: FileText
}
```

**Status:** 🔧 NEEDS IMPLEMENTATION

---

## Issue 5: Discussion Persistence ✅ PARTIALLY WORKING

### Problem
- Messages may not persist across logout/login
- Refresh may lose data
- No timestamp display

### Current Status
- Database saves are implemented
- Supabase real-time sync exists
- Need to verify after login/logout cycles

### Verification Steps
1. **Submit a message** and note the timestamp
2. **Refresh the page** - message should appear
3. **Logout and login** - message should still appear
4. **Check database directly** - message should be in `discussion_messages` table

### Enhancement Implementation
**File:** `src/components/ManuscriptDiscussion.tsx`

**Add Message Timestamps:**
```javascript
const formatDateTime = (iso: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// In message render:
<div key={msg.id} className="border-l-4 border-slate-200 pl-4 py-2">
  <div className="flex items-center justify-between">
    <p className="font-semibold text-slate-900">{msg.sender_id}</p>
    <p className="text-xs text-slate-500">{formatDateTime(msg.created_at)}</p>
  </div>
  <p className="text-sm text-slate-700 mt-1">{msg.message}</p>
</div>
```

**Status:** ✅ VERIFY & ENHANCE

---

## Issue 6: Discussions Sidebar - Not Functional ❌ BROKEN

### Problem
- Sidebar doesn't show real-time discussion data
- No live message updates
- Coordinator badge not showing
- Clicking on discussions doesn't work

### Root Cause
- Missing real-time subscription to `discussion_messages`
- No state management for unread message counts
- No badge display logic
- Missing click handler integration

### Fix Implementation
**File:** `src/components/SubmissionSidebar.tsx`

**Add Real-time Subscription:**
```javascript
import { supabase } from '../lib/supabase';

useEffect(() => {
  if (!manuscript?.id) return;

  const channel = supabase
    .channel(`discussions-${manuscript.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'discussion_messages',
        filter: `manuscript_id=eq.${manuscript.id}`
      },
      () => {
        // Trigger parent to reload manuscript details
        // This will refresh the discussions list
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [manuscript?.id]);
```

**Add Message Count Logic:**
```javascript
const discussionBadge = manuscript?.discussions?.length || 0;
const unreadCount = manuscript?.discussions?.filter(d => !d.read_at).length || 0;
```

**Render Badge:**
```javascript
<button
  onClick={() => onTabChange('discussions')}
  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 ${
    activeTab === 'discussions'
      ? 'bg-emerald-100/75 text-[#005a36]'
      : 'text-slate-700 hover:bg-emerald-50/50'
  }`}
>
  <div className="flex items-center gap-2.5">
    <MessageSquare className="w-4 h-4" />
    <span>Discussions</span>
  </div>
  {unreadCount > 0 && (
    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
      {unreadCount}
    </span>
  )}
  {discussionBadge > 0 && unreadCount === 0 && (
    <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">
      {discussionBadge}
    </span>
  )}
</button>
```

**Status:** 🔧 NEEDS IMPLEMENTATION

---

## Implementation Checklist

### Priority 1 (Critical Path)
- [ ] Issue 1: Verify submission queue auto-refresh
- [ ] Issue 2: Implement file preview modal
- [ ] Issue 3: Fix discussions navigation

### Priority 2 (Important UX)
- [ ] Issue 4: Add all supplementary file types
- [ ] Issue 6: Add real-time discussions sidebar

### Priority 3 (Polish)
- [ ] Issue 5: Add timestamps and verify persistence

---

## Testing Checklist

### Submission Queue
- [ ] Submit a new manuscript
- [ ] Verify it appears in the list without refresh
- [ ] Check with multiple rapid submissions

### File Preview
- [ ] Upload a .doc file
- [ ] Click eye icon → should preview
- [ ] Click download → should download
- [ ] Test with .docx, .pdf, .txt

### Discussions
- [ ] Start a discussion thread
- [ ] Send a message
- [ ] Verify message appears in sidebar
- [ ] Click back button → returns to list
- [ ] Logout and login → message persists
- [ ] Refresh page → message still there

### Supplementary Files
- [ ] Upload file with type "Dataset"
- [ ] Upload file with type "Figure"
- [ ] Upload file with type "Additional"
- [ ] Verify all appear in sidebar

### Real-time Sync
- [ ] Open two browser windows
- [ ] Send message in one → appears in other
- [ ] Add file in one → appears in other
- [ ] Verify no manual refresh needed

---

## Files to Modify

1. `src/components/AuthorWorkspace.tsx` - State management
2. `src/components/OjsSubmissionDetail.tsx` - File preview handler
3. `src/components/SubmissionSidebar.tsx` - Discussion sidebar + file filters
4. `src/components/ManuscriptDiscussion.tsx` - Back button + timestamps
5. `src/lib/workflow.ts` - May need discussion subscription helper

---

## Next Steps

1. **Verify Issue 1** - Check if subscription is actually working
2. **Implement Issue 2** - Add FilePreviewModal integration
3. **Implement Issue 3** - Add navigation state management
4. **Test thoroughly** - Use both single and multi-user scenarios
5. **Document** - Update component README with usage patterns

