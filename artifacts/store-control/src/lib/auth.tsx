// @refresh reset
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { db, type User, generateId, now } from "./db";
import { isSupabaseConfigured, supabase } from "./supabase";
import type { AppRole } from "./permissions";

// ─────────────────────────────────────────────────────────────────────────────
// Offline helpers — only used when Supabase is NOT configured
// ─────────────────────────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
}

const ROLE_PRIORITY: Record<string, number> = {
  administrator: 3,
  admin: 2,
  staff: 1,
};

async function deduplicateUsernames() {
  if (isSupabaseConfigured) return;
  const all = await db.users.toArray();
  const byUsername = new Map<string, typeof all>();
  for (const u of all) {
    const key = u.username.toLowerCase();
    if (!byUsername.has(key)) byUsername.set(key, []);
    byUsername.get(key)!.push(u);
  }
  for (const [, group] of byUsername) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      const pa = ROLE_PRIORITY[a.role] ?? 0;
      const pb = ROLE_PRIORITY[b.role] ?? 0;
      if (pb !== pa) return pb - pa;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    for (const u of group.slice(1)) await db.users.delete(u.id);
  }
}

async function ensureDefaultAdmin() {
  if (isSupabaseConfigured) return;
  const count = await db.users.count();
  if (count === 0) {
    const hash = await hashPassword("admin123");
    await db.users.add({
      id: generateId(),
      username: "admin",
      fullName: "Administrator",
      passwordHash: hash,
      role: "administrator",
      createdAt: now(),
      updatedAt: now(),
    });
  } else {
    const existing = await db.users
      .where("username")
      .equals("admin")
      .first();
    if (existing && existing.role === "admin") {
      await db.users.update(existing.id, {
        role: "administrator",
        updatedAt: now(),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth context
// ─────────────────────────────────────────────────────────────────────────────

interface AuthCtx {
  user: Omit<User, "passwordHash"> | null;
  loading: boolean;
  accessToken: string | null;
  /** True only while processing a password-recovery link. */
  recoveryMode: boolean;
  signIn: (
    emailOrUsername: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => void;
  forgotPassword: (email: string) => Promise<{ error: string | null }>;
  confirmPasswordReset: (
    newPassword: string,
  ) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

const SESSION_KEY = "store_control_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, "passwordHash"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);

  // Ref mirrors recoveryMode so the onAuthStateChange closure always reads
  // the current value without stale-closure issues.
  const recoveryRef = useRef(false);
  function setRecovery(v: boolean) {
    recoveryRef.current = v;
    setRecoveryMode(v);
  }

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        // ── Password-recovery link clicked ─────────────────────────────────
        if (event === "PASSWORD_RECOVERY") {
          setRecovery(true);
          setUser(null);
          setAccessToken(null);
          setLoading(false);
          return;
        }

        // ── User signed in ─────────────────────────────────────────────────
        if (session?.user) {
          // If this SIGNED_IN fires right after updateUser() in the recovery
          // flow, skip it — confirmPasswordReset will call signOut() next.
          if (recoveryRef.current) {
            setLoading(false);
            return;
          }
          try {
            const profile = await db.users.get(session.user.id);
            if (profile) {
              const { passwordHash: _ph, ...safeUser } = profile;
              setUser(safeUser);
              setAccessToken(session.access_token);
            } else {
              // Auth user exists but has no app profile — sign out gracefully
              setUser(null);
              setAccessToken(null);
              await supabase.auth.signOut();
            }
          } catch {
            setUser(null);
            setAccessToken(null);
          }
          setLoading(false);
          return;
        }

        // ── Signed out ─────────────────────────────────────────────────────
        setUser(null);
        setAccessToken(null);
        setRecovery(false);
        setLoading(false);
      });

      return () => subscription.unsubscribe();
    } else {
      // ── Offline / Dexie mode ──────────────────────────────────────────────
      async function init() {
        await deduplicateUsernames();
        await ensureDefaultAdmin();
        const sessionJson = localStorage.getItem(SESSION_KEY);
        if (sessionJson) {
          try {
            const session = JSON.parse(sessionJson);
            const dbUser = await db.users.get(session.id);
            if (dbUser) {
              const { passwordHash: _ph, ...safeUser } = dbUser;
              setUser(safeUser);
            } else {
              localStorage.removeItem(SESSION_KEY);
            }
          } catch {
            localStorage.removeItem(SESSION_KEY);
          }
        }
        setLoading(false);
      }
      init();
    }
  }, []);

  // ── signIn ─────────────────────────────────────────────────────────────────

  const signIn = async (emailOrUsername: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      let email = emailOrUsername.trim();

      if (!email.includes("@")) {
        // Username → look up email via SECURITY DEFINER RPC.
        // The RPC bypasses RLS so the lookup works pre-authentication.
        const { data: foundEmail, error: rpcErr } = await supabase.rpc(
          "get_user_email_by_username",
          { p_username: email.toLowerCase() },
        );
        if (rpcErr || !foundEmail) {
          return { error: "Username not found." };
        }
        email = foundEmail as string;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      return { error: null };
    } else {
      const dbUser = await db.users
        .where("username")
        .equals(emailOrUsername.toLowerCase().trim())
        .first();
      if (!dbUser) return { error: "Invalid username or password" };
      const valid = await verifyPassword(password, dbUser.passwordHash);
      if (!valid) return { error: "Invalid username or password" };
      const { passwordHash: _ph, ...safeUser } = dbUser;
      setUser(safeUser);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ id: dbUser.id }));
      return { error: null };
    }
  };

  // ── signOut ────────────────────────────────────────────────────────────────

  const signOut = () => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.signOut();
    } else {
      setUser(null);
      localStorage.removeItem(SESSION_KEY);
    }
  };

  // ── forgotPassword ─────────────────────────────────────────────────────────

  const forgotPassword = async (email: string) => {
    if (!isSupabaseConfigured || !supabase) {
      return {
        error: "Forgot password requires Supabase to be configured.",
      };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  // ── confirmPasswordReset ───────────────────────────────────────────────────
  // After updating the password, Supabase automatically issues a SIGNED_IN
  // event. We guard against that in onAuthStateChange using recoveryRef, then
  // call signOut() to ensure the user must log in manually with their new
  // password (as required).

  const confirmPasswordReset = async (newPassword: string) => {
    if (!isSupabaseConfigured || !supabase) {
      return { error: "Password reset requires Supabase." };
    }
    if (newPassword.length < 6) {
      return { error: "Password must be at least 6 characters." };
    }
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) return { error: error.message };

    // Clear recovery state first so the guard in onAuthStateChange is lifted
    // only after we sign out (the sign-out fires SIGNED_OUT which finishes
    // the cleanup).
    await supabase.auth.signOut();
    setRecovery(false);

    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        accessToken,
        recoveryMode,
        signIn,
        signOut,
        forgotPassword,
        confirmPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// User management
// ─────────────────────────────────────────────────────────────────────────────

export async function createUser(
  input: {
    username: string;
    fullName: string;
    email?: string;
    password?: string;
    role: AppRole;
  },
  accessToken?: string,
): Promise<{
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: string;
  inviteUrl: string | null;
}> {
  if (isSupabaseConfigured && accessToken) {
    const res = await fetch("/api/auth/invite-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        email: input.email,
        fullName: input.fullName,
        username: input.username,
        role: input.role,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error || "Failed to invite user",
      );
    }
    return res.json();
  } else {
    if (!input.password) throw new Error("Password is required");
    const existing = await db.users
      .where("username")
      .equals(input.username.toLowerCase().trim())
      .first();
    if (existing) throw new Error("Username already taken");
    const hash = await hashPassword(input.password);
    const user: User = {
      id: generateId(),
      username: input.username.toLowerCase().trim(),
      fullName: input.fullName.trim(),
      passwordHash: hash,
      role: input.role,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.users.add(user);
    return { ...user, email: "", inviteUrl: null };
  }
}

export async function updateUserRole(
  userId: string,
  role: AppRole,
  accessToken?: string,
): Promise<void> {
  if (isSupabaseConfigured && accessToken) {
    const res = await fetch(`/api/auth/users/${userId}/role`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error || "Failed to update role",
      );
    }
  } else {
    const target = await db.users.get(userId);
    if (!target) throw new Error("User not found");
    if (target.role === "administrator") {
      throw new Error("Administrator role cannot be changed.");
    }
    await db.users.update(userId, { role, updatedAt: now() });
  }
}

export async function updateUserPassword(
  userId: string,
  newPassword: string,
  actorRole?: AppRole,
) {
  if (isSupabaseConfigured) return; // Supabase manages passwords
  if (actorRole !== undefined && actorRole !== "administrator") {
    throw new Error(
      "Access denied: Only administrators can reset other users' passwords.",
    );
  }
  const target = await db.users.get(userId);
  if (target?.role === "administrator") {
    throw new Error(
      "Administrator credentials can only be changed by the Administrator themselves.",
    );
  }
  const hash = await hashPassword(newPassword);
  await db.users.update(userId, { passwordHash: hash, updatedAt: now() });
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  } else {
    const target = await db.users.get(userId);
    if (!target) throw new Error("User not found.");
    const valid = await verifyPassword(currentPassword, target.passwordHash);
    if (!valid) throw new Error("Current password is incorrect.");
    if (newPassword.length < 6)
      throw new Error("New password must be at least 6 characters.");
    const hash = await hashPassword(newPassword);
    await db.users.update(userId, { passwordHash: hash, updatedAt: now() });
  }
}

export async function listUsers(): Promise<Omit<User, "passwordHash">[]> {
  const users = await db.users.toArray();
  return users.map(({ passwordHash: _ph, ...u }) => u);
}

export async function deleteUser(id: string, accessToken?: string) {
  if (isSupabaseConfigured && accessToken) {
    const res = await fetch(`/api/auth/users/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error || "Failed to delete user",
      );
    }
  } else {
    const target = await db.users.get(id);
    if (target?.role === "administrator") {
      throw new Error("Administrator accounts cannot be deleted.");
    }
    await db.users.delete(id);
  }
}
