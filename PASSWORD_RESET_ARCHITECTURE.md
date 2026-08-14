# Password Reset Flow - Technical Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER BROWSER                             │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         React Application (SPA)                      │  │
│  │                                                        │  │
│  │  AuthPortals.tsx (LOGIN mode)                        │  │
│  │    ↓ User clicks "Forgot Password?"                  │  │
│  │  AuthPortals.tsx (FORGOT_PASSWORD mode)             │  │
│  │    ↓ ForgotPasswordScreen.tsx                       │  │
│  │    ↓ User enters email, clicks "Send Reset Link"   │  │
│  │  App.tsx → requestPasswordReset(email)             │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                    │
│                  (HTTPS POST REQUEST)                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         SUPABASE AUTH (Cloud-Hosted)                        │
│                                                               │
│  POST /auth/v1/recover                                      │
│    ├─ Validate email exists in auth.users                  │
│    ├─ Generate secure 256-bit reset token                  │
│    ├─ Store token in session table (24h expiry)            │
│    └─ Send email with reset link                           │
│        Format: https://app.com/?mode=reset-password#token  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    USER RECEIVES EMAIL
                            ↓
                   USER CLICKS EMAIL LINK
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    USER BROWSER                             │
│                                                               │
│  Browser receives URL: /?mode=reset-password#access_token  │
│    ├─ Token in fragment (not sent to server)               │
│    ├─ Supabase JS SDK automatically handles token          │
│    └─ Creates temporary recovery session                   │
│                                                               │
│  App.tsx detects ?mode=reset-password                       │
│    ├─ Sets showResetPasswordScreen = true                  │
│    └─ Renders ResetPasswordScreen.tsx                      │
│                                                               │
│  ResetPasswordScreen.tsx                                    │
│    ├─ User enters new password                             │
│    ├─ Validates password strength (8+ chars, etc.)         │
│    ├─ User confirms password                               │
│    ├─ Validates passwords match                            │
│    └─ User clicks "Update Password"                        │
│                                                               │
│  ResetPasswordScreen.tsx → resetPasswordWithToken()        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
                  (HTTPS POST REQUEST)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         SUPABASE AUTH (Cloud-Hosted)                        │
│                                                               │
│  POST /auth/v1/user                                         │
│    (with Authorization: Bearer <recovery_token>)           │
│                                                               │
│    ├─ Validate token is valid recovery session             │
│    ├─ Validate token has not expired                       │
│    ├─ Hash new password with bcrypt                        │
│    ├─ Update auth.users.encrypted_password                │
│    ├─ Invalidate recovery session                          │
│    └─ Return 200 OK                                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    USER BROWSER                             │
│                                                               │
│  ResetPasswordScreen shows success message                 │
│    ├─ "Your password has been reset successfully!"        │
│    └─ Auto-redirect to login after 2 seconds              │
│                                                               │
│  App.tsx → setShowResetPasswordScreen(false)               │
│    ├─ Shows AuthPortals with LOGIN mode                   │
│    ├─ User can now login with new password                │
│    └─ Old password no longer works                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
App.tsx
├── Manages: showResetPasswordScreen, authMode, authRole
├── Handles: URL parameter detection (?mode=reset-password)
└── Renders:
    ├── When NOT reset: AuthPortals
    │   ├── LOGIN mode: Login form
    │   ├── REGISTER mode: Registration form
    │   └── FORGOT_PASSWORD mode: ForgotPasswordScreen
    │       └── ForgotPasswordScreen.tsx (NEW)
    │           ├── Input: email
    │           ├── Action: Call requestPasswordReset()
    │           └── Output: Success message or error
    │
    └── When reset: ResetPasswordScreen (NEW)
        ├── Input: new password, confirm password
        ├── Action: Call resetPasswordWithToken()
        └── Output: Success redirect or error
```

---

## Authentication Flow State Machine

```
┌─────────────────────────────────┐
│   LOGIN SCREEN                  │
│  (AuthPortals + LOGIN mode)     │
└──────────┬──────────────────────┘
           │
           ├─ User clicks "Forgot Password?"
           │
           ▼
┌─────────────────────────────────┐
│ FORGOT PASSWORD SCREEN          │
│(AuthPortals + FORGOT_PASSWORD)  │
│ - Email input field             │
│ - "Send Reset Link" button      │
└──────────┬──────────────────────┘
           │
           ├─ User enters email
           ├─ Clicks "Send Reset Link"
           │
           ▼
┌─────────────────────────────────┐
│ SENDING... (Loading State)      │
│ - Button disabled               │
│ - Spinner animation             │
└──────────┬──────────────────────┘
           │
           ├─ requestPasswordReset(email) called
           ├─ Supabase API request sent
           │
           ▼
┌─────────────────────────────────┐
│ SUCCESS MESSAGE STATE           │
│ - "Email sent successfully!"    │
│ - "Check your email..." text    │
│ - "Back to Login" button        │
└──────────┬──────────────────────┘
           │
           ├─ User clicks "Back to Login"
           │
           ▼
┌─────────────────────────────────┐
│   LOGIN SCREEN                  │
│ (Ready for next attempt)        │
└─────────────────────────────────┘

─────────────────────────────────
PARALLEL PATH: Email Link Clicked
─────────────────────────────────

User clicks email link:
https://app.com/?mode=reset-password#token=...
           │
           ├─ Supabase SDK processes token
           ├─ Creates recovery session
           │
           ▼
┌─────────────────────────────────┐
│ RESET PASSWORD SCREEN           │
│ - "New Password" field          │
│ - "Confirm Password" field      │
│ - Password strength indicator   │
│ - "Update Password" button      │
└──────────┬──────────────────────┘
           │
           ├─ User enters new password
           ├─ Validates strength in real-time
           ├─ Enters confirm password
           ├─ Validates match
           │
           ▼
┌─────────────────────────────────┐
│ UPDATING... (Loading State)     │
│ - Button disabled               │
│ - "Updating Password..." text   │
└──────────┬──────────────────────┘
           │
           ├─ resetPasswordWithToken() called
           ├─ Supabase updates password
           │
           ▼
┌─────────────────────────────────┐
│ SUCCESS MESSAGE STATE           │
│ - "Password Reset Successfully!"│
│ - "2 second auto-redirect..."   │
└──────────┬──────────────────────┘
           │
           ├─ Auto-redirect after 2 seconds
           │
           ▼
┌─────────────────────────────────┐
│   LOGIN SCREEN                  │
│ (User can now login)            │
│                                 │
│ Old password: ❌ FAILS          │
│ New password: ✅ SUCCEEDS       │
└─────────────────────────────────┘
```

---

## Data Flow Diagram

### Request Phase

```
USER INPUT
  │
  ├─ Email: "user@example.com"
  │
  ▼
ForgotPasswordScreen.tsx
  │
  ├─ Validate email format
  │   └─ Regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  │
  ├─ If invalid: Show error
  └─ If valid: Continue
  │
  ▼
requestPasswordReset(email)
  │
  ├─ Trim whitespace
  ├─ Lowercase conversion
  │
  ▼
supabase.auth.resetPasswordForEmail(email, {
  redirectTo: "https://app.com/?mode=reset-password"
})
  │
  ▼
SUPABASE API (/auth/v1/recover)
  │
  ├─ Check if email exists in auth.users
  │   └─ If not found: Still return success (security)
  │
  ├─ Generate token: crypto.getRandomValues(32 bytes)
  │
  ├─ Store in sessions table:
  │   {
  │     token_hash: SHA256(token),
  │     user_id: "550e8400-e29b-41d4-a716-446655440000",
  │     type: "recovery_token",
  │     created_at: 2026-08-14T12:00:00Z,
  │     expires_at: 2026-08-15T12:00:00Z
  │   }
  │
  ├─ Send email:
  │   {
  │     from: "noreply@supabase.io",
  │     to: "user@example.com",
  │     subject: "Reset Your Password",
  │     body: "<a href='https://app.com/?mode=reset-password#access_token={token}'>
  │             Click here to reset</a>"
  │   }
  │
  └─ Return 200 OK
  │
  ▼
SUCCESS MESSAGE DISPLAYED
  │
  └─ "If an account exists with this email, 
     you will receive a password reset link shortly."
```

### Reset Phase

```
EMAIL LINK CLICKED
  │
  ├─ URL: https://app.com/?mode=reset-password#access_token=eyJ0eXAi...
  │
  ▼
Browser URL Handling
  │
  ├─ Fragment: #access_token=... (NOT sent to server)
  ├─ Query param: ?mode=reset-password
  │
  ▼
Supabase JS SDK (@supabase/supabase-js)
  │
  ├─ Detects access_token in fragment
  ├─ Validates token format
  ├─ Stores in session storage
  ├─ Creates temporary session:
  │   {
  │     access_token: "eyJ0eXAi...",
  │     refresh_token: null,
  │     type: "recovery",
  │     expires_at: 1724074800
  │   }
  │
  └─ Session ready for auth operations
  │
  ▼
App.tsx detects URL parameter
  │
  ├─ URLSearchParams.get("mode") === "reset-password"
  ├─ setShowResetPasswordScreen(true)
  │
  ▼
ResetPasswordScreen.tsx renders
  │
  ├─ "New Password" field
  │   ├─ Value: user input
  │   ├─ Show: Toggle button for visibility
  │   └─ Validation: Real-time strength check
  │
  ├─ "Confirm Password" field
  │   ├─ Value: user input
  │   ├─ Show: Toggle button for visibility
  │   └─ Validation: Match with new password
  │
  └─ "Update Password" button
     └─ Disabled until all validations pass
  │
  ▼
USER SUBMITS FORM
  │
  ├─ New Password: "SecurePass123"
  ├─ Confirm: "SecurePass123"
  │
  ▼
resetPasswordWithToken()
  │
  ├─ Validate newPassword exists
  ├─ Validate confirmPassword exists
  ├─ Validate passwords match
  │   └─ "SecurePass123" === "SecurePass123" ✓
  │
  ├─ Validate password strength:
  │   ├─ Length >= 8: ✓
  │   ├─ Contains uppercase: ✓
  │   ├─ Contains lowercase: ✓
  │   ├─ Contains number: ✓
  │   └─ All pass: Continue
  │
  └─ Call supabase.auth.updateUser({ password: newPassword })
  │
  ▼
SUPABASE API (/auth/v1/user)
  │
  ├─ Check Authorization header
  │   └─ Bearer token is recovery session token
  │
  ├─ Validate token:
  │   ├─ Token exists in sessions table
  │   ├─ Token not expired (< 24 hours)
  │   ├─ Token type is "recovery_token"
  │   └─ All pass: Continue
  │
  ├─ Hash password:
  │   └─ bcrypt.hash("SecurePass123", 10) 
  │       → "$2b$10$N9qo8uLOickgx2ZMRZoHy..."
  │
  ├─ Update auth.users:
  │   {
  │     id: "550e8400-e29b-41d4-a716-446655440000",
  │     encrypted_password: "$2b$10$N9qo8uLOickgx2ZMRZoHy...",
  │     updated_at: 2026-08-14T12:15:00Z
  │   }
  │
  ├─ Invalidate recovery session:
  │   DELETE FROM auth.sessions 
  │   WHERE token_hash = SHA256(token)
  │
  └─ Return 200 OK
  │
  ▼
SUCCESS MESSAGE DISPLAYED
  │
  ├─ "Your password has been reset successfully!"
  ├─ "You will be redirected to login..."
  │
  ▼
AUTO-REDIRECT (2 seconds)
  │
  ├─ setShowResetPasswordScreen(false)
  ├─ setAuthMode("LOGIN")
  │
  ▼
LOGIN SCREEN DISPLAYED
  │
  ├─ User can now login
  ├─ Old password: ❌ FAILS
  │   └─ Supabase: Password doesn't match hash
  │
  └─ New password: ✅ SUCCEEDS
      └─ Supabase: bcrypt matches hash
```

---

## Security Architecture

### Token Security

```
1. GENERATION
   └─ crypto.getRandomValues(32 bytes)
      └─ 256 bits of cryptographic entropy
      └─ ~2^256 possible values (impossible to guess)

2. TRANSMISSION
   └─ Email delivery (HTTPS Supabase endpoint)
   └─ Reset link: https://app.com/?mode=reset-password#token
      └─ Token in URL FRAGMENT (not sent to server)
      └─ Not logged by web servers
      └─ Not stored in browser history (by #)

3. STORAGE
   └─ Supabase stores hash: SHA256(token)
   └─ Original token only in memory during validation
   └─ Hashed token is safer than plain token

4. VALIDATION
   └─ Token must match hash
   └─ Token must not be expired (24 hours)
   └─ Token type must be "recovery"
   └─ Session must be recovery session

5. INVALIDATION
   └─ Deleted from sessions table after use
   └─ Cannot be used again
   └─ Old tokens automatically expire (24h)
```

### Password Security

```
1. CLIENT VALIDATION
   ├─ Email format check
   ├─ Password strength check:
   │  ├─ 8+ characters (entropy)
   │  ├─ Uppercase letter (complexity)
   │  ├─ Lowercase letter (complexity)
   │  ├─ Number (complexity)
   │  └─ = Min entropy ~64-128 bits
   │
   └─ Passwords must match (confirm field)

2. TRANSMISSION
   ├─ HTTPS only (enforced in production)
   ├─ POST body (not URL query parameter)
   ├─ TLS encryption (in transit)
   └─ No caching headers on auth endpoints

3. SERVER VALIDATION
   ├─ Revalidate all client checks
   ├─ Check password strength server-side
   ├─ Validate session is recovery type
   └─ Validate token is valid

4. HASHING
   ├─ Algorithm: bcrypt
   ├─ Cost factor: 10 (2^10 = 1024 iterations)
   ├─ Salt: Unique per password
   ├─ Result: $2b$10$N9qo8uLOickgx2ZMRZoHy...
   └─ Time to hash: ~100-200ms (resistant to brute force)

5. STORAGE
   ├─ Never stored as plain text
   ├─ Hash stored in auth.users.encrypted_password
   ├─ Hash is one-way (cannot reverse)
   ├─ Old password hash replaced (not appended)
   └─ No password history stored

6. INVALIDATION
   ├─ Old password hash deleted
   ├─ Session token invalidated
   ├─ Recovery session deleted
   └─ Cannot login with old password
```

### Account Enumeration Protection

```
PROBLEM: Attacker tries to enumerate valid emails

ATTACK SCENARIO:
  └─ Attacker: requests password reset for 10,000 emails
  └─ App returns: "User not found" for 9,000
  └─ App returns: "Email sent" for 1,000
  └─ Result: Attacker knows which 1,000 are valid

PROTECTION IMPLEMENTED:
  └─ Front-end message: "If an account exists with this email, 
                        you will receive a password reset link shortly."
  └─ Server-side: Returns 200 OK regardless of user existence
  └─ Email sending: Supabase silently ignores non-existent users
  └─ Timing: No timing difference (same duration)
  └─ Result: Attacker cannot distinguish valid from invalid

SUCCESS: ✅ Timing attack resistant
         ✅ Message enumeration resistant
         ✅ Response code enumeration resistant
```

---

## Error Handling Architecture

```
FRONTEND ERRORS (ForgotPasswordScreen)

1. Empty email
   └─ Message: "Email address is required."
   └─ Display: Below email field
   └─ Severity: User action required

2. Invalid email format
   └─ Message: "Please enter a valid email address"
   └─ Display: Below email field
   └─ Validation: Real-time as user types
   └─ Severity: User action required

3. Network error
   └─ Message: "If an account exists with this email, 
               you will receive a password reset link shortly."
   └─ Display: Red banner (generic for security)
   └─ Severity: Not user's fault, inform generically

FRONTEND ERRORS (ResetPasswordScreen)

1. Password too short
   └─ Message: Shows strength indicator
   └─ Requirement: "At least 8 characters"
   └─ Display: Real-time as user types
   └─ Button: Disabled until requirement met

2. Missing uppercase
   └─ Message: Shows strength indicator
   └─ Requirement: "Uppercase letter"
   └─ Display: Real-time checkbox feedback

3. Missing lowercase
   └─ Message: Shows strength indicator
   └─ Requirement: "Lowercase letter"
   └─ Display: Real-time checkbox feedback

4. Missing number
   └─ Message: Shows strength indicator
   └─ Requirement: "Number"
   └─ Display: Real-time checkbox feedback

5. Passwords don't match
   └─ Message: "Passwords do not match"
   └─ Display: Below confirm password field
   └─ Real-time validation as user types

BACKEND ERRORS (Supabase)

1. Invalid/expired token
   └─ Supabase response: 403 Forbidden
   └─ User sees: "Your password reset link has expired. 
               Request a new one."

2. Token already used
   └─ Supabase response: 403 Forbidden
   └─ User sees: "This password reset link is no longer valid. 
               Request a new one."

3. Password too weak (server-side check)
   └─ Supabase response: 400 Bad Request
   └─ User sees: "Password does not meet security requirements"

4. User not authenticated
   └─ Supabase response: 401 Unauthorized
   └─ User sees: "Session expired. Request a new reset link."
```

---

## Data Storage Architecture

### No New Database Tables Required

The implementation uses existing Supabase infrastructure:

**auth.users** (Supabase managed):
```sql
-- No schema changes needed
id              UUID PRIMARY KEY
email           TEXT NOT NULL
encrypted_password TEXT -- Updated when password reset
email_confirmed_at TIMESTAMP
created_at      TIMESTAMP
updated_at      TIMESTAMP
-- (other auth fields)
```

**auth.sessions** (Supabase managed):
```sql
-- Supabase automatically manages recovery sessions
id              UUID PRIMARY KEY
user_id         UUID REFERENCES auth.users(id)
token           TEXT -- Recovery token
type            TEXT -- "recovery_token"
created_at      TIMESTAMP
expires_at      TIMESTAMP
```

**public.profiles** (Existing app table):
```sql
-- NO CHANGES MADE
-- Existing table structure continues to work
id              UUID PRIMARY KEY
email           TEXT
name            TEXT
role            TEXT
-- (other profile fields)
```

### Why No New Tables?

✅ Password reset tokens managed by Supabase  
✅ User credentials managed by Supabase  
✅ Session management handled by Supabase  
✅ Profile data separate from auth data  

---

## Performance Considerations

### Request Timing

```
Forgot Password Request:
  ├─ Frontend validation: ~1ms
  ├─ Network latency: ~50-200ms
  ├─ Supabase API: ~200-500ms
  │  └─ Database lookup: ~50ms
  │  └─ Token generation: ~10ms
  │  └─ Email sending: ~200-300ms (async, so not blocking)
  │  └─ Response time: ~100ms
  └─ Total user-perceived time: ~300-700ms
     └─ Feels responsive to user

Reset Password Request:
  ├─ Frontend validation: ~5ms
  ├─ Network latency: ~50-200ms
  ├─ Supabase API: ~500-1000ms
  │  └─ Token validation: ~50ms
  │  └─ Session check: ~50ms
  │  └─ Password hashing (bcrypt): ~100-200ms
  │  └─ Database update: ~50ms
  │  └─ Session invalidation: ~50ms
  │  └─ Response time: ~50ms
  └─ Total user-perceived time: ~600-1200ms
     └─ Still responsive (spinner shown during wait)
```

### Scalability

✅ No bottlenecks (uses Supabase managed infrastructure)  
✅ Token generation: O(1) constant time  
✅ Token validation: O(1) hash lookup  
✅ Password hashing: Time-constant (by design)  
✅ Email delivery: Asynchronous (not blocking)  
✅ Database: Optimized by Supabase  

---

## Integration with Existing Authentication

```
EXISTING AUTH FLOW                NEW PASSWORD RESET

Signup ─────────────────────────  (unchanged)
  │                                │
  ├─ registerAccount()             │ requestPasswordReset()
  │   ├─ supabase.auth.signUp()   │   └─ supabase.auth.resetPasswordForEmail()
  │   └─ Create profile            │
  │                                │
Login ──────────────────────────────── (unchanged)
  │                                │
  └─ loginAccount()                │ resetPasswordWithToken()
      ├─ supabase.auth.signInWithPassword()
      └─ Fetch and validate profile
                                   │ (new in this release)
```

**Key Integration Points:**

1. **Same Supabase Project** ✅
   - Uses existing `VITE_SUPABASE_URL`
   - Uses existing `VITE_SUPABASE_ANON_KEY`
   - No separate auth system

2. **Same Email Service** ✅
   - Uses Supabase's native email provider
   - Same authentication domain
   - Consistent user experience

3. **Same User Table** ✅
   - auth.users updated for password reset
   - No data duplication
   - Single source of truth

4. **Compatible Session Management** ✅
   - Existing session logic untouched
   - Recovery sessions separate from regular sessions
   - No conflict with active sessions

---

## Deployment Architecture

```
DEVELOPMENT (npm run dev)
  └─ Vite dev server: http://localhost:3000
  └─ Supabase: Local/Dev project
  └─ Email: Console output or test email service
  └─ Use for: Feature testing and debugging

STAGING (optional)
  └─ Deployed to staging domain
  └─ Supabase: Staging project
  └─ Email: Real email service with test domain
  └─ Use for: QA and user acceptance testing

PRODUCTION
  └─ Deployed to production domain
  └─ Supabase: Production project (real users)
  └─ Email: Real email service with verified domain
  └─ HTTPS: Required and enforced
  └─ Use for: Live user traffic
```

---

## Monitoring & Observability

### Key Metrics to Track

```
Request Metrics:
  ├─ Password reset requests per day
  ├─ Email delivery success rate
  ├─ Reset link click-through rate
  ├─ Password update success rate
  └─ Average time to reset completion

Error Metrics:
  ├─ Failed password reset requests
  ├─ Expired token attempts
  ├─ Invalid email attempts
  ├─ Password validation failures
  └─ Network/API errors

Security Metrics:
  ├─ Suspicious activity (>5 attempts/hour)
  ├─ Failed login attempts after reset
  ├─ Token reuse attempts
  └─ Unusual geographic patterns
```

### Logging Strategy

```
WHAT TO LOG:
  ✅ Successful password reset (user ID, timestamp)
  ✅ Failed password updates (error type, not details)
  ✅ Email sending success/failure
  ✅ Invalid token attempts
  ✅ System errors and exceptions

WHAT NOT TO LOG:
  ❌ Passwords (plain text or hashed)
  ❌ Password reset tokens
  ❌ Email addresses (except for legitimate errors)
  ❌ Full error stack traces (log summary only)
  ❌ User IP addresses (privacy concern)
```

---

**Version:** 1.0  
**Last Updated:** August 14, 2026  
**Status:** ✅ Complete & Documented
