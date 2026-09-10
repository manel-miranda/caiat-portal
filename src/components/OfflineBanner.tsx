import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Lightweight connectivity awareness. Mutations are blocked while offline so
 * nothing is silently lost; a real offline queue can replace this later by
 * buffering the same mutation payloads.
 */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="sticky top-[61px] z-20 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground">
      <WifiOff className="size-4" />
      {t("offline")}
    </div>
  );
}
