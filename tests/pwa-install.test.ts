import { describe, expect, test } from "bun:test";

/**
 * Focused checks for the one-shot install prompt lifecycle. The module reads
 * `window` at import time, so a minimal DOM-ish global is installed first.
 */
type Handler = (event: unknown) => void;
const handlers = new Map<string, Set<Handler>>();

function fireWindowEvent(type: string, event: Record<string, unknown>) {
  for (const h of handlers.get(type) ?? []) h({ preventDefault() {}, type, ...event });
}

let standaloneMatches = false;

(globalThis as Record<string, unknown>)["window"] = {
  addEventListener: (type: string, fn: Handler) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(fn);
  },
  removeEventListener: (type: string, fn: Handler) => handlers.get(type)?.delete(fn),
  matchMedia: () => ({
    matches: standaloneMatches,
    addEventListener() {},
    removeEventListener() {},
  }),
  navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120" },
};
(globalThis as Record<string, unknown>)["navigator"] = {
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120",
};

const mod = await import("../src/lib/pwa-install");

function makePromptEvent(outcome: "accepted" | "dismissed", fail = false) {
  let promptCalls = 0;
  return {
    get calls() {
      return promptCalls;
    },
    event: {
      prompt: async () => {
        promptCalls += 1;
        if (fail) throw new Error("prompt failed");
      },
      userChoice: Promise.resolve({ outcome }),
    },
  };
}

function reset() {
  standaloneMatches = false;
  mod.resetInstallStateForTests();
}

describe("install prompt lifecycle", () => {
  test("no captured event means nothing to prompt", async () => {
    reset();
    expect(mod.getInstallSnapshot().hasPrompt).toBe(false);
    expect(await mod.promptInstall()).toBe("unavailable");
  });

  test("accepted marks installed and clears the one-shot event", async () => {
    reset();
    const p = makePromptEvent("accepted");
    fireWindowEvent("beforeinstallprompt", p.event);
    expect(mod.getInstallSnapshot().hasPrompt).toBe(true);

    expect(await mod.promptInstall()).toBe("accepted");
    expect(mod.getInstallSnapshot().hasPrompt).toBe(false);
    expect(mod.getInstallSnapshot().installed).toBe(true);
    // A second click cannot reuse the consumed event.
    expect(await mod.promptInstall()).toBe("unavailable");
    expect(p.calls).toBe(1);
  });

  test("dismissed clears the event and does not mark installed", async () => {
    reset();
    const p = makePromptEvent("dismissed");
    fireWindowEvent("beforeinstallprompt", p.event);
    expect(await mod.promptInstall()).toBe("dismissed");
    expect(mod.getInstallSnapshot().hasPrompt).toBe(false);
    expect(mod.getInstallSnapshot().installed).toBe(false);
    expect(await mod.promptInstall()).toBe("unavailable");
  });

  test("a failing prompt reports an error and still clears the event", async () => {
    reset();
    const p = makePromptEvent("accepted", true);
    fireWindowEvent("beforeinstallprompt", p.event);
    expect(await mod.promptInstall()).toBe("error");
    expect(mod.getInstallSnapshot().hasPrompt).toBe(false);
    expect(mod.getInstallSnapshot().installed).toBe(false);
    expect(mod.getInstallSnapshot().prompting).toBe(false);
  });

  test("concurrent clicks only prompt once", async () => {
    reset();
    const p = makePromptEvent("dismissed");
    fireWindowEvent("beforeinstallprompt", p.event);
    const [a, b] = await Promise.all([mod.promptInstall(), mod.promptInstall()]);
    expect([a, b].filter((o) => o === "dismissed").length).toBe(1);
    expect([a, b].filter((o) => o === "unavailable").length).toBe(1);
    expect(p.calls).toBe(1);
  });

  test("appinstalled hides later buttons for the rest of the session", () => {
    reset();
    fireWindowEvent("beforeinstallprompt", makePromptEvent("accepted").event);
    fireWindowEvent("appinstalled", {});
    expect(mod.getInstallSnapshot().installed).toBe(true);
    expect(mod.getInstallSnapshot().hasPrompt).toBe(false);
  });

  test("standalone display mode is detected", () => {
    reset();
    expect(mod.isStandalone()).toBe(false);
    standaloneMatches = true;
    expect(mod.isStandalone()).toBe(true);
  });
});
