import { useCallback, useEffect, useState } from "react";

/**
 * Installability helper for the online-only PWA. No service worker is
 * involved: this only surfaces the browser's own install prompt and, where the
 * browser has no prompt API, lets the UI show manual instructions.
 *
 * The captured `beforeinstallprompt` event is one-shot: it is cleared on every
 * outcome so a second click can never reuse a consumed event.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PromptOutcome = "accepted" | "dismissed" | "unavailable" | "error";

export type InstallSnapshot = {
  hasPrompt: boolean;
  installed: boolean;
  prompting: boolean;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let prompting = false;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function clearPrompt() {
  deferredPrompt = null;
}

export function getInstallSnapshot(): InstallSnapshot {
  return { hasPrompt: deferredPrompt !== null, installed, prompting };
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true || navStandalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notify();
}

function onAppInstalled() {
  clearPrompt();
  // Module-level so any button mounted later this session stays hidden.
  installed = true;
  notify();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
  // Vite HMR: drop the module-level listeners before the new module registers.
  import.meta.hot?.dispose(() => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onAppInstalled);
    listeners.clear();
  });
}

/** Triggers the browser prompt. Must be called directly from a user click. */
export async function promptInstall(): Promise<PromptOutcome> {
  const event = deferredPrompt;
  if (!event || prompting) return "unavailable";
  prompting = true;
  notify();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") installed = true;
    return outcome;
  } catch {
    return "error";
  } finally {
    // One-shot in every case: accepted, dismissed or failed.
    clearPrompt();
    prompting = false;
    notify();
  }
}

/** Test-only reset of the module-level state. */
export function resetInstallStateForTests() {
  deferredPrompt = null;
  installed = false;
  prompting = false;
  notify();
}

export type InstallState = {
  /** Whether an install affordance should be rendered at all. */
  canShow: boolean;
  /** True when the browser gave us a real prompt we can trigger. */
  hasPrompt: boolean;
  ios: boolean;
  busy: boolean;
  promptInstall: () => Promise<PromptOutcome>;
};

export function useInstallApp(): InstallState {
  const [snapshot, setSnapshot] = useState<InstallSnapshot>(() => ({
    hasPrompt: false,
    installed: false,
    prompting: false,
  }));
  const [hydrated, setHydrated] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const sync = () => setSnapshot(getInstallSnapshot());
    sync();
    listeners.add(sync);

    setStandalone(isStandalone());
    const media = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayChange = (e: MediaQueryListEvent) => setStandalone(e.matches);
    media?.addEventListener?.("change", onDisplayChange);

    return () => {
      listeners.delete(sync);
      media?.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const run = useCallback(() => promptInstall(), []);

  return {
    canShow: hydrated && !standalone && !snapshot.installed,
    hasPrompt: snapshot.hasPrompt,
    ios: hydrated && isIos(),
    busy: snapshot.prompting,
    promptInstall: run,
  };
}
