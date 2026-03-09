"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface RefreshOverlayProps {
  visible: boolean;
  onComplete: () => void;
}

export function RefreshOverlay({ visible, onComplete }: RefreshOverlayProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"loading" | "done">("loading");

  useEffect(() => {
    if (!visible) {
      setProgress(0);
      setPhase("loading");
      return;
    }

    // Simulate progress: ramp up over ~2.4s
    let frame: number;
    const start = Date.now();
    const duration = 2400;

    function tick() {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / duration, 1);
      // Ease-out curve
      setProgress(1 - Math.pow(1 - pct, 3));

      if (pct < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setPhase("done");
        // Hold "done" state briefly then dismiss
        setTimeout(onComplete, 800);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="flex flex-col items-center gap-6 w-80"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            {/* Icon */}
            <div className="relative">
              <AnimatePresence mode="wait">
                {phase === "loading" ? (
                  <motion.div
                    key="loader"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="check"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 20,
                    }}
                  >
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Text */}
            <p className="text-sm text-zinc-300 font-medium">
              {phase === "loading"
                ? t('refresh.loading')
                : t('refresh.done')}
            </p>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>

            {/* Percentage */}
            <p className="text-[11px] text-zinc-500 font-mono tabular-nums">
              {Math.round(progress * 100)}%
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
