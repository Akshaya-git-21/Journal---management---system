# Debugging Missing Files in Manuscript Detail View

## Quick Diagnosis Checklist

When you see "FILES 0 Uploaded" in the detail page but know files were uploaded, follow this guide to find the exact problem.

---

## Step 1: Enable Browser Developer Tools Console

1. **Open the application in your browser**
2. **Press `F12`** to open Developer Tools
3. **Go to the "Console" tab**
4. **Keep it open while you test**

---

## Step 2: Submit a New Manuscript with Files

### What to do:
1. Click "New Submission"
2. Complete Steps 1-2 (Upload a PDF file)
3. Complete Steps 3-8
4. Click "Submit"

### What to watch for in Console:

**GOOD**: You should see logs like:
```
[SUBMISSION] Building paperObj with 1 files
[SUBMISSION] Uploaded files: [{ fileName: "manuscript.pdf", ... }]
[SUBMISSION] Final paperObj: { id: "JMS-2026-ABC12", uploadedFiles: [...], ... }
[SUBMIT] Starting new manuscript submission...
[SUBMIT] Current authenticated user ID: uuid-12345
[SUBMIT] Ensuring author profile exists...
[SUBMIT] Author profile ready
[SUBMIT] Using manuscript ID: JMS-2026-ABC12
[SUBMIT] Inserting manuscript record...
[SUBMIT] Manuscript record inserted successfully
[SUBMIT] Syncing files to manuscript_files table: [{ ... }]
[SUBMIT] Transformed files for sync: [{ file_name: "manuscript.pdf", ... }]
[SUBMIT] Files synced successfully: { success: true, manuscript_id: "JMS-2026-ABC12", files_synced: 1 }
```

**BAD**: If you see errors like:
```
[SUBMIT] No files to sync. uploadedFiles: undefined
[SUBMIT] File sync RPC error: ...
[SUBMIT] Failed to sync files: ...
```

Then the problem is identified. See the troubleshooting section below.

---

## Step 3: Navigate to Manuscript Detail

1. After successful submission, go back to "My Manuscripts" list
2. Find the submitted manuscript
3. Click "VIEW"

### What to watch for in Console:

**GOOD**: You should see:
```
Synced ← This badge should appear on the "Uploaded Files" card
```

And in the table, you should see the actual filename listed.

**BAD**: If the "Uploaded Files" section is empty, continue to Step 4.

---

## Step 4: Check Specific Error Messages

### Is there a red error in the console?

**YES**: 
- Copy the exact error message
- Check "Troubleshooting - Error Messages" section below

**NO**: 
- Continue to Step 5

---

## Step 5: Verify Each Stage of the Flow

### Stage A: File Upload to Storage

In console, look for:
```
[SUBMISSION] Uploaded files: [{ ... }]
```

**If you see this**: ✅ File was uploaded to storage

**If you DON'T see this**: ❌ File wasn't uploaded - check "Troubleshooting - File Upload Failed"

### Stage B: File Sync to Database

In console, look for:
```
[SUBMIT] Syncing files to manuscript_files table:
[SUBMIT] Files synced successfully:
```

**If you see both**: ✅ File was synced to database

**If you DON'T see the second one**: ❌ Sync failed - check "Troubleshooting - Sync Failed"

### Stage C: Detail Page Loads Files

When you open the detail page, look for:
```
[LOAD] Querying manuscripts table where author_id = ...
```

and

```
[LOAD] Fetched manuscripts: [{ id: "JMS-2026-ABC12", ... }]
```

**If you see both**: ✅ Detail page is querying correctly

---

## Troubleshooting - Error Messages

### "Failed to insert manuscript: ..."

**Problem**: Manuscript insert is failing

**Solution**:
1. Check if author profile exists:
   ```sql
   SELECT * FROM public.profiles 
   WHERE id = 'YOUR-USER-ID' 
   AND role = 'AUTHOR' 
   AND status = 'ACTIVE';
   ```
2. If no result, the author profile creation failed
3. Check Supabase "ensure_author_profile" RPC for errors

### "File sync RPC error: ..."

**Problem**: The sync_manuscript_files RPC is returning an error

**Possible causes**:

1. **Manuscript ID mismatch**: The ID used in sync doesn't match the inserted manuscript
   - **Check**: Verify manuscript exists:
     ```sql
     SELECT id, author_id FROM public.manuscripts 
     WHERE id = 'JMS-2026-ABC12';
     ```

2. **Author ID mismatch**: The RPC can't find the manuscript for this author
   - **Check**: Verify author_id in manuscripts table matches auth.uid()
     ```sql
     SELECT auth.uid();  -- Get current user UUID
     SELECT author_id FROM public.manuscripts WHERE id = 'JMS-2026-ABC12';
     -- These should match
     ```

3. **Files array is malformed**: The filesForSync array has invalid structure
   - **Check**: Look in console for:
     ```
     [SUBMIT] Transformed files for sync: [...]
     ```
   - Verify each file has: file_name, file_type, file_size, storage_path, public_url

### "Not authenticated"

**Problem**: The sync_manuscript_files RPC can't get the current user

**Solution**:
1. Verify you're logged in
2. Clear browser cookies/cache
3. Log out and log back in
4. Try submission again

---

## Troubleshooting - File Upload Failed

### Symptoms:
```
[SUBMISSION] Building paperObj with 0 files
[SUBMISSION] No files to sync. uploadedFiles: undefined
```

### Diagnosis:

**Check 1: Did you upload a file in Step 2?**
- Go back to New Submission
- Step 2: Upload Manuscript
- Make sure file appears in "Uploaded Files" table
- Verify it shows: Name, Type, Size, Date

**Check 2: Storage upload succeeded?**

Look in console during file upload for:
```
[File Upload Error]: ...
```

If you see this, the file upload to storage failed.

**Possible causes**:
1. File is too large (>10MB)
2. Storage bucket "manuscript-files" doesn't exist
3. Storage RLS policies blocking upload
4. User not authenticated

**Solution**:
- Check file size < 10MB
- Verify storage bucket exists in Supabase
- Log out and log back in
- Try different file (PDF recommended)

---

## Troubleshooting - Sync Failed

### Symptoms:
```
[SUBMIT] Files synced successfully: { files_synced: 0 }
```

Note the `0` - files were synced but count is 0, meaning no files were in the array.

### Diagnosis:

**Check**: Look for:
```
[SUBMIT] Transformed files for sync: []
```

If the array is empty, the file objects are missing required fields.

**Solution**:

Each file object MUST have:
- `fileName`: actual filename (e.g., "manuscript.pdf")
- `componentType`: file type (e.g., "Blind Manuscript")
- `fileSize`: size as string (e.g., "2.3 MB")
- `storagePath`: storage path (e.g., "uuid-user/timestamp_filename.pdf")
- `publicUrl`: public URL from Supabase

If any of these are missing or null, the file won't sync.

---

## Troubleshooting - Detail Page Shows No Files

### Symptoms:
- Submission successful ✅
- Files synced ✅
- But detail page shows "FILES 0 Uploaded" ❌

### Diagnosis:

**Check 1: Query the database directly**

```sql
SELECT * FROM public.manuscript_files 
WHERE manuscript_id = 'JMS-2026-ABC12';
```

**If you see rows**: Files are in the database, but the detail page isn't fetching them
- This is a client-side rendering issue
- Check if `uploadedFiles` state is being set correctly

**If you see NO rows**: Files weren't synced (go back to "Troubleshooting - Sync Failed")

**Check 2: Verify fetchAuthorManuscriptDetails query**

The detail page calls `fetchAuthorManuscriptDetails(paper.id)` which should:
1. Query `manuscripts` table
2. Query `manuscript_files` table with `WHERE manuscript_id = ?`
3. Return files array

If this query has an error, check Supabase logs.

---

## Step-by-Step Debug Log Collection

If you want to share detailed logs for debugging, follow this:

1. **Open Console** (F12 → Console)
2. **Clear console**: `clear()`
3. **Start New Submission**
4. **Upload manuscript file**
5. **Proceed to Step 8 and Submit**
6. **Copy ALL console output** (Ctrl+A, Ctrl+C)
7. **Share in your problem report** with these sections:
   - Console logs from submission
   - Console logs from detail page load
   - Error messages (if any)
   - Browser DevTools error section (red X icon)

---

## Expected Console Flow (Happy Path)

```
[SUBMISSION] Building paperObj with 1 files
[SUBMISSION] Uploaded files: [
  {
    id: "file-blind-manuscript-1691234567890",
    fileName: "manuscript.pdf",
    componentType: "Blind Manuscript",
    fileSize: "2.3 MB",
    storagePath: "uuid-user-id/1691234567890_manuscript.pdf",
    publicUrl: "https://supabase.co/.../..."
  }
]
[SUBMISSION] Final paperObj: {
  id: "JMS-2026-ABC12",
  uploadedFiles: [ ... 1 file ... ],
  ...
}

[SUBMIT] Starting new manuscript submission...
[SUBMIT] Current authenticated user ID: uuid-12345-...
[SUBMIT] Ensuring author profile exists...
[SUBMIT] Author profile ready
[SUBMIT] Using manuscript ID: JMS-2026-ABC12
[SUBMIT] Inserting manuscript record...
[SUBMIT] Manuscript record inserted successfully
[SUBMIT] Syncing files to manuscript_files table: [ ... 1 file ... ]
[SUBMIT] Transformed files for sync: [
  {
    file_name: "manuscript.pdf",
    file_type: "Blind Manuscript",
    file_size: "2.3 MB",
    storage_path: "uuid-user-id/1691234567890_manuscript.pdf",
    public_url: "https://..."
  }
]
[SUBMIT] Files synced successfully: {
  success: true,
  manuscript_id: "JMS-2026-ABC12",
  files_synced: 1
}
[SUBMIT] Calling load() to refresh manuscript list...
[SUBMIT] Manuscript list refreshed, setting view to list
[SUBMIT] Submission complete!

→ Redirected to list view ✅

→ Click VIEW on manuscript →

[LOAD] Current user ID: uuid-12345-...
[LOAD] Querying manuscripts table where author_id = uuid-12345-...
[LOAD] Query result - error: null, data count: 1
[LOAD] Fetched manuscripts: [
  {
    id: "JMS-2026-ABC12",
    title: "...",
    author_id: "uuid-12345-...",
    submitted_at: "2026-08-11T..."
  }
]
[LOAD] Setting items with 1 manuscripts
[LOAD] Fetching manuscripts...
[LOAD] Query result - error: null data count: 1
[LOAD] Fetched manuscripts: [...]

→ Detail page loads →

FILES: 1 Uploaded ✅
Uploaded Files table shows: manuscript.pdf ✅
```

If your console looks like this, you're good! ✅

---

## Quick Fixes to Try

### Issue: Files uploaded but not showing in detail

**Try 1**: Hard refresh the page
- Press `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- Clear browser cache if needed

**Try 2**: Check if files are in database
```sql
SELECT COUNT(*) FROM public.manuscript_files;
```

Should return > 0

**Try 3**: Re-sync files manually (if you know SQL)
```sql
-- Run this in Supabase SQL Editor
SELECT public.sync_manuscript_files(
  'JMS-2026-ABC12',
  '[{"file_name": "test.pdf", ...}]'::jsonb
);
```

**Try 4**: Check storage bucket exists
- Go to Supabase Dashboard
- Storage → Buckets
- Should see "manuscript-files"
- If not, create it

---

## When to Report a Bug

If after following all these steps:
1. ✅ Files uploaded successfully (shown in console)
2. ✅ Files synced successfully (sync log shows files_synced > 0)
3. ✅ Files in database (SQL query returns rows)
4. ❌ Detail page still shows 0 files

Then it's a **client-side rendering bug** and should be reported with:
- Manuscript ID (JMS-2026-XXXXX)
- Console logs (complete flow)
- Database query results
- Screenshots of list view and detail view

---

## Summary

| Check | Command/Location | Expected Result |
|-------|-----------------|-----------------|
| Files uploading? | Console → Look for [SUBMISSION] logs | Files array has items |
| Files syncing? | Console → Look for [SUBMIT] logs | files_synced: 1 |
| Files in database? | SQL: `SELECT * FROM manuscript_files WHERE manuscript_id = '...'` | Rows returned |
| Detail page fetching? | Console when opening detail | No errors |
| Files displaying? | Detail page "Uploaded Files" section | 1+ files shown |

If any check fails, follow the troubleshooting section for that stage.
