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

async function resetPassword() {
  console.log('\n=== RESETTING EDITOR PASSWORD ===\n');

  try {
    // Find the editor user
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const editorUser = users?.users?.find(u => u.email === 'sarah@edutech.com');

    if (!editorUser) {
      console.error('ERROR: Editor user (sarah@edutech.com) not found');
      process.exit(1);
    }

    console.log(`Found editor user: ${editorUser.email}`);
    console.log(`User ID: ${editorUser.id}`);

    // Update password
    console.log('\nUpdating password to: EditorPass123!');
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      editorUser.id,
      { password: 'EditorPass123!' }
    );

    if (error) {
      console.error('ERROR updating password:', error.message);
      process.exit(1);
    }

    console.log('✓ Password updated successfully!');
    console.log('\nTest credentials:');
    console.log('  Email: sarah@edutech.com');
    console.log('  Password: EditorPass123!');

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

resetPassword();
