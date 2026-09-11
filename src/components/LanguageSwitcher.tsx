import { Languages } from "lucide-react";
import { LANGUAGES, useLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Compact native-label language picker. Labels stay in their own language so
 * the control is understandable before anything else is translated.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useLang();

  return (
    <label
      className={cn(
        "relative flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      <Languages className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{LANGUAGES.find((l) => l.code === lang)?.label}</span>
      <select
        aria-label="Language / Idioma / Langue / اللغة"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="cursor-pointer appearance-none bg-transparent pe-1 text-sm font-medium text-foreground outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
