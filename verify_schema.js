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

async function verifySchema() {
  console.log('\n=== DATABASE SCHEMA VERIFICATION ===\n');

  const requiredTables = [
    'manuscripts',
    'editor_assignments',
    'reviewer_assignments',
    'manuscript_files',
    'manuscript_contributors',
    'manuscript_discussions',
    'manuscript_status_history',
    'workflow_notifications',
    'profiles',
    'manuscript_suggested_reviewers',
    'manuscript_revisions'
  ];

  const manuscriptColumns = [
    'id', 'title', 'abstract', 'author_id', 'status',
    'assigned_editor_id', 'submitted_at', 'created_at'
  ];

  const editorAssignmentColumns = [
    'id', 'manuscript_id', 'editor_id', 'status',
    'assigned_at', 'responded_at', 'assessment_status',
    'assessment_submitted_at', 'recommendation', 'recommendation_submitted_at'
  ];

  // Test each table
  for (const table of requiredTables) {
    console.log(`\nChecking table: ${table}`);

    try {
      // Try to select 1 row to verify table exists
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        if (error.code === 'PGRST116') {
          console.log(`  ✗ Table does not exist`);
        } else {
          console.log(`  ✗ Error: ${error.message}`);
        }
      } else {
        console.log(`  ✓ Table exists`);

        // Show columns for manuscripts and editor_assignments
        if (table === 'manuscripts' && data && data.length > 0) {
          const sample = data[0];
          console.log(`    Sample record columns:`);
          manuscriptColumns.forEach(col => {
            if (col in sample) {
              console.log(`      ✓ ${col}: ${typeof sample[col]} = ${JSON.stringify(sample[col]).substring(0, 50)}`);
            } else {
              console.log(`      ✗ MISSING: ${col}`);
            }
          });
        }

        if (table === 'editor_assignments' && data && data.length > 0) {
          const sample = data[0];
          console.log(`    Sample record columns:`);
          editorAssignmentColumns.forEach(col => {
            if (col in sample) {
              console.log(`      ✓ ${col}: ${typeof sample[col]}`);
            } else {
              console.log(`      ✗ MISSING: ${col}`);
            }
          });
        }
      }
    } catch (err) {
      console.log(`  ✗ Exception: ${err.message}`);
    }
  }

  // Check for sample data
  console.log('\n\n=== DATA INTEGRITY CHECK ===\n');

  try {
    const { data: manuscripts } = await supabaseAdmin
      .from('manuscripts')
      .select('id, title, author_id, status')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('Recent manuscripts:');
    if (manuscripts && manuscripts.length > 0) {
      manuscripts.forEach(m => {
        console.log(`  - ${m.id}: "${m.title?.substring(0, 50)}..." (${m.status})`);
      });
    } else {
      console.log('  (No manuscripts in database)');
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  try {
    const { data: assignments } = await supabaseAdmin
      .from('editor_assignments')
      .select('id, manuscript_id, editor_id, status')
      .order('assigned_at', { ascending: false })
      .limit(5);

    console.log('\nRecent editor assignments:');
    if (assignments && assignments.length > 0) {
      assignments.forEach(a => {
        console.log(`  - ${a.id}: manuscript=${a.manuscript_id} editor=${a.editor_id} status=${a.status}`);
      });
    } else {
      console.log('  (No assignments in database)');
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  try {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, status')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('\nProfiles:');
    if (profiles && profiles.length > 0) {
      profiles.forEach(p => {
        console.log(`  - ${p.email} (${p.role}) - ${p.status}`);
      });
    } else {
      console.log('  (No profiles in database)');
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n=== DONE ===\n');
}

verifySchema();
