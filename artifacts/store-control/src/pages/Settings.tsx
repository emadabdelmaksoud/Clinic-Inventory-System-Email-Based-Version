import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { exportBackup, migrateLocalToSupabase } from "@/lib/backup";
import { isSupabaseConfigured } from "@/lib/supabase";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { deduplicateProducts } from "@/lib/products";
import { deduplicateWarehouses } from "@/lib/warehouses";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings, Moon, Sun, Download, Smartphone, CheckCircle2,
  Cloud, HardDrive, Clock, Trash2, Loader2, Plus, X, List,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCustomCategories, saveCustomCategories,
  getCustomUnits, saveCustomUnits,
} from "@/lib/custom-lists";

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

function ListsManagement() {
  const qc = useQueryClient();
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("");

  const { data: customCategories = [] } = useQuery({ queryKey: ["customCategories"], queryFn: getCustomCategories });
  const { data: customUnits = [] } = useQuery({ queryKey: ["customUnits"], queryFn: getCustomUnits });

  const { mutate: saveCategories } = useMutation({
    mutationFn: saveCustomCategories,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customCategories"] }),
  });
  const { mutate: saveUnits } = useMutation({
    mutationFn: saveCustomUnits,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customUnits"] }),
  });

  function addCategory() {
    const v = newCategory.trim();
    if (!v) return;
    if (customCategories.includes(v)) { toast.error("Category already exists"); return; }
    saveCategories([...customCategories, v]);
    setNewCategory("");
  }
  function removeCategory(c: string) { saveCategories(customCategories.filter(x => x !== c)); }

  function addUnit() {
    const v = newUnit.trim();
    if (!v) return;
    if (customUnits.includes(v)) { toast.error("Unit already exists"); return; }
    saveUnits([...customUnits, v]);
    setNewUnit("");
  }
  function removeUnit(u: string) { saveUnits(customUnits.filter(x => x !== u)); }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><List className="w-4 h-4" /> Lists Management</CardTitle>
        <CardDescription className="text-xs">Add or remove custom entries that appear in the product form. Built-in entries cannot be removed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Categories */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Custom Categories</p>
          {customCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No custom categories yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {customCategories.map(c => (
                <span key={c} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
                  {c}
                  <button type="button" onClick={() => removeCategory(c)} className="text-muted-foreground/60 hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category…" className="h-8 text-sm"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }} />
            <Button size="sm" variant="outline" className="h-8 px-3 gap-1" onClick={addCategory} type="button"><Plus className="w-3.5 h-3.5" /> Add</Button>
          </div>
        </div>
        {/* Units */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Custom Base Units</p>
          {customUnits.length === 0 ? (
            <p className="text-xs text-muted-foreground">No custom units yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {customUnits.map(u => (
                <span key={u} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
                  {u}
                  <button type="button" onClick={() => removeUnit(u)} className="text-muted-foreground/60 hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="New unit…" className="h-8 text-sm"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addUnit(); } }} />
            <Button size="sm" variant="outline" className="h-8 px-3 gap-1" onClick={addUnit} type="button"><Plus className="w-3.5 h-3.5" /> Add</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
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
      await Promise.all([
        setSetting("orgName", orgName),
        setSetting("nearExpiryDays", nearExpiryDays),
      ]);
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

      {/* General */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organization / Clinic Name</Label>
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Main Clinic"
            />
          </div>
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

      {/* Auto Backup */}
      <Card>
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
      </Card>

      {/* Data Quality */}
      <Card>
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
      </Card>

      {/* Lists Management — admin only */}
      {user?.role === "admin" && <ListsManagement />}

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
