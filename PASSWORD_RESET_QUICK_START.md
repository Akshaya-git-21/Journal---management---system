# Password Reset Implementation - Quick Start Guide

## For Developers: 5-Minute Overview

### What Was Implemented

Complete password reset flow with:
- ✅ Forgot Password screen (email request)
- ✅ Reset Password screen (password update)
- ✅ Supabase integration (secure tokens)
- ✅ Professional UI matching app design
- ✅ Full validation and error handling
- ✅ Security best practices

### Key Files (Know These)

| File | Purpose | Type |
|------|---------|------|
| `src/components/ForgotPasswordScreen.tsx` | Email request UI | NEW |
| `src/components/ResetPasswordScreen.tsx` | Password reset UI | NEW |
| `src/lib/auth.ts` | Auth functions | MODIFIED |
| `src/components/AuthPortals.tsx` | Main auth component | MODIFIED |
| `src/App.tsx` | App routing | MODIFIED |
| `server.ts` | Backend endpoints | MODIFIED |

### How It Works (User Flow)

```
User clicks "Forgot Password?"
    ↓
Enters email → Supabase sends reset email
    ↓
Clicks email link → Automatically creates recovery session
    ↓
ResetPasswordScreen loads (with validation)
    ↓
Enters new password → Supabase updates password
    ↓
Redirected to Login → Can now login with new password
```

### For Testing

**Test the frontend (no Supabase config needed):**

```bash
# 1. Start dev server
npm run dev

# 2. Go to http://localhost:3000
# 3. Click "Sign In / Login"
# 4. Click "Forgot Password?"
# 5. Enter any email (test@example.com)
# 6. Click "Send Reset Link"
# 7. See success message ✅
```

**Test the full flow (requires Supabase):**

```bash
# 1. Deploy to production or use real Supabase project
# 2. Create a test user account
# 3. Request password reset with that email
# 4. Check email for reset link
# 5. Click link in email
# 6. ResetPasswordScreen appears
# 7. Enter new password
# 8. Success - login with new password ✅
```

### Key Functions to Know

#### 1. Request Password Reset (Frontend)
```typescript
import { requestPasswordReset } from '@/lib/auth';

// User clicked "Send Reset Link"
await requestPasswordReset(email); // Supabase sends email
```

#### 2. Validate & Reset Password
```typescript
import { resetPasswordWithToken } from '@/lib/auth';

// User submitted new password
await resetPasswordWithToken(newPassword, confirmPassword);
// Supabase updates password using recovery session
```

#### 3. Check Reset Session (Backend)
```bash
POST /api/validate-reset-session
Authorization: Bearer <session_token>
```

### No Database Changes Needed

The existing `profiles` table works as-is. Password storage happens in Supabase's `auth.users` table automatically.

### Environment Variables

**No new env vars needed.** Uses existing:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### What's Secure

✅ Passwords: bcrypt hashed, never logged  
✅ Reset tokens: 24-hour expiration, single-use  
✅ Email: Only sent from Supabase  
✅ Account enumeration: Protected (no "user not found" message)  
✅ Validation: Both frontend and backend  

### Deployment Steps

1. **Test locally:**
   ```bash
   npm run dev
   # Verify Forgot Password button works
   # (Success message confirms email sending logic)
   ```

2. **Configure Supabase:**
   - Go to Supabase dashboard
   - Auth → Email Templates
   - Verify "Reset Password" template exists
   - Customize if needed

3. **Set Redirect URLs:**
   - Go to Supabase dashboard
   - Auth → URL Configuration
   - Add your production domain
   - Format: `https://yourdomain.com`

4. **Deploy code:**
   ```bash
   # Deploy to production as normal
   npm run build
   # Server restarts with new code
   ```

5. **Test in production:**
   - Go to login
   - Click "Forgot Password?"
   - Enter real email
   - Check email for reset link
   - Verify can reset password and login

### Common Customizations

#### Change Email Redirect URL
File: `src/lib/auth.ts` line 175-177

Current:
```typescript
redirectTo: `${window.location.origin}/?mode=reset-password`
```

Customize to:
```typescript
redirectTo: `https://myapp.com/reset-password`
// Then handle ?token=xxx parameter
```

#### Customize Email Template
Go to Supabase Dashboard:
1. Click "Project" → "Settings"
2. Go to "Auth" → "Email Templates"
3. Find "Reset Password" template
4. Click "Edit" and customize

#### Add Rate Limiting
Wrap `requestPasswordReset()` with rate limiting:

```typescript
// src/lib/auth.ts
const resetAttempts = new Map();

export async function requestPasswordReset(email: string) {
  const key = email.toLowerCase();
  const attempts = resetAttempts.get(key) || 0;
  
  if (attempts >= 3) {
    throw new Error('Too many reset attempts. Try again later.');
  }
  
  resetAttempts.set(key, attempts + 1);
  // Clear after 1 hour
  setTimeout(() => resetAttempts.delete(key), 60 * 60 * 1000);
  
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?mode=reset-password`
  });
}
```

### Troubleshooting

| Problem | Check |
|---------|-------|
| No email received | Supabase email provider configured? |
| "Invalid token" | Is link older than 24 hours? |
| Can't login after reset | Using new password? Clear cache? |
| Button doesn't work | Email field has valid format? |
| No success message | Console errors? Network error? |

### Security Checklist (Pre-Production)

- [ ] HTTPS enabled on production domain
- [ ] Supabase project configured (not dev/local)
- [ ] Email provider working (test email sent)
- [ ] Reset link template customized (optional)
- [ ] Production domain in Supabase redirects
- [ ] Tested on real browser (not just dev)
- [ ] Tested on mobile device
- [ ] Verified old password fails after reset
- [ ] Verified reset link expires/can't be reused
- [ ] Verified error messages don't expose account info

### Production Monitoring

After deployment, monitor:
```
✓ Password reset request count
✓ Email delivery success rate
✓ Reset link click-through rate
✓ Password update success rate
✓ Login success after reset
✓ Error message frequency
```

### When Something Goes Wrong

1. **Check Supabase dashboard logs**
   - Project → Logs
   - Look for auth.users updates
   - Check email sending errors

2. **Check app console**
   ```bash
   # Browser dev tools → Console
   # Look for error messages
   # Check network requests
   ```

3. **Check server logs**
   ```bash
   # npm run dev output
   # Look for API endpoint errors
   # Check validation failures
   ```

4. **Test endpoint directly**
   ```bash
   curl -X POST http://localhost:3000/api/validate-reset-session \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json"
   ```

### Questions?

Refer to main documentation: `PASSWORD_RESET_IMPLEMENTATION.md`

Key sections:
- Security Requirements (section 4)
- Testing Performed (section 5)
- Troubleshooting (section 15)
- Complete Flow (section 3)

---

**Version:** 1.0  
**Last Updated:** August 14, 2026
