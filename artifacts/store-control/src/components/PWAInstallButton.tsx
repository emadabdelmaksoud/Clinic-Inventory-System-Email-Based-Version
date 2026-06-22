import { useState } from "react";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { Button } from "@/components/ui/button";
import { Smartphone, CheckCircle2, X } from "lucide-react";

export default function PWAInstallButton() {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const [showTip, setShowTip] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("pwaDismissed") === "1"
  );

  if (isInstalled || dismissed) return null;

  function dismiss() {
    localStorage.setItem("pwaDismissed", "1");
    setDismissed(true);
  }

  if (canInstall) {
    return (
      <div className="mx-2 mb-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <p className="font-medium text-sidebar-foreground flex items-center gap-1">
            <Smartphone className="w-3 h-3" /> Install App
          </p>
          <button onClick={dismiss} className="text-sidebar-foreground/40 hover:text-sidebar-foreground/70">
            <X className="w-3 h-3" />
          </button>
        </div>
        <p className="text-sidebar-foreground/60 mb-2">Add to home screen for offline access.</p>
        <Button size="sm" className="w-full h-7 text-xs" onClick={promptInstall}>
          Install
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 relative">
      <button
        onClick={() => setShowTip(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
      >
        <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Install App</span>
      </button>

      {showTip && (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-lg p-3 shadow-lg text-xs space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <p className="font-semibold">Install as App</p>
            <button onClick={() => setShowTip(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-muted-foreground">To install, open the deployed app in:</p>
          <ul className="space-y-1 text-muted-foreground">
            <li><span className="font-medium text-foreground">Chrome/Edge:</span> click ⊕ in the address bar</li>
            <li><span className="font-medium text-foreground">iPhone/iPad:</span> Share → "Add to Home Screen"</li>
            <li><span className="font-medium text-foreground">Android:</span> menu → "Add to Home Screen"</li>
          </ul>
          <p className="text-muted-foreground/70 pt-1">Works after deploying to Vercel (HTTPS required).</p>
          <button
            onClick={dismiss}
            className="text-muted-foreground/60 hover:text-muted-foreground underline mt-1"
          >
            Don't show again
          </button>
        </div>
      )}
    </div>
  );
}
