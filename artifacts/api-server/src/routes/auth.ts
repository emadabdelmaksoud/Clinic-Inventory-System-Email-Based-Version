import { Router, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const router = Router();

interface AuthedRequest extends Request {
  adminClient: SupabaseClient;
}

function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the API server");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const client = getAdminClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    const { data: profile } = await client
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.role !== "administrator") {
      res.status(403).json({ error: "Administrator access required" });
      return;
    }
    (req as AuthedRequest).adminClient = client;
    next();
  } catch (e) {
    res.status(500).json({ error: "Authorization check failed" });
  }
}

// POST /api/auth/invite-user
router.post(
  "/invite-user",
  requireAdmin,
  async (req: Request, res: Response) => {
    const { email, fullName, username, role } = req.body as {
      email?: string;
      fullName?: string;
      username?: string;
      role?: string;
    };

    if (!email || !fullName || !username || !role) {
      res
        .status(400)
        .json({ error: "email, fullName, username, and role are required" });
      return;
    }
    const validRoles = ["administrator", "admin", "staff"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    const client = (req as AuthedRequest).adminClient;

    try {
      const cleanUsername = username.toLowerCase().trim();
      const cleanEmail = email.toLowerCase().trim();

      const { data: existingUsername } = await client
        .from("users")
        .select("id")
        .eq("username", cleanUsername)
        .maybeSingle();
      if (existingUsername) {
        res.status(409).json({ error: "Username already taken" });
        return;
      }

      const { data: existingEmail } = await client
        .from("users")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();
      if (existingEmail) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      const { data: authData, error: authError } =
        await client.auth.admin.inviteUserByEmail(cleanEmail, {
          data: {
            full_name: fullName.trim(),
            username: cleanUsername,
            role,
          },
        });
      if (authError) {
        res.status(400).json({ error: authError.message });
        return;
      }

      const userId = authData.user.id;

      const { error: dbError } = await client.from("users").insert({
        id: userId,
        username: cleanUsername,
        fullName: fullName.trim(),
        email: cleanEmail,
        passwordHash: "",
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (dbError) {
        await client.auth.admin.deleteUser(userId);
        res
          .status(500)
          .json({ error: `Profile insert failed: ${dbError.message}` });
        return;
      }

      res.status(201).json({
        id: userId,
        email: cleanEmail,
        username: cleanUsername,
        fullName: fullName.trim(),
        role,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// DELETE /api/auth/users/:id
router.delete(
  "/users/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const client = (req as AuthedRequest).adminClient;

    try {
      const { data: target } = await client
        .from("users")
        .select("role")
        .eq("id", id)
        .maybeSingle();

      if (!target) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      if (target.role === "administrator") {
        res
          .status(403)
          .json({ error: "Administrator accounts cannot be deleted" });
        return;
      }

      await client.from("users").delete().eq("id", id);
      await client.auth.admin.deleteUser(id);

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

export default router;
