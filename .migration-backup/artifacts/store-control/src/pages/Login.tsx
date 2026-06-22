import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

const EVER_LOGGED_IN_KEY = "clinic_inventory_ever_logged_in";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const showAdminHint = !localStorage.getItem(EVER_LOGGED_IN_KEY);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await signIn(username, password);
    if (!err) {
      localStorage.setItem(EVER_LOGGED_IN_KEY, "1");
    } else {
      setError(err);
    }
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

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign in</CardTitle>
            {showAdminHint && (
              <CardDescription>Default admin: <span className="font-mono text-xs">admin / admin123</span></CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  data-testid="input-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-signin">
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          All data is stored locally in your browser. No internet required.
        </p>

        <p className="text-center text-xs text-muted-foreground mt-3 border-t border-border pt-3">
          Created by <span className="font-medium text-foreground">Emad Ali</span>
        </p>
      </div>
    </div>
  );
}
