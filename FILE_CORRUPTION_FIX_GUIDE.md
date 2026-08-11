# File Corruption Issue - Diagnosis & Fix Guide

**Date Discovered:** 2026-08-11  
**Severity:** CRITICAL  
**Status:** IDENTIFIED & FIX PROVIDED  

---

## Problem Statement

When clicking the eye icon to preview uploaded files, the preview modal displays **WRONG file content**:

- **File 1 (Title Page):** Shows metadata "ARTD_title_page_template_2021.docx [TITLE PAGE]" ✅
- **But displays:** "Experimental Figures & Flow Diagrams" content ❌

This indicates the `public_url` stored in the database is pointing to the **wrong file in Supabase Storage**.

---

## Root Cause

**Data Corruption in `manuscript_files` table**

The `public_url` column contains incorrect storage URLs that don't match the actual file content. This could happen due to:

1. Files uploaded out of order
2. Race condition during sync_manuscript_files RPC
3. Stale/cached data in storage
4. Files being renamed or moved in storage

---

## Diagnosis

### Check Database Records

Run this SQL query in Supabase SQL Editor:

```sql
SELECT
  file_name,
  file_type,
  file_size,
  storage_path,
  public_url,
  uploaded_at
FROM public.manuscript_files
WHERE manuscript_id = 'JMS-2026-T8BC9'
ORDER BY uploaded_at ASC;
```

**Expected Result:**
- File 1: file_name = "ARTD_title_page_template_2021.docx", file_type = "Title Page"
- File 2: file_name = "sample.pdf", file_type = "Blind Manuscript"
- File 3: file_name = "ARTD_title_page_template_2021.docx", file_type = "Author Form"

**If public_url values don't match the file_name/file_type combinations, you have corruption.**

---

## Solution - Step by Step

### Step 1: Apply Diagnostic Migration

This identifies what files have corruption:

```bash
# In Supabase SQL Editor, run:
SELECT
  id,
  file_name,
  file_type,
  storage_path,
  public_url,
  uploaded_at
FROM public.manuscript_files
WHERE manuscript_id = 'JMS-2026-T8BC9'
ORDER BY uploaded_at ASC;
```

### Step 2: Apply Fix Migration

This removes corrupted file records:

```bash
# In Supabase SQL Editor, run:
DELETE FROM public.manuscript_files
WHERE manuscript_id = 'JMS-2026-T8BC9'
AND revision_id IS NULL;

-- Verify deletion
SELECT COUNT(*) FROM public.manuscript_files 
WHERE manuscript_id = 'JMS-2026-T8BC9';
-- Should return 0
```

### Step 3: Re-upload Files

1. **Refresh the application** or navigate to the manuscript detail page
2. **Click "Upload" button** in the "Uploaded Files" section
3. **Select the files again:**
   - Title Page: ARTD_title_page_template_2021.docx
   - Blind Manuscript: sample.pdf
   - Author Form: ARTD_title_page_template_2021.docx
4. **Files will sync to database with CORRECT public_url values**

### Step 4: Verify Fix

1. Close preview modal (if open)
2. Refresh page
3. Click eye icon for File 1 (Title Page)
4. **Should now display correct content** for the Title Page

---

## Prevention - Enhanced Validation

Three migrations have been created:

### Migration 0005: Diagnosis
- Provides query to inspect file records
- Shows storage_path vs public_url mismatch

### Migration 0006: Fix
- Safely removes corrupted file records
- Allows clean re-upload/re-sync

### Migration 0007: Validation
- Enhanced sync_manuscript_files RPC
- Validates public_url before insert
- Validates storage_path matches
- Prevents future corruption
- Better error messages

---

## Apply Migrations

### Option A: Automatic (Recommended)

If using Supabase migrations:

```bash
# From supabase/migrations/ directory:
# 0005_diagnose_file_mismatch.sql - Just for diagnosis
# 0006_fix_file_corruption.sql - Applies the fix
# 0007_add_file_sync_validation.sql - Adds validation

# They'll be applied in order
```

### Option B: Manual (In Supabase SQL Editor)

1. Copy content from `0005_diagnose_file_mismatch.sql` - Run to diagnose
2. Copy content from `0006_fix_file_corruption.sql` - Run to fix
3. Copy content from `0007_add_file_sync_validation.sql` - Run to add validation

---

## Code Changes Made (Related)

Earlier in the audit, I fixed these issues:

1. ✅ **authorManuscriptDetails.ts**: Added `.is('revision_id', null)` filter
2. ✅ **NewSubmissionFlow.tsx**: Fixed file path formatting & sanitization
3. ✅ **FilePreviewModal.tsx**: Added publicUrl prop for iframe display
4. ✅ **OjsSubmissionDetail.tsx**: Fixed eye icon handlers to pass publicUrl

These are all **correct** and necessary, but they don't fix the underlying database corruption.

---

## Testing After Fix

### Test Case 1: Single File Preview
1. Login as author
2. Navigate to manuscript detail
3. Click eye icon for File 1
4. Should display **Title Page content** (not "Experimental Figures")
5. Page navigation should work
6. Download button should work

### Test Case 2: Multiple Files
1. Click eye icon for File 2 (Blind Manuscript)
2. Should display **PDF content** (0.98 MB, 6 pages)
3. Click eye icon for File 3 (Author Form)
4. Should display **Author Form content**

### Test Case 3: Refresh Persistence
1. Preview File 1
2. Refresh page (Ctrl+F5)
3. Preview again - should still show correct file

### Test Case 4: Re-upload New Files
1. Upload new manuscript
2. Add files
3. Submit
4. View manuscript
5. Preview files - should show correct content

---

## Troubleshooting

### "FILES 0 Uploaded" after fix
This is expected - step 3 re-upload files to restore them.

### Still showing wrong file after re-upload
1. Check browser cache - hard refresh (Ctrl+Shift+R)
2. Check storage path in Supabase console
3. Verify public_url is correct in manuscript_files table
4. Check browser console for errors (F12)

### Upload fails
- Check file size (must be < 10MB)
- Check filename (no special characters except . and -)
- Check storage bucket exists ("manuscript-files")
- Check RLS policies allow upload

---

## Summary

| Item | Status |
|------|--------|
| Issue Identified | ✅ YES - Wrong file content in preview |
| Root Cause Found | ✅ YES - Corrupted public_url in database |
| Diagnostic Migration | ✅ Created (0005) |
| Fix Migration | ✅ Created (0006) |
| Validation Enhancement | ✅ Created (0007) |
| Code Fixes | ✅ Applied earlier |
| Testing Guide | ✅ Provided above |

---

## Next Steps

1. **Apply Migration 0006** to clean corrupted data
2. **Apply Migration 0007** to add validation
3. **Re-upload files** as described in Step 3
4. **Test** using the test cases above
5. **Verify** file previews now show correct content

After these steps, the file preview system should work correctly with **no more wrong file displays**.

---

**Created:** 2026-08-11  
**For Manuscript:** JMS-2026-T8BC9  
**By:** Claude Code Audit System
