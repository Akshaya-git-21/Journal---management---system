import { createClient } from '@supabase/supabase-js';
import { Manuscript, Role } from '../types';

// Supabase Connection Credentials (hardcoded from requested parameters as fail-safe, and supports env variables)
const SUPABASE_PROJECT_ID = 'uqevcpokthdqlispnxyz';
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT_ID}.supabase.co`;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8rW2Vf6u40k0rdZHd7H7UQ_l8tzw8Ho';

console.log("[Supabase Init] URL:", SUPABASE_URL);
console.log("[Supabase Init] Anon Key Loaded:", SUPABASE_ANON_KEY ? `Yes (length: ${SUPABASE_ANON_KEY.length}, starting with: ${SUPABASE_ANON_KEY.substring(0, 15)}...)` : "No");

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
    language: dbItem.language || 'en'
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
    file_name: m.fileName,
    file_size: m.fileSize,
    uploaded_at: m.uploadedAt,
    storage_path: m.storagePath || null,
    public_url: m.publicUrl || null,
    contributors: m.contributors,
    status: m.status,
    submitted_at: m.submittedAt,
    reviewers: m.reviewers,
    suggested_reviewers: m.suggestedReviewers,
    discussions: m.discussions,
    doi: m.doi,
    volume: m.volume,
    issue: m.issue,
    published_at: m.publishedAt,
    author_id: m.authorId,
    author_name: m.authorName,
    author_email: m.authorEmail,
    submission_step: m.submissionStep,
    editors_notes: m.editorsNotes,
    language: m.language || 'en'
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
 * Save or update a manuscript in Supabase
 */
export async function upsertManuscriptToDb(manuscript: Manuscript): Promise<void> {
  const dbPayload = mapManuscriptToDb(manuscript);
  
  // Set updated timestamp
  dbPayload.updated_at = new Date().toISOString();

  const tryUpsert = async (payload: any) => {
    const { error } = await supabase
      .from('manuscripts')
      .upsert(payload, { onConflict: 'id' });
    return error;
  };

  try {
    let error = await tryUpsert(dbPayload);

    if (error) {
      // If the error indicates missing columns, let's gracefully remove them and retry
      if (
        error.message?.includes('references') || 
        error.message?.includes('storage_path') || 
        error.message?.includes('public_url') || 
        error.message?.includes('schema cache') || 
        error.message?.includes('column')
      ) {
        console.warn("[Supabase] Custom columns missing in database. Retrying upsert with standard fallback columns...", error.message);
        
        // Strip non-standard columns on retry
        const strippedPayload = { ...dbPayload };
        delete strippedPayload.references;
        delete strippedPayload.storage_path;
        delete strippedPayload.public_url;

        const retryError = await tryUpsert(strippedPayload);
        if (retryError) {
          throw new Error(retryError.message);
        }
        return;
      }
      throw new Error(error.message);
    }
  } catch (err: any) {
    console.error("[Supabase Upsert Failure]:", err);
    throw err;
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
 * Register a user via Supabase Auth and save role in the profiles table
 */
export async function registerSupabaseUser(
  email: string,
  password: string,
  fullName: string,
  role: Role,
  metaData: Record<string, any> = {}
): Promise<{ user: any; profile: any }> {
  console.log("[Supabase Auth - Register Request]");
  console.log("- Supabase URL:", SUPABASE_URL);
  console.log("- Register Email ID:", email);
  console.log("- Register Password Length:", password ? password.length : 0);
  console.log("- Register Full Name:", fullName);
  console.log("- Register Selected Role:", role);

  // 1. Sign up the user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role
      }
    }
  });

  console.log("[Supabase Auth - Register Response]");
  console.log("- Response Data:", authData);
  console.log("- Response Error:", authError);

  if (authError) {
    console.error("[Supabase Auth - Registration Error Details]:", authError);
    throw authError;
  }

  const user = authData.user;
  if (!user) {
    throw new Error('Sign up completed but user session is null.');
  }

  // 2. Insert into profiles table
  const profilePayload = {
    id: user.id,
    email: email,
    name: fullName,
    role: role,
    metadata: metaData,
    created_at: new Date().toISOString()
  };

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .upsert(profilePayload)
    .select()
    .single();

  // If table doesn't exist, we log but don't fail, since role metadata is stored in auth.users user_metadata as well!
  if (profileError) {
    console.warn('Profiles table insert failed (probably schema not created yet):', profileError.message);
  }

  return { user, profile: profileData || profilePayload };
}

/**
 * Login a user via Supabase Auth and load their role
 */
export async function loginSupabaseUser(email: string, password: string): Promise<{ name: string; email: string; role: Role }> {
  console.log("[Supabase Auth - Login Request]");
  console.log("- Supabase URL:", SUPABASE_URL);
  console.log("- Supplying Email ID:", email);
  console.log("- Supplying Password Length:", password ? password.length : 0);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  console.log("[Supabase Auth - Login Response]");
  console.log("- Response Data:", data);
  console.log("- Response Error:", error);

  // Retrieve and print current session details
  const { data: sessionData } = await supabase.auth.getSession();
  console.log("[Supabase Auth - Current Session]:", sessionData?.session);

  if (error) {
    console.error("[Supabase Auth - Authentication Error Details]:", error);
    throw error;
  }

  const user = data.user;
  if (!user) {
    throw new Error('User logged in but session is null.');
  }

  // Print the authenticated user ID in the browser console
  console.log("[Supabase Auth] Authenticated User ID:", user.id);

  // Determine user role and name
  let role: Role = (user.user_metadata?.role as Role) || 'AUTHOR';
  let name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';

  // Double-check with profiles table if available
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', user.id)
      .single();

    if (!profileError && profile) {
      if (profile.role) role = profile.role as Role;
      if (profile.name) name = profile.name;
    }
  } catch (err) {
    console.warn('Could not load profile from table:', err);
  }

  return { name, email: user.email || email, role };
}

/**
 * Upload a file to Supabase storage 'manuscripts' bucket
 */
export async function uploadManuscriptFile(file: File, manuscriptId: string): Promise<{ path: string; publicUrl: string }> {
  const fileExt = file.name.split('.').pop();
  const filePath = `${manuscriptId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

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
}

/**
 * Get SQL schema script that the user can copy-paste into Supabase SQL Editor
 */
export function getSupabaseSQLScript(): string {
  return `-- ==========================================
-- Supabase SQL Schema for OJS JMS Platform
-- Paste this script into your Supabase SQL Editor
-- ==========================================

-- 1. Create profiles table linked to Auth users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT CHECK (role IN ('AUTHOR', 'EDITOR', 'REVIEWER', 'PUBLISHER', 'ARCHITECT', 'COORDINATOR')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

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
