import { useCallback, useEffect, useState } from "react";

/**
 * Installability helper for the online-only PWA. No service worker is
 * involved: this only surfaces the browser's own install prompt and, where
 * the browser has no prompt API (iOS Safari), lets the UI show instructions.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Captured as early as the module is evaluated in the browser, because Chrome
// fires `beforeinstallprompt` before React has mounted.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true || navStandalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export type InstallState = {
  /** Whether an install affordance should be rendered at all. */
  canShow: boolean;
  /** True when the browser gave us a real prompt we can trigger. */
  hasPrompt: boolean;
  /** True when we can only show manual instructions (iOS Safari). */
  manualOnly: boolean;
  ios: boolean;
  busy: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable" | "error">;
};

export function useInstallApp(): InstallState {
  const [hasPrompt, setHasPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const sync = () => {
      setHasPrompt(deferredPrompt !== null);
      setInstalled(isStandalone());
    };
    sync();
    listeners.add(sync);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferredPrompt;
    if (!event) return "unavailable" as const;
    setBusy(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") {
        deferredPrompt = null;
        notify();
      }
      return outcome;
    } catch {
      return "error" as const;
    } finally {
      setBusy(false);
    }
  }, []);

  const ios = hydrated && isIos();
  const manualOnly = hydrated && !hasPrompt && ios;

  return {
    canShow: hydrated && !installed && (hasPrompt || manualOnly),
    hasPrompt,
    manualOnly,
    ios,
    busy,
    promptInstall,
  };
}
