import { useState } from "react";
import { Download, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useInstallApp } from "@/lib/pwa-install";
import { t } from "@/lib/i18n";

/**
 * Unobtrusive install affordance. Hidden once the app is installed or already
 * running standalone; otherwise it either triggers the browser prompt or shows
 * manual instructions for the current platform.
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

  // Called directly from the click handler so the browser still treats the
  // prompt as user-initiated.
  async function handleClick() {
    if (!hasPrompt) {
      setHint(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      toast.success(t("installAccepted"));
      onDone?.();
      return;
    }
    if (outcome === "dismissed") toast(t("installDismissed"));
    // Keep guidance on screen: the one-shot prompt is now gone.
    setHint(true);
  }

  const Icon = ios && !hasPrompt ? Share : Download;

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        onClick={handleClick}
        disabled={busy}
        className="min-h-11 w-full rounded-xl text-sm"
      >
        <Icon className="size-4" />
        {t("installApp")}
      </Button>
      {hint ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground" role="status">
          {t(ios ? "installManualHintIos" : "installManualHintAndroid")}
        </p>
      ) : null}
    </div>
  );
}
