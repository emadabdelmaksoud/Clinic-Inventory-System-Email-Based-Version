import { useState, useEffect } from "react";
import {
  exportBackup,
  importBackup,
  migrateLocalToSupabase,
  getLocalDataSummary,
  type MigrationProgress,
  type MigrationSummary,
} from "@/lib/backup";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  HardDrive, Download, Upload, AlertTriangle, Cloud,
  CheckCircle2, Loader2, Database, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

export default function BackupsPage() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Migration state
  const [localSummary, setLocalSummary] = useState<MigrationSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [migrationDone, setMigrationDone] = useState(false);
  const [migratedCount, setMigratedCount] = useState(0);

  useEffect(() => {
    if (isSupabaseConfigured) {
      setLoadingSummary(true);
      getLocalDataSummary()
        .then(setLocalSummary)
        .catch(() => setLocalSummary(null))
        .finally(() => setLoadingSummary(false));
    }
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      await exportBackup();
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setExporting(false);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("This will merge the backup data into your current database. Continue?")) return;

    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const result = await importBackup(file);
      setImportResult(result);
      toast.success(`Imported ${result.imported} records successfully`);
    } catch (err) {
      const msg = (err as Error).message;
      setImportError(msg);
      toast.error("Import failed — see details below");
    }
    setImporting(false);
    e.target.value = "";
  }

  async function handleMigrate() {
    if (
      !confirm(
        "This will copy all local IndexedDB data to your Supabase cloud database.\n\n" +
          "Existing records in Supabase with the same IDs will be overwritten.\n\nContinue?"
      )
    )
      return;

    setMigrating(true);
    setMigrationDone(false);
    setMigrationProgress(null);

    try {
      const { migrated } = await migrateLocalToSupabase((progress) => {
        setMigrationProgress({ ...progress });
      });
      setMigratedCount(migrated);
      setMigrationDone(true);
      toast.success(`Successfully synced ${migrated} records to Supabase`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setMigrating(false);
    }
  }

  const progressPct = migrationProgress
    ? Math.round((migrationProgress.stepIndex / migrationProgress.totalSteps) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HardDrive className="w-6 h-6" /> Backups
        </h1>
        <p className="text-sm text-muted-foreground">Export, restore, and sync your database</p>
      </div>

      {/* Status banner */}
      {isSupabaseConfigured ? (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          <Cloud className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            <strong>Supabase connected.</strong> Data is saved to the cloud. Use the migration tool
            below to copy any existing local data up to Supabase.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            Data is stored locally in your browser. Export backups regularly to prevent loss.
          </p>
        </div>
      )}

      {/* How-to guide (collapsible) */}
      <Card>
        <button
          className="w-full text-left"
          onClick={() => setShowGuide((v) => !v)}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4" /> How to sync your backup with Supabase
              </span>
              {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CardTitle>
          </CardHeader>
        </button>
        {showGuide && (
          <CardContent className="pt-0 space-y-3 text-sm">
            <p className="text-muted-foreground">
              Follow these steps to move your local data to your Supabase cloud database:
            </p>
            <ol className="space-y-2.5 list-none">
              {[
                {
                  n: "1",
                  title: "Create a Supabase project",
                  body: "Go to supabase.com → New Project. Copy your Project URL and anon/public API key from Project Settings → API.",
                },
                {
                  n: "2",
                  title: "Run the SQL schema",
                  body: 'In Supabase → SQL Editor, paste and run the full schema from the file SUPABASE-VERCEL-GUIDE.md in your project repo. This creates all 9 tables with the correct columns and FK constraints.',
                },
                {
                  n: "3",
                  title: "Add environment variables",
                  body: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment (Vercel dashboard → Settings → Environment Variables, or in a local .env file). Restart the app.",
                },
                {
                  n: "4",
                  title: isSupabaseConfigured
                    ? "✓ Supabase is connected — use Migrate below"
                    : "Use the Migrate button (appears after step 3)",
                  body: isSupabaseConfigured
                    ? 'Click "Migrate Local Data to Supabase" below. It reads your browser\'s local storage and uploads everything to Supabase in the correct order.'
                    : "Once connected, a Migrate button appears here. Click it to copy all local data to Supabase in one step.",
                },
                {
                  n: "5",
                  title: "Import a backup file (optional)",
                  body: 'If you have a .json backup from a different device, use "Import Backup" below. All user-reference fields are automatically resolved — no manual steps needed.',
                },
              ].map(({ n, title, body }) => (
                <li key={n} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                    {n}
                  </span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        )}
      </Card>

      {/* Export / Import */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="w-4 h-4" /> Export Backup
            </CardTitle>
            <CardDescription>Download all your data as a JSON file.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExport} disabled={exporting} className="w-full">
              {exporting ? "Exporting…" : "Download Backup"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" /> Import Backup
            </CardTitle>
            <CardDescription>
              Restore from a previously exported JSON file. Merges into existing data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block w-full">
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              <Button
                asChild
                disabled={importing}
                variant="outline"
                className="w-full cursor-pointer"
              >
                <span>{importing ? "Importing…" : "Select Backup File"}</span>
              </Button>
            </label>

            {/* Import result */}
            {importResult && !importing && (
              <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-800">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{importResult.imported} records imported successfully.</span>
              </div>
            )}

            {/* Import error with explanation */}
            {importError && !importing && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 space-y-1">
                <p className="font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Import failed
                </p>
                <p className="text-xs font-mono break-all">{importError}</p>
                {importError.includes("fkey") || importError.includes("foreign key") ? (
                  <p className="text-xs mt-1 text-red-700">
                    This is a foreign key error. Make sure you ran the SQL schema in Supabase
                    first (step 2 in the guide above), then try importing again.
                  </p>
                ) : importError.includes("users") ? (
                  <p className="text-xs mt-1 text-red-700">
                    Users table error. Check that the SQL schema was applied correctly in
                    Supabase.
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Migrate to Supabase — only shown when Supabase is configured */}
      {isSupabaseConfigured && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cloud className="w-4 h-4" /> Migrate Local Data to Supabase
            </CardTitle>
            <CardDescription>
              One-click sync — copies everything from your browser's local storage to your
              connected Supabase database. Safe to run multiple times (uses upsert).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Local data summary */}
            {loadingSummary && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning local storage…
              </div>
            )}

            {localSummary && !loadingSummary && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Local records found
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {(
                    [
                      ["Users", localSummary.users],
                      ["Products", localSummary.products],
                      ["Product Units", localSummary.productUnits],
                      ["Warehouses", localSummary.warehouses],
                      ["WH Sections", localSummary.warehouseSections],
                      ["Batches", localSummary.inventoryBatches],
                      ["Transactions", localSummary.inventoryTransactions],
                      ["Audit Logs", localSummary.auditLogs],
                    ] as [string, number][]
                  ).map(([label, count]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-1 border-t text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{localSummary.total}</span>
                </div>
              </div>
            )}

            {/* Progress bar during migration */}
            {migrating && migrationProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Syncing{" "}
                    <span className="font-medium text-foreground">
                      {migrationProgress.step}
                    </span>
                    {migrationProgress.recordCount > 0 && (
                      <span className="text-muted-foreground">
                        ({migrationProgress.recordCount} records)
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{progressPct}%</span>
                </div>
                <Progress value={progressPct} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Step {migrationProgress.stepIndex} of {migrationProgress.totalSteps}
                </p>
              </div>
            )}

            {/* Success state */}
            {migrationDone && !migrating && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>
                  Migration complete —{" "}
                  <strong>{migratedCount}</strong> records synced to Supabase.
                </span>
              </div>
            )}

            <Button
              onClick={handleMigrate}
              disabled={migrating || localSummary?.total === 0}
              className="w-full"
              variant={migrationDone ? "outline" : "default"}
            >
              {migrating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Migrating…
                </>
              ) : migrationDone ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Run Again
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" /> Migrate Local Data to Supabase
                </>
              )}
            </Button>

            {localSummary?.total === 0 && !loadingSummary && (
              <p className="text-xs text-muted-foreground text-center">
                No local data found — nothing to migrate.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Storage info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Storage Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Storage type</span>
            <span>{isSupabaseConfigured ? "Supabase (Cloud)" : "IndexedDB (Browser)"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sync</span>
            <span>
              {isSupabaseConfigured
                ? "Cloud — accessible from any device"
                : "Offline only — no cloud sync"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Persistence</span>
            <span>
              {isSupabaseConfigured
                ? "Permanent (Supabase)"
                : "Survives reload, cleared on browser data wipe"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
