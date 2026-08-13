# Quick Test Guide - Password Reset Fix

## 🚀 Quick Summary of Changes

**Critical Bug Fixed:** Password reset endpoint was passing JWT token to `getUserById()` which expects user ID.  
**Solution:** Properly decode JWT to extract user ID from 'sub' claim.  
**Files Changed:** `server.ts` (JWT decoding fix) + earlier fixes for modal rendering.  

---

## ⚡ 2-Minute Quick Test

### Step 1: Login
- Open http://localhost:3000 (or your dev server)
- Click "Coordinator Login"
- Enter coordinator credentials
- Navigate to "Editorial Board"

### Step 2: Open Modal
- Find any editor in the Editorial Board list
- Click the **eye icon** on the right side of the row
- **Expected:** Modal opens showing editor details

### Step 3: Test Password Reset
- Click "Set Temporary Password" button
- **Form appears ↓**
- Enter: `TestPass123!`
- Confirm: `TestPass123!`
- Click "Set Password"
- **Expected:** Within 1-2 seconds, password displays in green box

### Step 4: Test Login
- Copy the displayed password
- Open new browser tab
- Click "Editor Login"
- Email: (the editor's email from modal)
- Password: (paste the copied password)
- Click Submit
- **Expected:** EditorWorkspace loads

### Result
✅ **PASS** - Password reset works end-to-end  
❌ **FAIL** - Report the error (include network tab screenshot)

---

## 📝 Error Cases Test (5 minutes)

### Test 1: Too Short Password
- Click eye icon → modal opens
- Click "Set Temporary Password"
- Enter: `short` (5 chars)
- Click "Set Password"
- **Expected:** Error message "Password must be at least 8 characters"

### Test 2: Mismatched Passwords
- Enter: `Test123!` (password field)
- Enter: `Test456!` (confirm field)
- Click "Set Password"
- **Expected:** Error message "Passwords do not match"

### Test 3: Empty Fields
- Leave both fields empty
- Click "Set Password"
- **Expected:** Error message "Please enter a password in both fields"

### Test 4: Non-Coordinator User
- Login as EDITOR (not coordinator)
- Navigate to Editorial Board
- Click eye icon
- Try to set password
- **Expected:** Error "Only Coordinators can reset user passwords"

---

## 🔍 Debug Checklist

If tests fail, check:

**Browser Console:**
- Open DevTools (F12)
- Go to Console tab
- Check for JavaScript errors
- Take screenshot if any errors

**Network Tab:**
- Go to Network tab
- Click "Set Password"
- Look for POST request to `/api/reset-user-password`
- Check response status:
  - 200 = Success ✅
  - 401 = Token invalid
  - 403 = Not coordinator
  - 500 = Server error

**Server Logs:**
- Check terminal where dev server runs
- Look for error messages
- Copy any error text

---

## ✅ Success Indicators

**You know the fix works when:**

1. Eye icon opens editor details modal
2. Modal shows correct editor info (name, email, role, status)
3. "Set Password" button becomes "Resetting..." briefly
4. Within 1-2 seconds, temporary password displays
5. Password has copy button
6. Can copy password to clipboard
7. Editor can login with new password
8. Error messages display for invalid inputs
9. Modal can be closed with X button
10. Multiple editors can have passwords reset

---

## 🐛 Troubleshooting

### Problem: "Setting password..." never completes
**Solution:** 
- Check server logs for errors
- Clear browser cache (Ctrl+Shift+Delete)
- Restart dev server
- Check if token is valid (user may need to re-login)

### Problem: "Unauthorized" error
**Solution:**
- User needs to login again
- Check auth token in cookie/localStorage
- Try in private/incognito window

### Problem: "Only Coordinators can reset passwords"
**Solution:**
- Current logged-in user is not a COORDINATOR
- Login with a coordinator account instead

### Problem: Modal doesn't open
**Solution:**
- Check browser console for JavaScript errors
- Make sure you're clicking the eye icon (rightmost column)
- Refresh page and try again

### Problem: Password shows but login fails
**Solution:**
- Double-check you copied password correctly
- Verify it's the editor's email (not your coordinator email)
- Try the password reset again

---

## 📊 Test Results Template

```
Date: [Today's Date]
Tester: [Your Name]
Environment: localhost:3000

✅ Eye Icon Click: PASS / FAIL
✅ Modal Opens: PASS / FAIL
✅ Editor Details Display: PASS / FAIL
✅ Set Password Form: PASS / FAIL
✅ Password Displays: PASS / FAIL
✅ Copy Button Works: PASS / FAIL
✅ Editor Login Works: PASS / FAIL
✅ Error Messages: PASS / FAIL

Overall: PASS / FAIL

Issues Found:
- [List any issues]

Notes:
- [Add notes]
```

---

## 🎯 What to Report if Testing Fails

**Include:**
1. What you clicked
2. What you expected to happen
3. What actually happened
4. Screenshot of modal (if opened)
5. Screenshot of browser console (F12)
6. Screenshot of network tab showing POST request
7. Response body from failed request
8. Server log output
9. Exact error messages (copy-paste)
10. Steps to reproduce

---

## ✨ Expected User Experience

### Before Fix
```
User clicks "Set Password"
Button shows "Setting password..."
...nothing happens...
...waits 30 seconds...
Still nothing...
😞 Gives up, thinks it's broken
```

### After Fix
```
User clicks "Set Password"
Button briefly shows "Resetting..."
(1-2 seconds pass)
Button returns to normal
Password displays in green box
😊 Success! Copy and share password
```

---

## 📞 Support

**If tests fail:**
1. Check error message carefully
2. Follow troubleshooting steps
3. Collect all debug info (console, network, logs)
4. Report with exact details

**Quick checklist before reporting:**
- [ ] Dev server running
- [ ] Logged in as COORDINATOR
- [ ] At Editorial Board screen
- [ ] Clicking correct eye icon
- [ ] Entering valid password (8+ chars)
- [ ] Both password fields match
- [ ] Waiting 1-2 seconds for response

---

## Status

🟢 **Ready for Testing**  
🔴 **Do Not Deploy** until testing confirms success  
✅ **Deploy Only After** verification passes

---

**Estimated Test Time: 5-10 minutes**  
**Difficulty: Easy**  
**Risk if Fails: None (can reset, try again)**

Good luck! 🚀
