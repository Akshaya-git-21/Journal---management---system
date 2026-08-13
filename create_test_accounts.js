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

async function createTestAccounts() {
  try {
    console.log('\n=== CREATING/UPDATING TEST ACCOUNTS ===');

    // Create Coordinator account
    console.log('\n1. Creating Coordinator Account (coordinator@edutech.com)...');
    const { data: coordData, error: coordError } = await supabaseAdmin.auth.admin.createUser({
      email: 'coordinator@edutech.com',
      password: 'CoordinatorPass123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'Test Coordinator',
        requested_role: 'COORDINATOR'
      }
    });

    if (coordError) {
      if (coordError.message.includes('already exists')) {
        console.log('   Coordinator account already exists. Updating password...');
        // Find existing user
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const existingCoord = users?.users?.find(u => u.email === 'coordinator@edutech.com');
        if (existingCoord) {
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existingCoord.id,
            { password: 'CoordinatorPass123!' }
          );
          if (updateError) {
            console.error('   ERROR updating password:', updateError.message);
          } else {
            console.log('   ✓ Password updated successfully');
          }
        }
      } else {
        console.error('   ERROR:', coordError.message);
        return;
      }
    } else {
      console.log('   ✓ Coordinator account created');
      console.log(`   ID: ${coordData.user.id}`);
      console.log(`   Email: ${coordData.user.email}`);
    }

    // Create/Update profile for coordinator
    console.log('\n2. Creating/Updating Coordinator Profile...');
    const coordId = coordData?.user?.id || (await supabaseAdmin.auth.admin.listUsers()).data.users?.find(u => u.email === 'coordinator@edutech.com')?.id;

    if (coordId) {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', coordId)
        .single();

      if (existingProfile) {
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            role: 'COORDINATOR',
            status: 'ACTIVE'
          })
          .eq('id', coordId);

        if (updateError) {
          console.error('   ERROR updating profile:', updateError.message);
        } else {
          console.log('   ✓ Profile updated');
        }
      } else {
        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: coordId,
            email: 'coordinator@edutech.com',
            name: 'Test Coordinator',
            role: 'COORDINATOR',
            requested_role: 'COORDINATOR',
            status: 'ACTIVE'
          });

        if (insertError) {
          console.error('   ERROR creating profile:', insertError.message);
        } else {
          console.log('   ✓ Profile created');
        }
      }
    }

    // Update Editor password
    console.log('\n3. Updating Editor Password (sarah@edutech.com)...');
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const editorUser = users?.users?.find(u => u.email === 'sarah@edutech.com');

    if (editorUser) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        editorUser.id,
        { password: 'TestPass123!' }
      );

      if (updateError) {
        console.error('   ERROR updating password:', updateError.message);
      } else {
        console.log('   ✓ Editor password set to: TestPass123!');
        console.log(`   ID: ${editorUser.id}`);
        console.log(`   Email: ${editorUser.email}`);
      }
    } else {
      console.error('   ERROR: Editor account not found');
    }

    console.log('\n=== TEST ACCOUNTS READY ===');
    console.log('\nTest Credentials:');
    console.log('  Coordinator: coordinator@edutech.com / CoordinatorPass123!');
    console.log('  Editor: sarah@edutech.com / TestPass123!');

  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

createTestAccounts();
