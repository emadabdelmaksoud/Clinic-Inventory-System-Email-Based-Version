import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { db, type User } from "./db";
import { generateId, now } from "./db";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
}

interface AuthCtx {
  user: Omit<User, "passwordHash"> | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

const SESSION_KEY = "store_control_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, "passwordHash"> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
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
  }, []);

  const signIn = async (username: string, password: string) => {
    const dbUser = await db.users.where("username").equals(username.toLowerCase().trim()).first();
    if (!dbUser) return { error: "Invalid username or password" };
    const valid = await verifyPassword(password, dbUser.passwordHash);
    if (!valid) return { error: "Invalid username or password" };
    const { passwordHash: _ph, ...safeUser } = dbUser;
    setUser(safeUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: dbUser.id }));
    return { error: null };
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

async function ensureDefaultAdmin() {
  const count = await db.users.count();
  if (count === 0) {
    const hash = await hashPassword("admin123");
    await db.users.add({
      id: generateId(),
      username: "admin",
      fullName: "Administrator",
      passwordHash: hash,
      role: "admin",
      createdAt: now(),
      updatedAt: now(),
    });
  }
}

export async function createUser(input: {
  username: string;
  fullName: string;
  password: string;
  role: "admin" | "staff";
}) {
  const existing = await db.users.where("username").equals(input.username.toLowerCase().trim()).first();
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
  return user;
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const hash = await hashPassword(newPassword);
  await db.users.update(userId, { passwordHash: hash, updatedAt: now() });
}

export async function listUsers(): Promise<Omit<User, "passwordHash">[]> {
  const users = await db.users.toArray();
  return users.map(({ passwordHash: _ph, ...u }) => u);
}

export async function deleteUser(id: string) {
  await db.users.delete(id);
}
