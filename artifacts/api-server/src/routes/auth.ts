import { Router, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const router = Router();

// ── Types ──────────────────────────────────────────────────────────────────

interface AuthedRequest extends Request {
  adminClient: SupabaseClient;
  actorId: string;
  actorRole: string;
}

type ValidRole = "administrator" | "admin" | "staff";
const VALID_ROLES: ValidRole[] = ["administrator", "admin", "staff"];

// ── Admin client singleton ─────────────────────────────────────────────────

let _adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the API server.",
    );
  }
  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── Middleware: verify JWT ─────────────────────────────────────────────────

/** Allows administrator only */
async function requireAdministrator(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await verifyJwt(req, res, next, "administrator");
}

/** Allows administrator or admin */
async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await verifyJwt(req, res, next, "admin");
}

async function verifyJwt(
  req: Request,
  res: Response,
  next: NextFunction,
  minimumRole: "administrator" | "admin",
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token." });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const client = getAdminClient();

    // Verify JWT with Supabase
    const {
      data: { user },
      error: jwtError,
    } = await client.auth.getUser(token);
    if (jwtError || !user) {
      res
        .status(401)
        .json({ error: "Session expired or invalid. Please sign in again." });
      return;
    }

    // Load profile from public.users
    const { data: profile, error: profileError } = await client
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      res.status(403).json({
        error: "Your user profile was not found. Contact an administrator.",
      });
      return;
    }

    const roleOk =
      minimumRole === "administrator"
        ? profile.role === "administrator"
        : profile.role === "administrator" || profile.role === "admin";

    if (!roleOk) {
      res
        .status(403)
        .json({ error: "You do not have permission to perform this action." });
      return;
    }

    (req as AuthedRequest).adminClient = client;
    (req as AuthedRequest).actorId = user.id;
    (req as AuthedRequest).actorRole = profile.role;
    next();
  } catch (e) {
    console.error("[auth] JWT verification error:", e);
    res.status(500).json({ error: "Authorization check failed." });
  }
}

// ── POST /api/auth/invite-user ─────────────────────────────────────────────
//
// Creates a Supabase Auth user and generates an invite link.
// Uses admin.generateLink({ type: 'invite' }) — does NOT require SMTP.
// The invite URL is returned so the administrator can share it.
// A matching public.users profile is upserted as well.
// The on_auth_user_created trigger also covers direct Supabase-dashboard
// user creation as a safety net.

router.post(
  "/invite-user",
  requireAdministrator,
  async (req: Request, res: Response) => {
    const { email, fullName, username, role } = req.body as {
      email?: string;
      fullName?: string;
      username?: string;
      role?: string;
    };

    if (!email || !fullName || !username || !role) {
      res.status(400).json({
        error: "email, fullName, username, and role are all required.",
      });
      return;
    }
    if (!VALID_ROLES.includes(role as ValidRole)) {
      res.status(400).json({
        error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.`,
      });
      return;
    }

    const client = (req as AuthedRequest).adminClient;
    const actorId = (req as AuthedRequest).actorId;
    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanFullName = fullName.trim();

    try {
      // Duplicate username check
      const { data: existingUsername } = await client
        .from("users")
        .select("id")
        .eq("username", cleanUsername)
        .maybeSingle();
      if (existingUsername) {
        res.status(409).json({ error: "Username is already taken." });
        return;
      }

      // Duplicate email check
      const { data: existingEmail } = await client
        .from("users")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();
      if (existingEmail) {
        res.status(409).json({ error: "Email address is already registered." });
        return;
      }

      // Generate invite link — creates the auth user AND returns the URL.
      // Works without SMTP. Link is valid for 24 h by default.
      const appUrl = process.env.APP_URL ?? "";
      const { data: linkData, error: linkError } =
        await client.auth.admin.generateLink({
          type: "invite",
          email: cleanEmail,
          options: {
            data: {
              full_name: cleanFullName,
              username: cleanUsername,
              role,
            },
            redirectTo: appUrl,
          },
        });

      if (linkError || !linkData?.user) {
        // Provide actionable error message
        const msg = linkError?.message ?? "Failed to generate invite link.";
        res.status(400).json({ error: msg });
        return;
      }

      const userId = linkData.user.id;
      const inviteUrl =
        (linkData.properties as Record<string, string> | null)
          ?.action_link ?? null;

      // Upsert public.users profile.
      // ON CONFLICT: the trigger may have already inserted it; update to ensure
      // username/fullName/role are correct.
      const { error: dbError } = await client.from("users").upsert(
        {
          id: userId,
          username: cleanUsername,
          fullName: cleanFullName,
          email: cleanEmail,
          passwordHash: "",
          role,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (dbError) {
        // Roll back the auth user so no orphan is left
        await client.auth.admin.deleteUser(userId);
        res
          .status(500)
          .json({ error: `Profile insert failed: ${dbError.message}` });
        return;
      }

      // Audit log
      await client.from("audit_logs").insert({
        action: "user_invited",
        tableName: "users",
        recordId: userId,
        userId: actorId,
        changes: JSON.stringify({ email: cleanEmail, username: cleanUsername, role }),
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({
        id: userId,
        email: cleanEmail,
        username: cleanUsername,
        fullName: cleanFullName,
        role,
        inviteUrl,
      });
    } catch (e) {
      console.error("[auth] invite-user error:", e);
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// ── PUT /api/auth/users/:id/role ───────────────────────────────────────────
//
// Update the role of an existing user.
// Only administrator can do this.
// Prevents escalating to/from administrator role without authorization.

router.put(
  "/users/:id/role",
  requireAdministrator,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role } = req.body as { role?: string };
    const actorId = (req as AuthedRequest).actorId;

    if (!role || !VALID_ROLES.includes(role as ValidRole)) {
      res.status(400).json({
        error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.`,
      });
      return;
    }

    if (id === actorId) {
      res
        .status(403)
        .json({ error: "You cannot change your own role." });
      return;
    }

    const client = (req as AuthedRequest).adminClient;

    try {
      const { data: target } = await client
        .from("users")
        .select("role, username")
        .eq("id", id)
        .maybeSingle();

      if (!target) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      const { error } = await client
        .from("users")
        .update({ role, updatedAt: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Audit log
      await client.from("audit_logs").insert({
        action: "user_role_updated",
        tableName: "users",
        recordId: id,
        userId: actorId,
        changes: JSON.stringify({ from: target.role, to: role }),
        createdAt: new Date().toISOString(),
      });

      res.json({ success: true, role });
    } catch (e) {
      console.error("[auth] update-role error:", e);
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// ── DELETE /api/auth/users/:id ─────────────────────────────────────────────
//
// Remove a user from both public.users and auth.users.
// Administrator accounts are protected from deletion.
// Only administrator can delete users.

router.delete(
  "/users/:id",
  requireAdministrator,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const actorId = (req as AuthedRequest).actorId;
    const client = (req as AuthedRequest).adminClient;

    if (id === actorId) {
      res.status(403).json({ error: "You cannot delete your own account." });
      return;
    }

    try {
      const { data: target } = await client
        .from("users")
        .select("role, username")
        .eq("id", id)
        .maybeSingle();

      if (!target) {
        res.status(404).json({ error: "User not found." });
        return;
      }
      if (target.role === "administrator") {
        res
          .status(403)
          .json({ error: "Administrator accounts cannot be deleted." });
        return;
      }

      // Delete profile first (FK constraints point here)
      const { error: dbError } = await client
        .from("users")
        .delete()
        .eq("id", id);
      if (dbError) {
        res
          .status(500)
          .json({ error: `Failed to delete profile: ${dbError.message}` });
        return;
      }

      // Delete from auth (ignoring error if auth user was already removed)
      await client.auth.admin.deleteUser(id);

      // Audit log
      await client.from("audit_logs").insert({
        action: "user_deleted",
        tableName: "users",
        recordId: id,
        userId: actorId,
        changes: JSON.stringify({ username: target.username, role: target.role }),
        createdAt: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (e) {
      console.error("[auth] delete-user error:", e);
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

export default router;
