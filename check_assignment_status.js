import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function checkAssignments() {
  console.log('\n=== CHECKING EDITOR ASSIGNMENT STATUS ===\n');

  try {
    const { data: assignments } = await supabaseAdmin
      .from('editor_assignments')
      .select('id, manuscript_id, editor_id, status, assigned_at, responded_at')
      .order('assigned_at', { ascending: false })
      .limit(10);

    console.log('Recent editor assignments:');
    if (assignments && assignments.length > 0) {
      assignments.forEach(a => {
        console.log(`\n  Manuscript: ${a.manuscript_id}`);
        console.log(`  Editor: ${a.editor_id}`);
        console.log(`  Status: ${a.status}`);
        console.log(`  Assigned: ${a.assigned_at}`);
        console.log(`  Responded: ${a.responded_at || '(not yet)'}`);
      });
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n');
}

checkAssignments();
