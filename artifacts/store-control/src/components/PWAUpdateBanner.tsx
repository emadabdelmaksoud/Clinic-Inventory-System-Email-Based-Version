import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PWAUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => registration.update(), 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-white shadow-xl text-sm max-w-sm w-[calc(100%-2rem)]">
      <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" />
      <span className="flex-1 font-medium">New version available</span>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 text-xs flex-shrink-0 font-semibold"
        onClick={() => updateServiceWorker(true)}
      >
        Update Now
      </Button>
      <button
        aria-label="Dismiss"
        onClick={() => setNeedRefresh(false)}
        className="opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
