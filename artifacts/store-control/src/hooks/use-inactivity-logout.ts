import { useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "autoLogoutMinutes";

export function getAutoLogoutMinutes(): number {
  const v = localStorage.getItem(STORAGE_KEY);
  if (!v || v === "off") return 0;
  return parseInt(v, 10) || 0;
}

export function setAutoLogoutMinutes(minutes: number | "off"): void {
  localStorage.setItem(STORAGE_KEY, minutes === "off" ? "off" : String(minutes));
}

export function useInactivityLogout(signOut: () => void): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minutesRef = useRef(getAutoLogoutMinutes());

  const reset = useCallback(() => {
    minutesRef.current = getAutoLogoutMinutes();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (minutesRef.current <= 0) return;
    timerRef.current = setTimeout(() => {
      signOut();
    }, minutesRef.current * 60 * 1000);
  }, [signOut]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [reset]);
}
