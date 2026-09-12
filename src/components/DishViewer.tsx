/**
 * Guest-portal 3D / AR dish preview (prototype).
 *
 * The <model-viewer> web component is registered only in the browser so SSR
 * and hydration stay clean. AR is launched exclusively from an explicit tap,
 * so no camera permission is requested on page load. No guest data ever
 * reaches the viewer, and the model is served from our own origin.
 */
import { useEffect, useRef, useState } from "react";
import { Box, Move3d } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { ModelViewerElement } from "@/types/model-viewer";

const MODEL_SRC = "/models/caiat-tajine.gltf";

export function DishViewer() {
  const [ready, setReady] = useState(false);
  const [arFailed, setArFailed] = useState(false);
  const viewerRef = useRef<ModelViewerElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@google/model-viewer").then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function launchAr() {
    const el = viewerRef.current;
    if (!el || !el.canActivateAR) {
      setArFailed(true);
      return;
    }
    try {
      await el.activateAR();
    } catch {
      setArFailed(true);
    }
  }

  return (
    <section id="caiat-3d-demo" className="surface-card mt-4 p-3 sm:p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("menuSection")}
      </h2>

      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold">{t("dishTajine")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("dishDemoNote")}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase">
          {t("demoBadge")}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/40">
        {ready ? (
          <model-viewer
            ref={viewerRef}
            src={MODEL_SRC}
            alt={t("dishTajine")}
            ar
            ar-modes="webxr scene-viewer quick-look"
            ar-scale="fixed"
            ar-placement="floor"
            camera-controls
            auto-rotate
            auto-rotate-delay={800}
            shadow-intensity={1}
            shadow-softness={0.8}
            touch-action="pan-y"
            exposure={0.75}
            camera-orbit="25deg 60deg 0.75m"
            style={{ width: "100%", height: "260px", backgroundColor: "transparent" }}
          />
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Move3d className="size-3.5 shrink-0" /> {t("dragToRotate")}
      </p>

      <Button
        variant="outline"
        className="tap-target mt-3 w-full rounded-xl"
        onClick={() => void launchAr()}
      >
        <Box className="me-2 size-4" /> {t("viewOnTable")}
      </Button>

      {arFailed ? <p className="mt-2 text-xs text-muted-foreground">{t("arUnavailable")}</p> : null}
    </section>
  );
}
