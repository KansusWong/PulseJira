"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export default function ProjectDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  const [retryCount, setRetryCount] = useState(0);

  const isChunkError =
    error.message?.includes("Cannot find module") ||
    error.message?.includes("MODULE_NOT_FOUND") ||
    error.message?.includes("ChunkLoadError") ||
    error.message?.includes("Loading chunk");

  useEffect(() => {
    if (isChunkError && retryCount < MAX_RETRIES) {
      const timer = setTimeout(() => {
        setRetryCount((c) => c + 1);
        reset();
      }, RETRY_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isChunkError, retryCount, reset]);

  if (isChunkError && retryCount < MAX_RETRIES) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        <p className="text-sm text-zinc-500">
          {t('error.waitingCompile', { current: String(retryCount + 1), max: String(MAX_RETRIES) })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <p className="text-sm text-zinc-400">{t('error.pageLoadFailed')}</p>
      <button
        onClick={() => {
          setRetryCount(0);
          reset();
        }}
        className="px-4 py-2 text-sm rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
      >
        {t('common.retry')}
      </button>
    </div>
  );
}
