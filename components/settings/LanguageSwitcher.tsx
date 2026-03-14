"use client";

import { useCallback } from "react";
import { usePulseStore } from "@/store/usePulseStore.new";
import { useTranslation } from "@/lib/i18n";
import clsx from "clsx";

export function LanguageSwitcher() {
  const locale = usePulseStore((s) => s.locale);
  const setLocale = usePulseStore((s) => s.setLocale);
  const { t } = useTranslation();

  const handleSetLocale = useCallback(
    (newLocale: "zh" | "en") => {
      setLocale(newLocale);
      // Sync to server so cron jobs and agents can read it
      fetch("/api/settings/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_locale: newLocale }),
      }).catch(() => {});
    },
    [setLocale],
  );

  return (
    <div className="px-3 py-2">
      <div className="text-[10px] text-zinc-600 mb-1.5">{t('language.label')}</div>
      <div className="flex rounded-lg overflow-hidden border border-zinc-700">
        <button
          onClick={() => handleSetLocale("zh")}
          className={clsx(
            "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
            locale === "zh"
              ? "bg-zinc-700 text-zinc-100"
              : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
          )}
        >
          简体中文
        </button>
        <button
          onClick={() => handleSetLocale("en")}
          className={clsx(
            "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
            locale === "en"
              ? "bg-zinc-700 text-zinc-100"
              : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
          )}
        >
          English
        </button>
      </div>
    </div>
  );
}
