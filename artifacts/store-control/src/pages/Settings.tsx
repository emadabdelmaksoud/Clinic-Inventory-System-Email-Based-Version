import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { exportBackup, migrateLocalToSupabase } from "@/lib/backup";
import { isSupabaseConfigured } from "@/lib/supabase";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { deduplicateProducts } from "@/lib/products";
import { deduplicateWarehouses } from "@/lib/warehouses";
import { useAuth, changeOwnPassword } from "@/lib/auth";
import { isSuperAdmin, isAdmin } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings, Moon, Sun, Download, Smartphone, CheckCircle2,
  Cloud, HardDrive, Clock, Trash2, Loader2, Plus, X, List,
  Shield, History, RotateCcw, Save, KeyRound, Eye, EyeOff,
  UserCircle2, Crown, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAllCategories, saveAllCategories, resetCategories,
  getAllUnits, saveAllUnits, resetUnits,
} from "@/lib/custom-lists";
import { PHARMA_CATEGORIES, PHARMA_UNITS } from "@/lib/pharma-constants";
import {
  saveRestorePoint, listRestorePoints, deleteRestorePoint, restoreFromPoint,
  type RestorePointMeta,
} from "@/lib/restore-points";
import { getAutoLogoutMinutes, setAutoLogoutMinutes } from "@/hooks/use-inactivity-logout";

async function getSetting(key: string): Promise<string | null> {
  const row = await db.settings.get(key);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

function formatLastRun(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function EditableList({
  title,
  items,
  newValue,
  onNewValueChange,
  onAdd,
  onRemove,
  onReset,
  defaultCount,
}: {
  title: string;
  items: string[];
  newValue: string;
  onNewValueChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (item: string) => void;
  onReset: () => void;
  defaultCount: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Button
          size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onReset} type="button"
          title={`Reset to ${defaultCount} built-in defaults`}
        >
          Reset to defaults
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto rounded border bg-muted/20 p-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-0.5">No items. Add one below or reset to defaults.</p>
        ) : items.map(item => (
          <span key={item} className="inline-flex items-center gap-1 text-xs bg-background border rounded px-2 py-0.5 shadow-sm">
            {item}
            <button
              type="button"
              onClick={() => onRemove(item)}
              className="text-muted-foreground/50 hover:text-destructive transition-colors ml-0.5"
              title={`Remove "${item}"`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newValue}
          onChange={e => onNewValueChange(e.target.value)}
          placeholder={`Add to ${title.toLowerCase()}…`}
          className="h-8 text-sm"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
        />
        <Button size="sm" variant="outline" className="h-8 px-3 gap-1 flex-shrink-0" onClick={onAdd} type="button">
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}

function ListsManagement() {
  const qc = useQueryClient();
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["all_categories"] });
    qc.invalidateQueries({ queryKey: ["all_units"] });
  };

  const { data: categories = [] } = useQuery({ queryKey: ["all_categories"], queryFn: getAllCategories });
  const { data: units = [] } = useQuery({ queryKey: ["all_units"], queryFn: getAllUnits });

  const { mutate: saveCategories } = useMutation({
    mutationFn: saveAllCategories,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all_categories"] }),
  });
  const { mutate: saveUnits } = useMutation({
    mutationFn: saveAllUnits,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all_units"] }),
  });

  function addCategory() {
    const v = newCategory.trim();
    if (!v) return;
    if (categories.includes(v)) { toast.error("Category already exists"); return; }
    saveCategories([...categories, v].sort());
    setNewCategory("");
  }
  function removeCategory(c: string) { saveCategories(categories.filter(x => x !== c)); }
  async function handleResetCategories() {
    await resetCategories();
    invalidate();
    toast.success("Categories reset to defaults");
  }

  function addUnit() {
    const v = newUnit.trim();
    if (!v) return;
    if (units.includes(v)) { toast.error("Unit already exists"); return; }
    saveUnits([...units, v].sort());
    setNewUnit("");
  }
  function removeUnit(u: string) { saveUnits(units.filter(x => x !== u)); }
  async function handleResetUnits() {
    await resetUnits();
    invalidate();
    toast.success("Base units reset to defaults");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><List className="w-4 h-4" /> Lists Management</CardTitle>
        <CardDescription className="text-xs">
          Add or remove any category or base unit — including built-in ones. Changes appear immediately in the product form.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <EditableList
          title="Categories"
          items={categories}
          newValue={newCategory}
          onNewValueChange={setNewCategory}
          onAdd={addCategory}
          onRemove={removeCategory}
          onReset={handleResetCategories}
          defaultCount={PHARMA_CATEGORIES.length}
        />
        <EditableList
          title="Base Units"
          items={units}
          newValue={newUnit}
          onNewValueChange={setNewUnit}
          onAdd={addUnit}
          onRemove={removeUnit}
          onReset={handleResetUnits}
          defaultCount={PHARMA_UNITS.length}
        />
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard({ userId }: { userId: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (next !== confirm) { toast.error("Passwords do not match"); return; }
    setSaving(true);
    try {
      await changeOwnPassword(userId, current, next);
      toast.success("Password changed successfully");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Change My Password
        </CardTitle>
        <CardDescription>Update your login password. You must enter your current password to confirm.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Current Password</Label>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                className="pr-10"
                placeholder="Enter current password"
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent(v => !v)}>
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={showNext ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={6}
                className="pr-10"
                placeholder="At least 6 characters"
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNext(v => !v)}>
                {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <Input
              type={showNext ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              placeholder="Repeat new password"
            />
            {confirm && next !== confirm && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
          <Button type="submit" disabled={saving || (!!confirm && next !== confirm)} className="w-full sm:w-auto">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Changing…</> : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityCard() {
  const [value, setValue] = useState<string>(() => {
    const v = localStorage.getItem("autoLogoutMinutes");
    return v ?? "off";
  });

  function handleChange(val: string) {
    setValue(val);
    setAutoLogoutMinutes(val === "off" ? "off" : parseInt(val, 10));
    toast.success(val === "off" ? "Auto-logout disabled" : `Auto-logout set to ${val} minutes`);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4" /> Security
        </CardTitle>
        <CardDescription>
          Automatically sign out after a period of inactivity to protect your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Auto-logout after inactivity</p>
            <p className="text-xs text-muted-foreground">
              {value === "off" ? "Disabled — session stays active until manually signed out." : `Signs out after ${value} minutes of no activity.`}
            </p>
          </div>
          <Select value={value} onValueChange={handleChange}>
            <SelectTrigger className="w-36 flex-shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="5">5 minutes</SelectItem>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="120">2 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function RestorePointsCard() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const { data: points = [], isLoading } = useQuery<RestorePointMeta[]>({
    queryKey: ["restorePoints"],
    queryFn: listRestorePoints,
  });

  async function handleSave() {
    setSaving(true);
    try {
      await saveRestorePoint(name || `Snapshot ${new Date().toLocaleString()}`);
      setName("");
      toast.success("Restore point saved");
      qc.invalidateQueries({ queryKey: ["restorePoints"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  }

  async function handleRestore(id: string, pointName: string) {
    if (!confirm(`Restore to "${pointName}"? All current data will be replaced. This cannot be undone.`)) return;
    setRestoring(id);
    try {
      await restoreFromPoint(id);
      toast.success(`Restored to "${pointName}". Refreshing…`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setRestoring(null);
  }

  async function handleDelete(id: string) {
    try {
      await deleteRestorePoint(id);
      toast.success("Restore point deleted");
      qc.invalidateQueries({ queryKey: ["restorePoints"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="w-4 h-4" /> Restore Points
        </CardTitle>
        <CardDescription>
          Save a named snapshot of all your data that you can restore later. Stored locally on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Snapshot name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 flex-shrink-0">
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save Now"}
          </Button>
        </div>

        {isLoading ? (
          <div className="h-12 bg-muted animate-pulse rounded" />
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No restore points saved yet.</p>
        ) : (
          <div className="space-y-2">
            {points.map((rp) => (
              <div key={rp.id} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{rp.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(rp.createdAt).toLocaleString()} · {formatBytes(rp.sizeBytes)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 flex-shrink-0"
                  onClick={() => handleRestore(rp.id, rp.name)}
                  disabled={restoring === rp.id}
                >
                  <RotateCcw className="w-3 h-3" />
                  {restoring === rp.id ? "Restoring…" : "Restore"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10 flex-shrink-0"
                  onClick={() => handleDelete(rp.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role;
  const isSuperAdm = isSuperAdmin(role);
  const isAdminOrAbove = isAdmin(role);
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();

  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains("dark"));
  const [orgName, setOrgName] = useState("");
  const [nearExpiryDays, setNearExpiryDays] = useState("90");
  const [saving, setSaving] = useState(false);

  // Deduplication state
  const [dedupingProducts, setDedupingProducts] = useState(false);
  const [dedupingWarehouses, setDedupingWarehouses] = useState(false);

  // Auto backup state
  const [offlineInterval, setOfflineInterval] = useState<string>("off");
  const [supabaseInterval, setSupabaseInterval] = useState<string>("off");
  const [lastOffline, setLastOffline] = useState<string | null>(null);
  const [lastSupabase, setLastSupabase] = useState<string | null>(null);
  const [runningOffline, setRunningOffline] = useState(false);
  const [runningSupabase, setRunningSupabase] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const [org, days] = await Promise.all([
        getSetting("orgName"),
        getSetting("nearExpiryDays"),
      ]);
      return { orgName: org ?? "", nearExpiryDays: days ?? "90" };
    },
  });

  useEffect(() => {
    if (settings) {
      setOrgName(settings.orgName);
      setNearExpiryDays(settings.nearExpiryDays);
    }
  }, [settings]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
    setOfflineInterval(localStorage.getItem("autoOfflineBackup") ?? "off");
    setSupabaseInterval(localStorage.getItem("autoSupabaseBackup") ?? "off");
    setLastOffline(localStorage.getItem("lastOfflineBackup"));
    setLastSupabase(localStorage.getItem("lastSupabaseBackup"));
  }, []);

  function toggleDarkMode(enabled: boolean) {
    setDarkMode(enabled);
    if (enabled) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", enabled ? "dark" : "light");
  }

  function handleOfflineIntervalChange(val: string) {
    setOfflineInterval(val);
    localStorage.setItem("autoOfflineBackup", val);
    toast.success(val === "off" ? "Auto offline backup disabled" : `Auto offline backup set to ${val}`);
  }

  function handleSupabaseIntervalChange(val: string) {
    setSupabaseInterval(val);
    localStorage.setItem("autoSupabaseBackup", val);
    toast.success(val === "off" ? "Auto Supabase backup disabled" : `Auto Supabase backup set to ${val}`);
  }

  async function runOfflineBackupNow() {
    setRunningOffline(true);
    try {
      await exportBackup();
      const ts = new Date().toISOString();
      localStorage.setItem("lastOfflineBackup", ts);
      setLastOffline(ts);
      toast.success("Offline backup downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setRunningOffline(false);
  }

  async function runSupabaseBackupNow() {
    setRunningSupabase(true);
    try {
      await migrateLocalToSupabase(() => {});
      const ts = new Date().toISOString();
      localStorage.setItem("lastSupabaseBackup", ts);
      setLastSupabase(ts);
      toast.success("Synced to Supabase");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setRunningSupabase(false);
  }

  async function runDeduplicateProducts() {
    if (!confirm("This will remove duplicate products (same name, case-insensitive) and merge their inventory to the oldest record. Continue?")) return;
    setDedupingProducts(true);
    try {
      const { removed, merged } = await deduplicateProducts(user?.id);
      if (removed === 0) toast.success("No duplicate products found");
      else {
        toast.success(`Removed ${removed} duplicate product${removed !== 1 ? "s" : ""}, merged ${merged} record${merged !== 1 ? "s" : ""}`);
        qc.invalidateQueries({ queryKey: ["products"] });
      }
    } catch (e) { toast.error((e as Error).message); }
    setDedupingProducts(false);
  }

  async function runDeduplicateWarehouses() {
    if (!confirm("This will remove duplicate warehouses (same name, case-insensitive) and merge their sections and inventory to the oldest record. Continue?")) return;
    setDedupingWarehouses(true);
    try {
      const { removed, merged } = await deduplicateWarehouses(user?.id);
      if (removed === 0) toast.success("No duplicate warehouses found");
      else {
        toast.success(`Removed ${removed} duplicate warehouse${removed !== 1 ? "s" : ""}, merged ${merged} record${merged !== 1 ? "s" : ""}`);
        qc.invalidateQueries({ queryKey: ["warehouses"] });
      }
    } catch (e) { toast.error((e as Error).message); }
    setDedupingWarehouses(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const ops: Promise<void>[] = [];
      if (isSuperAdm) ops.push(setSetting("orgName", orgName));
      if (isAdminOrAbove) ops.push(setSetting("nearExpiryDays", nearExpiryDays));
      await Promise.all(ops);
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground">Configure your Clinic Inventory app</p>
      </div>

      {/* Profile card — all roles */}
      {user && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <UserCircle2 className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate">{user.fullName || user.username}</p>
                <p className="text-sm text-muted-foreground font-mono truncate">@{user.username}</p>
              </div>
              <div className="flex-shrink-0">
                {user.role === "administrator" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">
                    <Crown className="w-3 h-3" /> Administrator
                  </span>
                ) : user.role === "admin" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                    <ShieldCheck className="w-3 h-3" /> Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
                    Staff
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* General — admin and above only */}
      {isAdminOrAbove && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSuperAdm && (
              <div className="space-y-1.5">
                <Label>Organization / Clinic Name</Label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Main Clinic"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Near-Expiry Warning Days</Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={nearExpiryDays}
                onChange={(e) => setNearExpiryDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Products expiring within this many days are flagged as "Near Expiry".
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Appearance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              <div>
                <p className="text-sm font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Toggle dark/light theme</p>
              </div>
            </div>
            <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
          </div>
        </CardContent>
      </Card>

      {/* PWA Install */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> Install App
          </CardTitle>
          <CardDescription>
            Install Clinic Inventory as a standalone app on your device — works offline, no browser bar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isInstalled ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>App is already installed on this device.</span>
            </div>
          ) : canInstall ? (
            <Button onClick={promptInstall} className="w-full sm:w-auto">
              <Download className="w-4 h-4 mr-2" /> Install App
            </Button>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>To install, use your browser's install option:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><strong>Chrome / Edge:</strong> click the install icon (⊕) in the address bar</li>
                <li><strong>Safari (iPhone/iPad):</strong> Share → "Add to Home Screen"</li>
                <li><strong>Firefox:</strong> not supported — use Chrome or Edge</li>
              </ul>
              <p className="text-xs">The install button appears automatically when the app is deployed to Vercel.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto Backup — administrator only */}
      {isSuperAdm && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" /> Auto Backup
          </CardTitle>
          <CardDescription>
            Automatically back up your data on a schedule. Backups run when the app is open and the interval has elapsed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Offline backup */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <HardDrive className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Offline Backup (JSON file)</p>
                  <p className="text-xs text-muted-foreground">
                    Downloads a backup file to your device automatically.
                    Last run: <span className="font-medium">{formatLastRun(lastOffline)}</span>
                  </p>
                </div>
              </div>
              <Select value={offlineInterval} onValueChange={handleOfflineIntervalChange}>
                <SelectTrigger className="w-32 flex-shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={runOfflineBackupNow}
              disabled={runningOffline}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {runningOffline ? "Downloading…" : "Back Up Now"}
            </Button>
          </div>

          <div className="border-t" />

          {/* Supabase backup */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <Cloud className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    Supabase Sync
                    {!isSupabaseConfigured && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">(requires Supabase connection)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Syncs local data to your Supabase cloud database.
                    Last run: <span className="font-medium">{formatLastRun(lastSupabase)}</span>
                  </p>
                </div>
              </div>
              <Select
                value={supabaseInterval}
                onValueChange={handleSupabaseIntervalChange}
                disabled={!isSupabaseConfigured}
              >
                <SelectTrigger className="w-32 flex-shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={runSupabaseBackupNow}
              disabled={runningSupabase || !isSupabaseConfigured}
            >
              <Cloud className="w-3.5 h-3.5 mr-1.5" />
              {runningSupabase ? "Syncing…" : "Sync Now"}
            </Button>
          </div>
        </CardContent>
      </Card>}

      {/* Data Quality — admin and above only */}
      {isAdminOrAbove && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Data Quality
          </CardTitle>
          <CardDescription>
            Find and remove duplicate products or warehouses (case-insensitive name match).
            Inventory data is safely merged into the oldest record before duplicates are deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Duplicate Products</p>
              <p className="text-xs text-muted-foreground">
                Merges batches & transactions, keeps the oldest product.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={runDeduplicateProducts}
              disabled={dedupingProducts}
              className="flex-shrink-0"
            >
              {dedupingProducts ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Running…</>
              ) : (
                "Remove Duplicates"
              )}
            </Button>
          </div>
          <div className="border-t" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Duplicate Warehouses</p>
              <p className="text-xs text-muted-foreground">
                Merges sections & batches, keeps the oldest warehouse.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={runDeduplicateWarehouses}
              disabled={dedupingWarehouses}
              className="flex-shrink-0"
            >
              {dedupingWarehouses ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Running…</>
              ) : (
                "Remove Duplicates"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>}

      {/* Lists Management — administrator only */}
      {isSuperAdm && <ListsManagement />}

      {/* Change My Password — all roles */}
      {user && <ChangePasswordCard userId={user.id} />}

      {/* Security — auto-logout */}
      <SecurityCard />

      {/* Restore Points — administrator only */}
      {isSuperAdm && <RestorePointsCard />}

      {/* About */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>App</span>
            <span className="font-medium text-foreground">AUC Clinic Inventory</span>
          </div>
          <div className="flex justify-between">
            <span>Version</span>
            <span>1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Storage</span>
            <span>{isSupabaseConfigured ? "Supabase + IndexedDB" : "Browser IndexedDB"}</span>
          </div>
          <div className="flex justify-between">
            <span>Mode</span>
            <span>{isSupabaseConfigured ? "Cloud + Offline" : "Fully Offline"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
