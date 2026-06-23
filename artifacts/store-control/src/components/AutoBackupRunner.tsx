import { useEffect } from "react";
import { exportBackup, migrateLocalToSupabase } from "@/lib/backup";
import { isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

const INTERVALS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function isDue(key: string, interval: string): boolean {
  const ms = INTERVALS[interval];
  if (!ms) return false;
  const last = localStorage.getItem(key);
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= ms;
}

export default function AutoBackupRunner() {
  useEffect(() => {
    async function check() {
      const offlineInterval = localStorage.getItem("autoOfflineBackup") ?? "off";
      const supabaseInterval = localStorage.getItem("autoSupabaseBackup") ?? "off";

      if (offlineInterval !== "off" && isDue("lastOfflineBackup", offlineInterval)) {
        try {
          await exportBackup();
          localStorage.setItem("lastOfflineBackup", new Date().toISOString());
          toast.success("Auto offline backup downloaded");
        } catch {
          // silent — don't interrupt the user's session for a background task
        }
      }

      if (
        isSupabaseConfigured &&
        supabaseInterval !== "off" &&
        isDue("lastSupabaseBackup", supabaseInterval)
      ) {
        try {
          await migrateLocalToSupabase(() => {});
          localStorage.setItem("lastSupabaseBackup", new Date().toISOString());
          toast.success("Auto Supabase sync complete");
        } catch {
          // silent
        }
      }
    }

    // Check shortly after app loads (give app time to boot)
    const boot = setTimeout(check, 5000);

    // Re-check every hour while the app is open
    const interval = setInterval(check, 60 * 60 * 1000);

    return () => {
      clearTimeout(boot);
      clearInterval(interval);
    };
  }, []);

  return null;
}
