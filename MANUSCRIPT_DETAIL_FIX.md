# Manuscript Detail Page - Real-Time Database-Driven Data Fix

## Executive Summary

The Manuscript Detail page was showing empty uploaded files because:
1. Files were being uploaded with the wrong path (using non-existent manuscript ID)
2. Manuscript IDs were inconsistent between frontend generation and backend processing
3. Files weren't being properly synced to the `manuscript_files` database table
4. Storage RLS policies were blocking author uploads

All issues have been fixed. The detail page now displays real database-driven file data in real-time.

---

## The Problem: Before the Fix

### Flow That Was Broken

```
NewSubmissionFlow (Step 2):
  ↓ uploadManuscriptFile(file, paper.id)  ← WRONG: paper.id is undefined
  ↓ Files uploaded to storage with wrong/no manuscript ID
  ↓ Storage RLS policy blocks upload (path doesn't match manuscript.id format)
  ↓ Even if upload succeeded, file object not synced to database

NewSubmissionFlow (Step 8):
  ↓ Generate new manuscript ID: JMS-2026-XXXXX
  ↓ Submit paperObj with ID and uploadedFiles

AuthorWorkspace.handleNewSubmission():
  ↓ GENERATE ANOTHER NEW ID: JMS-2026-YYYYY  ← WRONG: Different ID!
  ↓ Insert manuscript with second ID
  ↓ Sync files with second ID (but files have paths from first upload)
  ↓ Inconsistency: Manuscript has ID-A, files have ID-B references

OjsSubmissionDetail.page loads:
  ↓ fetchAuthorManuscriptDetails(manuscriptId)
  ↓ Query: SELECT * FROM manuscript_files WHERE manuscript_id = ID-A
  ↓ Result: No files found (they were synced with ID-B)
  ↓ "FILES 0 Uploaded" ← WRONG!
```

### Root Causes

1. **File Upload Path Issue**
   - `uploadManuscriptFile()` was called with `paper.id || 'manuscript-general'`
   - `paper` variable was undefined at upload time (it references the detail view paper, not the new submission)
   - Files uploaded to paths like `manuscript-general/...` or `undefined/...`
   - Storage RLS policy expected `${manuscript.id}/...` format
   - Upload failed silently; files never reached storage

2. **Manuscript ID Mismatch**
   - NewSubmissionFlow generated ID: `JMS-2026-XXXXX`
   - AuthorWorkspace generated different ID: `JMS-2026-YYYYY`
   - Files synced with one ID, manuscript created with another
   - Detail page queries with third ID, finds nothing

3. **Storage RLS Policy Too Strict**
   - Required storage path to start with valid manuscript.id
   - But manuscript doesn't exist during file upload (chicken-egg problem)
   - Policy blocked all author uploads that didn't match exact format
   - No fallback mechanism

4. **Author Profile Not Guaranteed**
   - RLS policy for manuscript insert checks: `role = 'AUTHOR' and status = 'ACTIVE'`
   - If author profile didn't exist with these flags, insert would fail
   - No ensureAuthorProfile() call before insert

---

## The Solution: After the Fix

### Four Critical Changes

#### 1. **Fixed uploadManuscriptFile() - Use User ID Path**
**File:** `src/lib/supabase.ts` (Lines 306-345)

**What Changed:**
```typescript
// BEFORE (WRONG):
const filePath = `${manuscriptId}/${Date.now()}_${file.name}`;
// Problem: manuscriptId is undefined or wrong during submission

// AFTER (CORRECT):
const { data: { user } } = await supabase.auth.getUser();
const filePathPrefix = user.id;  // ← Use actual authenticated user ID
const filePath = `${filePathPrefix}/${Date.now()}_${file.name}`;
// Solution: User ID always exists and is unique per author
```

**Why This Works:**
- Files upload to `${auth.user.id}/filename.pdf` format
- User ID is always available during upload
- User ID is unique per author, preventing cross-author conflicts
- RLS policies control access through manuscript_files table (not storage path)
- Manuscript ID is assigned later when syncing to database

#### 2. **Fixed Manuscript ID Consistency - Use Submitted ID**
**File:** `src/components/AuthorWorkspace.tsx` (Lines 178-230)

**What Changed:**
```typescript
// BEFORE (WRONG):
const manuscriptId = `JMS-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
// Problem: Generates new ID, ignoring the one from NewSubmissionFlow

// AFTER (CORRECT):
const manuscriptId = paperDetails.id;
if (!manuscriptId) {
  throw new Error('Manuscript ID not provided from submission');
}
// Solution: Use the ID that was already generated and passed from NewSubmissionFlow
```

**Why This Works:**
- Single source of truth for manuscript ID
- Same ID used throughout entire flow
- Files synced with correct manuscript_id
- Detail page queries find the files

#### 3. **Fixed Storage RLS Policies - Allow User-Scoped Uploads**
**File:** `supabase/migrations/0004_fix_storage_policies.sql`

**What Changed:**
```sql
-- BEFORE (WRONG):
create policy "manuscript_files_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and exists (
      select 1 from public.manuscripts m
      where m.id = split_part(name, '/', 1) and m.author_id = auth.uid()
    )
  );
-- Problem: Requires manuscript to exist with specific ID format in path

-- AFTER (CORRECT):
create policy "manuscript_files_author_upload" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and split_part(name, '/', 1) = auth.uid()::text
  );
-- Solution: Allow any authenticated user to upload to their own user-scoped folder
```

**Why This Works:**
- Path format: `${user.id}/timestamp_filename.pdf`
- No dependency on manuscript existing first
- User is authenticated (auth.uid() is always set for logged-in users)
- Access control is enforced at database level (manuscript_files table RLS)
- Clean separation: storage policies handle upload permissions, database RLS handles access control

#### 4. **Ensured Author Profile Exists - Call RPC Before Insert**
**File:** `src/components/AuthorWorkspace.tsx` (Lines 191-195)

**What Changed:**
```typescript
// BEFORE: No profile creation step
const { data: insertResult, error: insertError } = await supabase
  .from('manuscripts')
  .insert([{ ... }]);

// AFTER: Ensure profile exists first
await ensureAuthorProfile();  // ← Call RPC to create/activate AUTHOR profile
console.log('[SUBMIT] Author profile ready');
const { data: insertResult, error: insertError } = await supabase
  .from('manuscripts')
  .insert([{ ... }]);
```

**Why This Works:**
- `ensureAuthorProfile()` RPC runs as SECURITY DEFINER (elevated privileges)
- Creates or activates author profile with correct role and status
- RLS policy check passes: `role = 'AUTHOR' and status = 'ACTIVE'`
- Manuscript insert succeeds because profile exists

---

## Complete Data Flow After Fix

### Step-by-Step Execution

```
1. AUTHOR OPENS NEW SUBMISSION (NewSubmissionFlow)
   ├─ Step 1: Prepare (agree to terms)
   ├─ Step 2: Upload Manuscript
   │  └─ uploadManuscriptFile(file, undefined)  ← No manuscript ID yet
   │     ├─ Get auth.uid() → "uuid-user-12345"
   │     ├─ Upload to storage: "uuid-user-12345/1691234567_manuscript.pdf"
   │     ├─ Store in uploadedFiles state
   │     └─ File object: { fileName, componentType, fileSize, storagePath, publicUrl }
   ├─ Step 3-7: Enter metadata, contributors, etc.
   └─ Step 8: Submit
      ├─ Generate manuscript ID: "JMS-2026-ABC12"
      ├─ Create paperObj: { id: "JMS-2026-ABC12", uploadedFiles: [...], ... }
      └─ Call onSubmit(paperObj)

2. AUTHORWORKSPACE HANDLES SUBMISSION
   ├─ Get auth user → uuid-user-12345
   ├─ Call ensureAuthorProfile() RPC
   │  ├─ RPC runs as SECURITY DEFINER
   │  ├─ Create/update profile: { id: "uuid-user-12345", role: "AUTHOR", status: "ACTIVE" }
   │  └─ ✓ Profile now exists
   ├─ Extract manuscriptId from paperDetails: "JMS-2026-ABC12"
   ├─ Insert manuscript record:
   │  ├─ Trigger: set_manuscript_author() sets author_id = uuid-user-12345
   │  ├─ Insert: { id: "JMS-2026-ABC12", title, abstract, author_id: "uuid-user-12345", status: "SUBMITTED", ... }
   │  └─ ✓ Manuscript created
   └─ Sync files to manuscript_files table:
      ├─ Transform uploadedFiles array
      ├─ Call sync_manuscript_files RPC:
      │  ├─ p_manuscript_id: "JMS-2026-ABC12"
      │  ├─ p_files: [
      │  │  { file_name: "manuscript.pdf", file_type: "Blind Manuscript", 
      │  │    file_size: "2.3 MB", storage_path: "uuid-user-12345/1691234567_manuscript.pdf",
      │  │    public_url: "https://..." }
      │  │]
      │  ├─ RPC inserts into manuscript_files table:
      │  │  { id: UUID, manuscript_id: "JMS-2026-ABC12", file_name: "manuscript.pdf", 
      │  │    storage_path: "uuid-user-12345/...", public_url: "https://...", uploaded_by: "uuid-user-12345", ... }
      │  └─ ✓ Files synced
      └─ Call load() to refresh list

3. AUTHOR VIEWS MANUSCRIPT DETAIL PAGE
   ├─ OjsSubmissionDetail component mounts
   ├─ useEffect calls fetchAuthorManuscriptDetails("JMS-2026-ABC12")
   │  ├─ Query: SELECT * FROM manuscripts WHERE id = "JMS-2026-ABC12"
   │  │  └─ ✓ Manuscript found
   │  ├─ Query: SELECT * FROM manuscript_files WHERE manuscript_id = "JMS-2026-ABC12"
   │  │  ├─ Row 1: { id: UUID, manuscript_id: "JMS-2026-ABC12", file_name: "manuscript.pdf", storage_path: "uuid-user-12345/...", public_url: "..." }
   │  │  └─ ✓ File found
   │  ├─ Format files for display:
   │  │  └─ { id: UUID, name: "manuscript.pdf", type: "Manuscript", size: "2.3 MB", date: "Aug 11, 2026", ... }
   │  └─ Return AuthorManuscriptDetails with files array
   ├─ setUploadedFiles([{ name: "manuscript.pdf", ... }])
   ├─ Render Files section:
   │  ├─ Count: uploadedFiles.length = 1
   │  ├─ Display: "FILES 1 Uploaded" ✓
   │  └─ Table row: [ manuscript.pdf | Manuscript | 2.3 MB | Aug 11 | [View] [Download] ]
   └─ Subscribe to real-time changes
      ├─ If files are added: UPDATE propagates
      ├─ If files are deleted: DELETE propagates
      └─ Component state updates automatically

4. REAL-TIME SYNCHRONIZATION
   ├─ Another user uploads more files
   ├─ Database change event fires
   ├─ subscribeToManuscriptDetails() receives update
   ├─ Files array in state updates
   ├─ Component re-renders
   └─ ✓ New files appear instantly
```

### Key Invariants Maintained

✅ **Single Manuscript ID**
- Generated once in NewSubmissionFlow
- Used throughout entire flow
- Files, status, discussions all reference same ID

✅ **File Path Consistency**
- Storage path: `${auth.user.id}/timestamp_filename`
- Database record: manuscript_id = "JMS-2026-ABC12"
- Query: WHERE manuscript_id = "JMS-2026-ABC12"
- All match up

✅ **Access Control Multi-Layer**
- Storage RLS: User can only upload to own folder
- Database RLS (manuscript_files): Can only see files for manuscripts user owns
- Database RLS (manuscript): Can only see manuscript if author or editor

✅ **Real-Time Synchronization**
- Real-time subscription on manuscript_files table
- Component state updates automatically
- No stale data

---

## Testing the Fix

### Manual Test Script

**Prerequisites:**
- PostgreSQL migrations 0001-0004 applied
- Supabase storage bucket configured
- .env file with correct Supabase credentials

**Test Steps:**

1. **Create Author Account**
   ```
   Email: test.author@example.com
   Password: SecurePass123!
   ```

2. **Start New Submission**
   - Click "New Submission"
   - Complete Step 1 (checklist)
   - Proceed to Step 2

3. **Upload Manuscript File**
   - Step 2: Upload blind manuscript PDF
   - Verify progress bar shows 100%
   - Verify file appears in "Uploaded Files" table with:
     - Name: actual filename
     - Type: "Blind Manuscript"
     - Size: actual file size
     - Date: today's date

4. **Complete Submission**
   - Steps 3-8: Fill in metadata, authors, etc.
   - Step 8: Submit
   - Verify: "Submission successful" message
   - Verify: Redirected to Dashboard
   - Verify: Manuscript appears in "Manuscript Queue"

5. **Open Manuscript Detail**
   - Click on submitted manuscript
   - Wait for detail page to load
   - **CRITICAL TEST:**
     - "FILES" card should show: "1" (not "0")
     - "Uploaded Files" should show: "Uploaded" badge
     - Files table should have row with actual PDF filename

6. **Verify File Access**
   - Click "View" button → Should show file preview
   - Click "Download" button → Should download actual PDF
   - Verify downloaded file is identical to uploaded

7. **Test Real-Time Updates**
   - Keep detail page open
   - Open another browser/incognito as Coordinator
   - Add a file to the manuscript programmatically or via backend
   - Verify: Detail page shows new file without refresh

8. **Test Persistence**
   - Refresh page (F5)
   - Verify: Files still appear (not just in memory)
   - Close browser
   - Log back in
   - Open same manuscript
   - Verify: Files still there

### Expected Results

- ✅ Files upload successfully with user.id path
- ✅ Files sync to manuscript_files table with correct manuscript_id
- ✅ Detail page displays "1 Uploaded" (not "0")
- ✅ Uploaded PDF filename appears in table
- ✅ File can be viewed and downloaded
- ✅ Files persist across page refreshes
- ✅ Files persist across logout/login
- ✅ Real-time updates work (when other users add files)

---

## Database Queries for Verification

### Verify File Upload Succeeded

```sql
-- Check if file was uploaded to storage (Supabase UI → Storage)
-- Path should be: ${uuid-user-id}/timestamp_filename.pdf

-- Check if file was synced to database
SELECT * FROM public.manuscript_files 
WHERE manuscript_id = 'JMS-2026-ABC12'
ORDER BY uploaded_at DESC;

-- Expected output:
-- id | manuscript_id | file_name | file_type | storage_path | public_url | uploaded_by | uploaded_at
```

### Verify Manuscript Created Correctly

```sql
SELECT id, title, author_id, author_name, status, submitted_at, created_at
FROM public.manuscripts
WHERE id = 'JMS-2026-ABC12';

-- Expected: One row with author_id matching authenticated user
```

### Verify Author Profile Exists

```sql
SELECT id, email, name, role, status, created_at
FROM public.profiles
WHERE id = 'uuid-user-12345'  -- Your auth user ID
AND role = 'AUTHOR'
AND status = 'ACTIVE';

-- Expected: One row with AUTHOR role and ACTIVE status
```

---

## Files Modified

### 1. `src/lib/supabase.ts`
- **Function:** `uploadManuscriptFile()`
- **Change:** Use `auth.uid()` instead of `manuscriptId` for file path
- **Impact:** Files now upload successfully with user-scoped paths

### 2. `src/components/AuthorWorkspace.tsx`
- **Function:** `handleNewSubmission()`
- **Changes:**
  - Call `ensureAuthorProfile()` before manuscript insert
  - Use `paperDetails.id` instead of generating new manuscript ID
  - Direct database insert instead of RPC
- **Impact:** Manuscript ID consistency and author profile guaranteed

### 3. `supabase/migrations/0003_ensure_author_profile.sql` (already existed)
- **Content:** `ensure_author_profile()` RPC with SECURITY DEFINER
- **Purpose:** Create/activate author profile with correct role
- **Used by:** AuthorWorkspace before manuscript insert

### 4. `supabase/migrations/0004_fix_storage_policies.sql` (NEW)
- **Changes:**
  - Drop old restrictive manuscript_files_owner_write policy
  - Create new manuscript_files_author_upload policy (user-scoped)
  - Create new manuscript_files_author_manage policy (user-scoped)
  - Create new manuscript_files_author_delete policy (user-scoped)
- **Impact:** Storage allows user-scoped uploads; access control via database

---

## Why This Solution is Robust

1. **No Manuscript ID in Storage Paths**
   - Decouples storage operations from database state
   - Manuscript can be created/updated without re-uploading files
   - Supports revision workflows naturally

2. **User ID as Storage Path Prefix**
   - User always exists when authenticated
   - Natural permission boundary (user can only upload to own folder)
   - Simple RLS policy: `split_part(name, '/', 1) = auth.uid()::text`

3. **Database Table Controls Access**
   - Storage RLS: Simple path-based check
   - Database RLS (manuscript_files): Proper relational check via manuscript ownership
   - Database RLS (manuscript): Proper access control per user role

4. **Single Manuscript ID Source**
   - Generated once, used everywhere
   - Consistent references throughout flow
   - Simple to debug (one ID to search for in logs)

5. **Real-Time Synchronization**
   - Subscriptions on manuscript_files table
   - Any change triggers update
   - Component stays in sync without polling

---

## Migration Instructions

### For Existing Deployments

1. **Back up database**
   ```bash
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Run migrations in Supabase SQL Editor**
   ```sql
   -- 0004_fix_storage_policies.sql
   DROP POLICY IF EXISTS "manuscript_files_owner_write" ON storage.objects;
   CREATE POLICY "manuscript_files_author_upload" ON storage.objects
     FOR INSERT WITH CHECK (
       bucket_id = 'manuscript-files'
       AND split_part(name, '/', 1) = auth.uid()::text
     );
   -- ... (rest of migration)
   ```

3. **Deploy application code**
   - Pull latest changes
   - `npm install`
   - `npm run build`

4. **Verify**
   - Test submission flow as described above
   - Check database queries
   - Monitor Supabase logs for errors

### For New Deployments

Migrations will run automatically when Supabase detects changes.

---

## Troubleshooting

### Files Still Showing as "0 Uploaded"

**Check 1:** Verify file sync was called
```
Look in browser console for:
[SUBMIT] Syncing files to manuscript_files table
[SUBMIT] Files synced successfully
```

**Check 2:** Verify files in database
```sql
SELECT COUNT(*) FROM public.manuscript_files 
WHERE manuscript_id = 'YOUR-MANUSCRIPT-ID';
-- Should return count > 0
```

**Check 3:** Verify RLS policies allow access
```sql
-- Check if user can see files
SELECT * FROM public.manuscript_files 
WHERE manuscript_id = 'YOUR-MANUSCRIPT-ID';
-- Should return rows if user is author
```

### File Upload Fails Silently

**Check 1:** Verify storage policy
```
Look in Supabase → Storage → Policies
Should see: "manuscript_files_author_upload"
Condition: split_part(name, '/', 1) = auth.uid()::text
```

**Check 2:** Check browser console for error
```
[File Upload Error]: Storage upload failed
```

**Check 3:** Verify auth user ID matches
```javascript
// In browser console:
supabase.auth.getUser().then(({data}) => console.log(data.user.id))
// Should return a UUID
```

### Author Profile Not Found

**Check 1:** Verify RPC was called
```
[PROFILE] AUTHOR profile is ready: [...]
```

**Check 2:** Check profile exists
```sql
SELECT * FROM public.profiles WHERE id = 'USER-UUID';
-- Should return one row with role = 'AUTHOR'
```

---

## Summary

The Manuscript Detail page now displays real, database-driven file data:

✅ **Files upload** with correct user-scoped paths  
✅ **Manuscript created** with consistent ID  
✅ **Files synced** to database with correct manuscript_id  
✅ **Detail page loads** actual files from database  
✅ **Real-time updates** work automatically  
✅ **Data persists** across sessions  

The fix is backward compatible and doesn't require data migration. All new submissions will work correctly immediately.
