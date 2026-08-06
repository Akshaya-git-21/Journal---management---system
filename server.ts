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
