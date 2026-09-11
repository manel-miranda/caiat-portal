import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Copy, ExternalLink, Maximize2, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { generateGuestToken, guestTokenQuery, guestUrl, revokeGuestToken } from "@/lib/guest";

/**
 * Staff-facing guest access panel. Any signed-in staff member can see and show
 * an existing QR at check-in, but creating, regenerating and revoking a link
 * requires the `guest_access_manage` permission — the token is a bearer
 * credential for the whole stay.
 */
export function GuestAccessCard({ stayId }: { stayId: string }) {
  const { can } = useAuth();
  const canManage = can("guest_access_manage");
  const queryClient = useQueryClient();
  const tokenQ = useQuery(guestTokenQuery(stayId));
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const token = tokenQ.data ?? null;
  const url = token ? guestUrl(token) : "";

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["guest-token", stayId] });
      toast.success(message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmRegen(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(url);
    }
  }

  return (
    <section className="surface-card mt-4 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <QrCode className="size-4" /> {t("guestAccess")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("guestAccessDesc")}</p>

      {tokenQ.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("loading")}</p>
      ) : !token ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">{t("noGuestAccessYet")}</p>
          {canManage ? (
            <Button
              className="tap-target w-full rounded-xl"
              disabled={busy}
              onClick={() => void run(() => generateGuestToken(stayId), t("accessGenerated"))}
            >
              {t("generateGuestAccess")}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t("guestAccessAdminOnly")}</p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="mx-auto block rounded-2xl bg-white p-3"
            aria-label={t("showQr")}
          >
            <QRCode value={url} size={148} />
          </button>
          <p className="text-center text-xs text-muted-foreground">{t("scanQrHint")}</p>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="tap-target rounded-xl"
              onClick={() => setFullscreen(true)}
            >
              <Maximize2 className="me-2 size-4" /> {t("showQr")}
            </Button>
            <Button variant="outline" className="tap-target rounded-xl" onClick={() => void copy()}>
              <Copy className="me-2 size-4" /> {t("copyLink")}
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="tap-target col-span-2 flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold"
            >
              <ExternalLink className="size-4" /> {t("openGuestPortal")}
            </a>
          </div>

          {canManage ? (
            confirmRegen ? (
              <div className="space-y-2 rounded-xl border border-destructive/40 p-3">
                <p className="text-sm font-medium">{t("regenerateWarning")}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="tap-target flex-1 rounded-xl"
                    onClick={() => setConfirmRegen(false)}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    className="tap-target flex-1 rounded-xl"
                    disabled={busy}
                    onClick={() => void run(() => generateGuestToken(stayId), t("accessGenerated"))}
                  >
                    {t("confirm")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="tap-target rounded-xl"
                  onClick={() => setConfirmRegen(true)}
                >
                  <RefreshCw className="me-2 size-4" /> {t("regenerateLink")}
                </Button>
                <Button
                  variant="destructive"
                  className="tap-target rounded-xl"
                  disabled={busy}
                  onClick={() => void run(() => revokeGuestToken(stayId), t("accessRevoked"))}
                >
                  <Trash2 className="me-2 size-4" /> {t("revokeAccess")}
                </Button>
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">{t("guestAccessAdminOnly")}</p>
          )}
        </div>
      )}

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("guestPortalTitle")}</DialogTitle>
          </DialogHeader>
          {token ? (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl bg-white p-4">
                <QRCode value={url} size={240} />
              </div>
              <p className="text-center text-xs text-muted-foreground">{t("scanQrHint")}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
