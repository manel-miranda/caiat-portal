import { useState } from "react";
import { Download, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useInstallApp } from "@/lib/pwa-install";
import { t } from "@/lib/i18n";

/**
 * Unobtrusive install affordance. Renders nothing unless the browser offers a
 * real install prompt, or the device is iOS where install is manual.
 */
export function InstallAppButton({
  variant = "outline",
  className,
  onDone,
}: {
  variant?: "outline" | "ghost";
  className?: string;
  onDone?: () => void;
}) {
  const { canShow, hasPrompt, ios, busy, promptInstall } = useInstallApp();
  const [hint, setHint] = useState(false);

  if (!canShow) return null;

  async function handleClick() {
    if (!hasPrompt) {
      setHint(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      toast.success(t("installAccepted"));
      onDone?.();
    } else if (outcome === "dismissed") {
      toast(t("installDismissed"));
    } else {
      setHint(true);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        onClick={handleClick}
        disabled={busy}
        className="min-h-11 w-full rounded-xl text-sm"
      >
        {hasPrompt ? <Download className="size-4" /> : <Share className="size-4" />}
        {t("installApp")}
      </Button>
      {hint ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t(ios ? "installManualHintIos" : "installManualHintAndroid")}
        </p>
      ) : null}
    </div>
  );
}
