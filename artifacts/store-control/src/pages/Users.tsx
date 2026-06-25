import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listUsers,
  createUser,
  deleteUser,
  updateUserPassword,
  updateUserRole,
} from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { can, canManageUser, canResetPassword, isSuperAdmin } from "@/lib/permissions";
import type { AppRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Key,
  Users,
  Eye,
  EyeOff,
  ShieldCheck,
  Crown,
  ShieldAlert,
  Mail,
  Copy,
  Check,
  Pencil,
  Link,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: AppRole }) {
  if (role === "administrator") {
    return (
      <Badge className="text-xs gap-1 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-100">
        <Crown className="w-3 h-3" /> Administrator
      </Badge>
    );
  }
  if (role === "admin") {
    return (
      <Badge variant="default" className="text-xs gap-1">
        <ShieldCheck className="w-3 h-3" /> Admin
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="capitalize text-xs">
      {role}
    </Badge>
  );
}

function AccessDeniedNote() {
  return (
    <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
      <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
      Administrator accounts are protected. Only an Administrator can manage
      this account.
    </div>
  );
}

// ── Invite URL display ────────────────────────────────────────────────────────

function InviteLinkDialog({
  url,
  userName,
  onClose,
}: {
  url: string;
  userName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-4 h-4 text-primary" /> Invite Link Ready
          </DialogTitle>
          <DialogDescription>
            Share this link with <strong>{userName}</strong>. They can click it
            to set their password and access the app. The link expires in 24
            hours.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md border">
            <code className="text-xs flex-1 break-all">{url}</code>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            If email is configured in Supabase, the user may also receive an
            automated invite email. Either way, this link is always valid.
          </p>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Create / Invite user form ─────────────────────────────────────────────────

function CreateUserForm({
  onClose,
  onInviteUrl,
  actorRole,
  accessToken,
}: {
  onClose: () => void;
  onInviteUrl: (url: string, name: string) => void;
  actorRole: AppRole;
  accessToken: string | null;
}) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<AppRole>("staff");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "administrator" && !isSuperAdmin(actorRole)) {
      toast.error(
        "Access Denied: Only an Administrator can create Administrator accounts.",
      );
      return;
    }
    setSaving(true);
    try {
      if (isSupabaseConfigured) {
        const result = await createUser(
          { username, fullName, email, role },
          accessToken ?? undefined,
        );
        qc.invalidateQueries({ queryKey: ["users"] });
        onClose();
        if (result.inviteUrl) {
          onInviteUrl(result.inviteUrl, fullName || username);
        } else {
          toast.success(`User created. No invite URL returned — check Supabase.`);
        }
      } else {
        await createUser({ username, fullName, password, role });
        toast.success("User created");
        qc.invalidateQueries({ queryKey: ["users"] });
        onClose();
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Full Name *</Label>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Jane Smith"
          required
          autoFocus
        />
      </div>

      {/* Email — only required in Supabase mode */}
      {isSupabaseConfigured && (
        <div className="space-y-1.5">
          <Label>Email Address *</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            required
          />
          <p className="text-xs text-muted-foreground">
            An invite link will be generated for the user to set their own
            password.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Username *</Label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="lowercase, no spaces"
          required
        />
      </div>

      {/* Password — only in offline mode */}
      {!isSupabaseConfigured && (
        <div className="space-y-1.5">
          <Label>Password *</Label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPw((v) => !v)}
            >
              {showPw ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select
          value={role}
          onValueChange={(v) => setRole(v as AppRole)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {isSuperAdmin(actorRole) && (
              <SelectItem value="administrator">
                Administrator (Super Admin)
              </SelectItem>
            )}
            <SelectItem value="admin">Admin (full access)</SelectItem>
            <SelectItem value="staff">Staff (limited access)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? isSupabaseConfigured
              ? "Creating…"
              : "Creating…"
            : isSupabaseConfigured
              ? "Create & Get Invite Link"
              : "Create User"}
        </Button>
      </div>
    </form>
  );
}

// ── Edit role form ────────────────────────────────────────────────────────────

function EditRoleForm({
  userId,
  currentRole,
  userName,
  actorRole,
  accessToken,
  onClose,
}: {
  userId: string;
  currentRole: AppRole;
  userName: string;
  actorRole: AppRole;
  accessToken: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [role, setRole] = useState<AppRole>(currentRole);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (role === currentRole) { onClose(); return; }
    setSaving(true);
    try {
      await updateUserRole(userId, role, accessToken ?? undefined);
      toast.success(`Role updated for ${userName}`);
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-muted rounded-md text-sm">
        Changing role for <strong>{userName}</strong>.
        {currentRole === "administrator" && (
          <p className="text-xs text-amber-600 mt-1">
            Warning: removing Administrator role cannot be undone without
            direct database access.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>New Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {isSuperAdmin(actorRole) && (
              <SelectItem value="administrator">
                Administrator (Super Admin)
              </SelectItem>
            )}
            <SelectItem value="admin">Admin (full access)</SelectItem>
            <SelectItem value="staff">Staff (limited access)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || role === currentRole}>
          {saving ? "Saving…" : "Save Role"}
        </Button>
      </div>
    </form>
  );
}

// ── Reset password form (offline only) ───────────────────────────────────────

function ResetPasswordForm({
  userId,
  userName,
  actorRole,
  onClose,
}: {
  userId: string;
  userName: string;
  actorRole: AppRole;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await updateUserPassword(userId, password, actorRole);
      toast.success(`Password reset for ${userName}`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
        <ShieldCheck className="w-4 h-4 flex-shrink-0" />
        <span>
          Resetting password for <strong>{userName}</strong>.
        </span>
      </div>
      <div className="space-y-1.5">
        <Label>New Password *</Label>
        <div className="relative">
          <Input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="pr-10"
            placeholder="At least 6 characters"
            autoFocus
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPw((v) => !v)}
          >
            {showPw ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Confirm Password *</Label>
        <Input
          type={showPw ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={6}
          placeholder="Repeat the password"
        />
        {confirm && password !== confirm && (
          <p className="text-xs text-destructive">Passwords do not match</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saving || (!!confirm && password !== confirm)}
        >
          {saving ? "Resetting…" : "Reset Password"}
        </Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: currentUser, accessToken } = useAuth();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [inviteLink, setInviteLink] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [editRoleUser, setEditRoleUser] = useState<{
    id: string;
    name: string;
    role: AppRole;
  } | null>(null);
  const [resetPwUser, setResetPwUser] = useState<{
    id: string;
    name: string;
    role: AppRole;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (id: string) => deleteUser(id, accessToken ?? undefined),
    onSuccess: () => {
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeleteId(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canManage = can(currentUser?.role, "users", "manage");
  // In Supabase mode only administrator can create / delete users
  const canCreate = isSupabaseConfigured
    ? isSuperAdmin(currentUser?.role)
    : canManage;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" /> Users
          </h1>
          <p className="text-sm text-muted-foreground">
            {users.length} user{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {isSupabaseConfigured ? "Add User" : "Add User"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Username</th>
                {isSupabaseConfigured && (
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">
                    Email
                  </th>
                )}
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
                  Created
                </th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => {
                const isProtected = u.role === "administrator";
                const actorCanManage = canManageUser(
                  currentUser?.role,
                  u.role,
                );
                const isSelf = u.id === currentUser?.id;

                return (
                  <tr
                    key={u.id}
                    className={`hover:bg-muted/30 ${
                      isProtected ? "bg-purple-50/40 dark:bg-purple-950/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.fullName}</div>
                      {isSelf && (
                        <span className="text-xs text-primary">(You)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {u.username}
                    </td>
                    {isSupabaseConfigured && (
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                        {u.email ? (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {u.email}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role as AppRole} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                      {format(new Date(u.createdAt), "MMM d, yyyy")}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {!actorCanManage ? (
                          <div className="flex justify-end">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> Protected
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 justify-end">
                            {/* Edit role — available to administrator for all
                                manageable users except themselves */}
                            {!isSelf && isSuperAdmin(currentUser?.role) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1.5"
                                title="Edit role"
                                onClick={() =>
                                  setEditRoleUser({
                                    id: u.id,
                                    name: u.fullName || u.username,
                                    role: u.role as AppRole,
                                  })
                                }
                              >
                                <Pencil className="w-3 h-3" /> Role
                              </Button>
                            )}

                            {/* Reset password — offline mode only (Supabase
                                users reset via Forgot Password) */}
                            {!isSupabaseConfigured &&
                              !isSelf &&
                              canResetPassword(currentUser?.role) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5"
                                  onClick={() =>
                                    setResetPwUser({
                                      id: u.id,
                                      name: u.fullName || u.username,
                                      role: u.role as AppRole,
                                    })
                                  }
                                >
                                  <Key className="w-3 h-3" /> Reset
                                </Button>
                              )}

                            {/* Delete — administrator only, not self */}
                            {!isSelf && isSuperAdmin(currentUser?.role) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                title="Delete user"
                                onClick={() => setDeleteId(u.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isSupabaseConfigured && canCreate && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
              <span>
                Users are created with an invite link. Share the link so they
                can set their own password. They can also reset it anytime via{" "}
                <strong>Forgot Password</strong> on the login page.
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Create user dialog ─────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSupabaseConfigured ? "Add User" : "Create User"}
            </DialogTitle>
            <DialogDescription>
              {isSupabaseConfigured
                ? "Create a new user account and get an invite link to share."
                : "Add a new staff member or admin account."}
            </DialogDescription>
          </DialogHeader>
          <CreateUserForm
            onClose={() => setShowCreate(false)}
            onInviteUrl={(url, name) => setInviteLink({ url, name })}
            actorRole={currentUser?.role as AppRole}
            accessToken={accessToken}
          />
        </DialogContent>
      </Dialog>

      {/* ── Invite link dialog ─────────────────────────────────────── */}
      {inviteLink && (
        <InviteLinkDialog
          url={inviteLink.url}
          userName={inviteLink.name}
          onClose={() => setInviteLink(null)}
        />
      )}

      {/* ── Edit role dialog ────────────────────────────────────────── */}
      <Dialog
        open={!!editRoleUser}
        onOpenChange={(o) => !o && setEditRoleUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Edit Role
            </DialogTitle>
            <DialogDescription>
              Change the access level for this user account.
            </DialogDescription>
          </DialogHeader>
          {editRoleUser && (
            <EditRoleForm
              userId={editRoleUser.id}
              currentRole={editRoleUser.role}
              userName={editRoleUser.name}
              actorRole={currentUser?.role as AppRole}
              accessToken={accessToken}
              onClose={() => setEditRoleUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reset password dialog (offline only) ───────────────────── */}
      {!isSupabaseConfigured && (
        <Dialog
          open={!!resetPwUser}
          onOpenChange={(o) => !o && setResetPwUser(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="w-4 h-4" /> Reset Password
              </DialogTitle>
              <DialogDescription>
                Set a new password for this user account.
              </DialogDescription>
            </DialogHeader>
            {resetPwUser &&
            resetPwUser.role === "administrator" &&
            !isSuperAdmin(currentUser?.role) ? (
              <AccessDeniedNote />
            ) : resetPwUser ? (
              <ResetPasswordForm
                userId={resetPwUser.id}
                userName={resetPwUser.name}
                actorRole={currentUser?.role as AppRole}
                onClose={() => setResetPwUser(null)}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete confirmation ─────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              {isSupabaseConfigured
                ? "This will permanently remove the user from the app AND from Supabase Auth. They will no longer be able to sign in. This cannot be undone."
                : "This user will be permanently removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && doDelete(deleteId)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
