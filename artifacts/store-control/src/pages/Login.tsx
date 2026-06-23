import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, ArrowLeft, KeyRound } from "lucide-react";

const EVER_LOGGED_IN_KEY = "clinic_inventory_ever_logged_in";

type View = "login" | "forgot" | "reset_password";

export default function LoginPage() {
  const { signIn, forgotPassword, confirmPasswordReset, recoveryMode } = useAuth();

  const [view, setView] = useState<View>(recoveryMode ? "reset_password" : "login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const showAdminHint = !localStorage.getItem(EVER_LOGGED_IN_KEY);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // Reset password state (PASSWORD_RECOVERY flow)
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // If recoveryMode changes after mount, switch view
  if (recoveryMode && view !== "reset_password") {
    setView("reset_password");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await signIn(identifier, password);
    if (!err) {
      localStorage.setItem(EVER_LOGGED_IN_KEY, "1");
    } else {
      setError(err);
    }
    setLoading(false);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await forgotPassword(forgotEmail);
    if (err) {
      setError(err);
    } else {
      setForgotSent(true);
    }
    setLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error: err } = await confirmPasswordReset(newPassword);
    if (err) setError(err);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl mb-3 shadow-md overflow-hidden">
            <img src="/icon.png" alt="Clinic Inventory" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Clinic Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">AUC Clinic Inventory System</p>
        </div>

        {/* ── Sign In ─────────────────────────────────────────── */}
        {view === "login" && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Sign in</CardTitle>
              {!isSupabaseConfigured && showAdminHint && (
                <CardDescription>
                  Default admin:{" "}
                  <span className="font-mono text-xs">admin / admin123</span>
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="identifier">
                    {isSupabaseConfigured ? "Email or Username" : "Username"}
                  </Label>
                  <Input
                    id="identifier"
                    data-testid="input-username"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={isSupabaseConfigured ? "email@example.com or username" : "Enter username"}
                    required
                    autoFocus
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {isSupabaseConfigured && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => { setView("forgot"); setError(""); }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    data-testid="input-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    autoComplete="current-password"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                  data-testid="button-signin"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Forgot Password ──────────────────────────────────── */}
        {view === "forgot" && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <KeyRound className="w-5 h-5" /> Forgot Password
              </CardTitle>
              <CardDescription>
                Enter your email address and we'll send you a password reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forgotSent ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md text-sm text-green-800 dark:text-green-300">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Reset link sent to <strong>{forgotEmail}</strong>. Check your inbox and
                      follow the link to set a new password.
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => { setView("login"); setForgotSent(false); setForgotEmail(""); setError(""); }}
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email">Email Address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="email@example.com"
                      required
                      autoFocus
                    />
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Sending…" : "Send Reset Link"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full gap-2"
                    onClick={() => { setView("login"); setError(""); }}
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to Sign In
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Set New Password (PASSWORD_RECOVERY) ─────────────── */}
        {view === "reset_password" && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <KeyRound className="w-5 h-5" /> Set New Password
              </CardTitle>
              <CardDescription>
                Choose a new password for your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    minLength={6}
                    autoFocus
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || (!!confirmPassword && newPassword !== confirmPassword)}
                >
                  {loading ? "Saving…" : "Set New Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          {isSupabaseConfigured
            ? "Accounts are created by an Administrator."
            : "All data is stored locally in your browser. No internet required."}
        </p>

        <p className="text-center text-xs text-muted-foreground mt-3 border-t border-border pt-3">
          Created by <span className="font-medium text-foreground">Emad Ali</span>
        </p>
      </div>
    </div>
  );
}
