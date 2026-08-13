import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

async function startServer() {
  const { supabaseAdmin } = await import("./src/lib/supabaseAdmin.ts");
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  // Health API check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Diagnostic endpoint to check auth user and profile existence
  app.get("/api/diagnostic/user/:email", async (req, res) => {
    const { email } = req.params;
    try {
      // Check if user exists in Supabase Auth
      const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = users?.users.find(u => u.email === email);

      if (!authUser) {
        return res.status(200).json({
          email,
          exists_in_auth: false,
          message: `No auth user found for ${email}`
        });
      }

      // Check if profile exists
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, role, status')
        .eq('id', authUser.id)
        .single();

      return res.status(200).json({
        email,
        exists_in_auth: true,
        auth_user_id: authUser.id,
        auth_confirmed: authUser.email_confirmed_at ? true : false,
        auth_disabled: authUser.banned_until ? true : false,
        profile_exists: !!profile,
        profile: profile || null,
        profile_error: profileError?.message || null,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Diagnostic check failed' });
    }
  });

  app.post("/api/create-user", async (req, res) => {
    const { email, password, fullName, role, metadata } = req.body;

    const allowedRoles = ['EDITOR', 'REVIEWER'];
    if (!email || !password || !fullName || !role || !allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Missing or invalid user account fields.' });
    }

    try {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          requested_role: role,
          ...metadata
        }
      } as any);

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ user: data.user });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to create user account.' });
    }
  });

  // Admin: Reset user password (Coordinator only)
  app.post("/api/reset-user-password", async (req, res) => {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'Missing userId or newPassword.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
      // Verify the caller is authenticated
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
      }

      const token = authHeader.slice(7);

      // Decode JWT token to get user ID (sub claim)
      let callerUserId: string;
      try {
        const parts = token.split('.');
        if (parts.length !== 3) {
          return res.status(401).json({ error: 'Unauthorized: Invalid token format.' });
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        callerUserId = payload.sub;
        if (!callerUserId) {
          return res.status(401).json({ error: 'Unauthorized: Invalid token payload.' });
        }
      } catch (decodeError: any) {
        return res.status(401).json({ error: 'Unauthorized: Failed to decode token.' });
      }

      // Verify caller exists and get their role
      const { data: callerProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role, status')
        .eq('id', callerUserId)
        .single();

      if (profileError || !callerProfile) {
        return res.status(403).json({ error: 'Forbidden: Unable to verify your authorization.' });
      }

      if (callerProfile.role !== 'COORDINATOR') {
        return res.status(403).json({ error: 'Forbidden: Only Coordinators can reset user passwords.' });
      }

      // Use Supabase admin API to update password
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ success: true, message: 'Password updated successfully.' });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to reset password.' });
    }
  });

  // Vite middleware for development fallback or standard static server for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
