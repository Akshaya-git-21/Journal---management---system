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
      const authUser = users?.users.find((u: any) => u.email === email);

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

  // Admin: Create an Editor/Reviewer account (Coordinator only). Thin
  // adapter over handleCreateUserRequest, shared with the Vercel serverless
  // function at api/create-user.ts, which is the endpoint actually reachable
  // in the production (Vercel) deployment. This Express route only serves
  // local `npm run dev` / `npm start`.
  app.post("/api/create-user", async (req, res) => {
    try {
      const { handleCreateUserRequest } = await import("./src/lib/createUserHandler.ts");
      const result = await handleCreateUserRequest(req.headers.authorization, req.body || {});
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to create user account.' });
    }
  });

  // Admin: Reset user password (Coordinator only). This is a thin adapter --
  // all the actual logic lives in handlePasswordResetRequest, shared with
  // the Vercel serverless function at api/reset-user-password.ts, which is
  // the endpoint actually reachable in the production (Vercel) deployment.
  // This Express route only serves local `npm run dev` / `npm start`.
  app.post("/api/reset-user-password", async (req, res) => {
    try {
      const { handlePasswordResetRequest } = await import("./src/lib/passwordResetHandler.ts");
      const result = await handlePasswordResetRequest(req.headers.authorization, req.body?.userId, req.body?.newPassword);
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to reset password.' });
    }
  });

  // Admin: Edit or delete an Editor/Reviewer/Publisher/GD Member (Coordinator
  // only). Thin adapter over handleManageUserRequest; the Vercel function at
  // api/manage-user.ts serves the same route in production.
  app.post("/api/manage-user", async (req, res) => {
    try {
      const { handleManageUserRequest } = await import("./src/lib/manageUserHandler.ts");
      const result = await handleManageUserRequest(req.headers.authorization, req.body || {});
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to manage user.' });
    }
  });

  // Admin: create / edit / reset password / delete users and review Admin sign-ups
  // (Admin only). The Vercel function at api/admin-users.ts serves the same route
  // in production.
  app.post("/api/admin-users", async (req, res) => {
    try {
      const { handleAdminUsersRequest } = await import("./src/lib/adminUsersHandler.ts");
      const result = await handleAdminUsersRequest(req.headers.authorization, req.body || {});
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to manage users.' });
    }
  });

  // Activity log: sign-in / sign-out / failed sign-in / password events. The Vercel
  // function at api/activity.ts serves the same route in production.
  app.post("/api/activity", async (req, res) => {
    try {
      const { handleActivityRequest } = await import("./src/lib/activityHandler.ts");
      const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      const result = await handleActivityRequest(req.headers.authorization, req.body || {}, {
        ip: forwarded || req.socket.remoteAddress || undefined,
        userAgent: String(req.headers["user-agent"] || ""),
      });
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      return res.status(500).json({ error: "Unable to record the event." });
    }
  });

  // Public: does an account exist for this email? (login form only -- returns a boolean)
  app.post("/api/account-status", async (req, res) => {
    try {
      const { handleAccountStatusRequest } = await import("./src/lib/accountStatusHandler.ts");
      const result = await handleAccountStatusRequest(req.body?.email);
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      return res.status(500).json({ error: "Unable to check the account." });
    }
  });

  // "Continue with ORCID" (Authors). All logic lives in api/orcid.ts, which is
  // also the Vercel function for /api/orcid/* in production.
  app.all("/api/orcid/:action", async (req, res) => {
    const { orcidHandler } = await import("./api/orcid.ts");
    return orcidHandler(req, res, req.params.action);
  });

  // User: Reset their own password with current session (called from password reset flow)
  app.post("/api/validate-reset-session", async (req, res) => {
    try {
      // This endpoint verifies that the user has a valid password recovery session
      // It's called by the frontend to ensure the reset token is still valid
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
      }

      const token = authHeader.slice(7);

      // Decode JWT token
      try {
        const parts = token.split('.');
        if (parts.length !== 3) {
          return res.status(401).json({ error: 'Invalid token format.' });
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

        // Check if this is a password recovery session (indicated by specific claims)
        const isRecoverySession = payload.amr && payload.amr.includes('recovery_code');

        if (!payload.sub) {
          return res.status(401).json({ error: 'Invalid token payload.' });
        }

        return res.status(200).json({
          valid: true,
          userId: payload.sub,
          isRecoverySession: isRecoverySession,
          expiresAt: new Date(payload.exp * 1000).toISOString()
        });
      } catch (decodeError: any) {
        return res.status(401).json({ error: 'Failed to validate token.' });
      }
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Validation failed.' });
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
