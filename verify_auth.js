import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

console.log('\n=== ENVIRONMENT VERIFICATION ===');
console.log(`SUPABASE_URL: ${SUPABASE_URL}`);
console.log(`VITE_SUPABASE_ANON_KEY exists: ${!!VITE_SUPABASE_ANON_KEY}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY exists: ${!!SUPABASE_SERVICE_ROLE_KEY}`);

if (!SUPABASE_URL) {
  console.error('ERROR: SUPABASE_URL not configured');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not configured');
  process.exit(1);
}

// Create admin client
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function verifyAuth() {
  try {
    console.log('\n=== CHECKING AUTH USERS ===');

    // Check if coordinator@edutech.com exists
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error('ERROR fetching users:', error.message);
      return;
    }

    console.log(`Total auth users in project: ${users?.users?.length || 0}`);

    const coordinatorUser = users?.users?.find(u => u.email === 'coordinator@edutech.com');
    const editorUser = users?.users?.find(u => u.email === 'sarah@edutech.com');

    console.log('\n=== COORDINATOR USER ===');
    if (coordinatorUser) {
      console.log(`✓ coordinator@edutech.com EXISTS`);
      console.log(`  ID: ${coordinatorUser.id}`);
      console.log(`  Email confirmed: ${coordinatorUser.email_confirmed_at ? 'YES' : 'NO'}`);
      console.log(`  Created at: ${coordinatorUser.created_at}`);
      console.log(`  Last sign in: ${coordinatorUser.last_sign_in_at || 'NEVER'}`);
      console.log(`  Banned: ${coordinatorUser.banned_until ? 'YES' : 'NO'}`);
    } else {
      console.log(`✗ coordinator@edutech.com DOES NOT EXIST`);
      console.log('  List of auth users:');
      users?.users?.forEach(u => {
        console.log(`    - ${u.email} (${u.id})`);
      });
    }

    console.log('\n=== EDITOR USER ===');
    if (editorUser) {
      console.log(`✓ sarah@edutech.com EXISTS`);
      console.log(`  ID: ${editorUser.id}`);
      console.log(`  Email confirmed: ${editorUser.email_confirmed_at ? 'YES' : 'NO'}`);
      console.log(`  Created at: ${editorUser.created_at}`);
      console.log(`  Last sign in: ${editorUser.last_sign_in_at || 'NEVER'}`);
      console.log(`  Banned: ${editorUser.banned_until ? 'YES' : 'NO'}`);
    } else {
      console.log(`✗ sarah@edutech.com DOES NOT EXIST`);
    }

    // Check profiles
    console.log('\n=== CHECKING PROFILES ===');
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .in('email', ['coordinator@edutech.com', 'sarah@edutech.com']);

    if (profileError) {
      console.error('ERROR fetching profiles:', profileError.message);
    } else {
      console.log(`Found ${profiles?.length || 0} profiles`);
      profiles?.forEach(p => {
        console.log(`\n  Profile: ${p.email}`);
        console.log(`    ID: ${p.id}`);
        console.log(`    Name: ${p.name}`);
        console.log(`    Role: ${p.role}`);
        console.log(`    Requested Role: ${p.requested_role}`);
        console.log(`    Status: ${p.status}`);
      });
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

verifyAuth();
