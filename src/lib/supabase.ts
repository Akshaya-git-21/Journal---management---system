import { createClient } from '@supabase/supabase-js';
import { Manuscript } from '../types';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in your .env file (see .env.example).'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Table check helper to see if connection is fully migrated
export async function checkSupabaseConnection(): Promise<{ connected: boolean; schemaExists: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.from('manuscripts').select('id').limit(1);
    if (error) {
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return { connected: true, schemaExists: false, error: 'Database tables do not exist yet. Please run the SQL schema in your Supabase SQL Editor.' };
      }
      return { connected: false, schemaExists: false, error: error.message };
    }
    return { connected: true, schemaExists: true };
  } catch (err: any) {
    return { connected: false, schemaExists: false, error: err.message || 'Network connection failed.' };
  }
}

// Map database column names (snake_case) to typescript keys (camelCase)
export function mapDbToManuscript(dbItem: any): Manuscript {
  return {
    id: dbItem.id,
    title: dbItem.title || '',
    abstract: dbItem.abstract || '',
    references: dbItem.references || '',
    isDoubleBlind: dbItem.is_double_blind ?? true,
    coverLetter: dbItem.cover_letter || '',
    fileName: dbItem.file_name || null,
    fileSize: dbItem.file_size || null,
    uploadedAt: dbItem.uploaded_at || null,
    storagePath: dbItem.storage_path || null,
    publicUrl: dbItem.public_url || null,
    uploadedFiles: Array.isArray(dbItem.uploaded_files) ? dbItem.uploaded_files : [],
    revisions: Array.isArray(dbItem.revisions) ? dbItem.revisions : [],
    contributors: Array.isArray(dbItem.contributors) ? dbItem.contributors : [],
    status: dbItem.status || 'DRAFT',
    submittedAt: dbItem.submitted_at || null,
    reviewers: Array.isArray(dbItem.reviewers) ? dbItem.reviewers : [],
    suggestedReviewers: Array.isArray(dbItem.suggested_reviewers) ? dbItem.suggested_reviewers : [],
    discussions: Array.isArray(dbItem.discussions) ? dbItem.discussions : [],
    doi: dbItem.doi || null,
    volume: dbItem.volume || null,
    issue: dbItem.issue || null,
    publishedAt: dbItem.published_at || null,
    authorId: dbItem.author_id || '',
    authorName: dbItem.author_name || '',
    authorEmail: dbItem.author_email || '',
    submissionStep: dbItem.submission_step ?? 1,
    editorsNotes: dbItem.editors_notes || '',
    language: dbItem.language || 'en',
    assignedEditor: null,
    assignedEditorEmail: null
  };
}

// Map typescript Manuscript keys (camelCase) to database columns (snake_case)
export function mapManuscriptToDb(m: Manuscript): any {
  return {
    id: m.id,
    title: m.title,
    abstract: m.abstract,
    references: m.references,
    is_double_blind: m.isDoubleBlind,
    cover_letter: m.coverLetter,
    status: m.status,
    submitted_at: m.submittedAt,
    author_id: m.authorId,
    author_name: m.authorName,
    author_email: m.authorEmail,
    submission_step: m.submissionStep,
    editors_notes: m.editorsNotes,
    language: m.language || 'en',
    doi: m.doi,
    volume: m.volume,
    issue: m.issue,
    published_at: m.publishedAt
  };
}

/**
 * Fetch all manuscripts from Supabase
 */
export async function getManuscriptsFromDb(): Promise<Manuscript[]> {
  const { data, error } = await supabase
    .from('manuscripts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapDbToManuscript);
}

/**
 * Ensure the current user has an ACTIVE AUTHOR profile via server-side RPC.
 * Bypasses RLS by using a SECURITY DEFINER function.
 */
export async function ensureAuthorProfile(): Promise<void> {
  try {
    console.log('[PROFILE] Ensuring AUTHOR profile via RPC...');

    const { data, error } = await supabase.rpc('ensure_author_profile');

    if (error) {
      console.error('[PROFILE] RPC error:', error.message);
      throw error;
    }

    console.log('[PROFILE] AUTHOR profile is ready:', data);
  } catch (err: any) {
    console.warn('[PROFILE] Error ensuring profile:', err.message);
    // Don't fail the entire operation, just log the warning
  }
}

/**
 * Save or update a manuscript in Supabase
 */
export async function upsertManuscriptToDb(manuscript: Manuscript): Promise<void> {
  const dbPayload = mapManuscriptToDb(manuscript);

  // Set updated timestamp
  dbPayload.updated_at = new Date().toISOString();

  try {
    const { error } = await supabase
      .from('manuscripts')
      .upsert(dbPayload, { onConflict: 'id' });

    if (error) {
      console.error("[Supabase Upsert Error] Full error details:", error);
      throw new Error(`[Supabase] Failed to save manuscript: ${error.message}`);
    }
  } catch (err: any) {
    console.error("[Supabase Upsert Error]:", err.message || err);
    throw err;
  }
}

/**
 * Subscribe to Real-Time updates on manuscripts table in Supabase
 */
export function subscribeToManuscriptsRealtime(onUpdate: (manuscript: Manuscript) => void): () => void {
  const channel = supabase
    .channel('public:manuscripts_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'manuscripts' },
      (payload) => {
        console.log('[Supabase Realtime Event Received]:', payload.eventType, payload);
        if (payload.new && typeof payload.new === 'object') {
          const updatedMs = mapDbToManuscript(payload.new);
          onUpdate(updatedMs);
        }
      }
    )
    .subscribe((status) => {
      console.log('[Supabase Realtime Channel Status]:', status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Sync Uploaded Files specifically to Supabase database
 */
export async function syncManuscriptFilesToSupabase(manuscriptId: string, uploadedFiles: any[]): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('manuscripts')
      .select('*')
      .eq('id', manuscriptId)
      .single();

    if (existing) {
      const updatedItem = mapManuscriptToDb({
        ...existing,
        uploadedFiles: uploadedFiles
      } as Manuscript);
      updatedItem.updated_at = new Date().toISOString();
      await supabase.from('manuscripts').upsert(updatedItem, { onConflict: 'id' });
    }
  } catch (err) {
    console.warn('[Supabase Sync Files Warning]:', err);
  }
}

/**
 * Sync Discussions specifically to Supabase database
 */
export async function syncManuscriptDiscussionsToSupabase(manuscriptId: string, discussions: any[]): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('manuscripts')
      .select('*')
      .eq('id', manuscriptId)
      .single();

    if (existing) {
      const updatedItem = mapManuscriptToDb({
        ...existing,
        discussions: discussions
      } as Manuscript);
      updatedItem.updated_at = new Date().toISOString();
      await supabase.from('manuscripts').upsert(updatedItem, { onConflict: 'id' });
    }
  } catch (err) {
    console.warn('[Supabase Sync Discussions Warning]:', err);
  }
}

/**
 * Delete a manuscript from Supabase
 */
export async function deleteManuscriptFromDb(id: string): Promise<void> {
  const { error } = await supabase
    .from('manuscripts')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Upload a file to Supabase storage 'manuscripts' bucket
 * Uses user ID as path prefix since manuscript ID doesn't exist yet during submission
 */
export async function uploadManuscriptFile(file: File, manuscriptId?: string): Promise<{ path: string; publicUrl: string }> {
  try {
    // Get current authenticated user ID
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!user || userError) {
      throw new Error('User not authenticated');
    }

    // Use user ID as path prefix (manuscript ID will be set when syncing to database)
    const filePathPrefix = user.id;
    const filePath = `${filePathPrefix}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

    // Upload file
    const { data, error } = await supabase.storage
      .from('manuscript-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      throw new Error(error.message);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('manuscript-files')
      .getPublicUrl(filePath);

    return {
      path: data.path,
      publicUrl: urlData.publicUrl
    };
  } catch (err: any) {
    console.error('[File Upload Error]:', err.message);
    throw err;
  }
}

/**
 * Get SQL schema script that the user can copy-paste into Supabase SQL Editor
 */
export function getSupabaseSQLScript(): string {
  return `-- ==========================================
-- Supabase SQL Schema for OJS JMS Platform
-- Paste this script into your Supabase SQL Editor
-- ==========================================

-- 1. Profiles, roles, and approval workflow.
--    Run supabase/migrations/0001_profiles_rbac.sql for this part -- it is
--    NOT duplicated here because it must stay idempotent against a
--    profiles table that may already exist from an earlier version of this
--    app, and keeping the same SQL in two places is exactly how that goes
--    stale (ALTER TABLE ... ADD COLUMN IF NOT EXISTS, backfills, and the
--    handle_new_user() trigger / approve_user_role() RPC all live there).

-- 2. Create manuscripts table
CREATE TABLE IF NOT EXISTS public.manuscripts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT,
  "references" TEXT,
  is_double_blind BOOLEAN DEFAULT true,
  cover_letter TEXT,
  file_name TEXT,
  file_size TEXT,
  uploaded_at TEXT,
  storage_path TEXT,
  public_url TEXT,
  uploaded_files JSONB DEFAULT '[]'::jsonb,
  contributors JSONB DEFAULT '[]'::jsonb,
  status TEXT CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_DECISION', 'ACCEPTED', 'PUBLISHED', 'REJECTED')),
  submitted_at TEXT,
  reviewers JSONB DEFAULT '[]'::jsonb,
  suggested_reviewers JSONB DEFAULT '[]'::jsonb,
  discussions JSONB DEFAULT '[]'::jsonb,
  doi TEXT,
  volume TEXT,
  issue TEXT,
  published_at TEXT,
  author_id TEXT,
  author_name TEXT,
  author_email TEXT,
  submission_step INTEGER DEFAULT 1,
  editors_notes TEXT DEFAULT '',
  language TEXT DEFAULT 'en',
  assigned_editor TEXT,
  assigned_editor_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on manuscripts
ALTER TABLE public.manuscripts ENABLE ROW LEVEL SECURITY;

-- Manuscripts policies
CREATE POLICY "Manuscripts are viewable by authenticated users" ON public.manuscripts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authors can insert their own manuscripts" ON public.manuscripts
  FOR INSERT WITH CHECK (true); -- Usually checked by RLS role filters or authenticated trigger

CREATE POLICY "Authenticated users can update manuscripts" ON public.manuscripts
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete manuscripts" ON public.manuscripts
  FOR DELETE USING (auth.role() = 'authenticated');

-- 3. Storage Bucket Configuration
-- Note: Create a bucket named 'manuscript-files' in your Supabase Storage UI with public access.
-- The following SQL script attempts to provision it automatically if policies allow.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('manuscript-files', 'manuscript-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for manuscript-files
CREATE POLICY "Manuscript files are public" ON storage.objects
  FOR SELECT USING (bucket_id = 'manuscript-files');

CREATE POLICY "Authenticated users can upload manuscript files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'manuscript-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update/delete manuscript files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'manuscript-files' AND auth.role() = 'authenticated');
`;
}
