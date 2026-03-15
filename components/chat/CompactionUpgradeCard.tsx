"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import { QuestionnaireInline } from "./QuestionnaireInline";
import type { QuestionnaireData } from "@/lib/core/types";

interface CompactionUpgradeCardProps {
  upgradeId: string;
  tokenUsage: { estimated: number; max: number; ratio: number };
  timeoutAt: number;
  conversationId: string;
  onResolved: (approved: boolean) => void;
}

export function CompactionUpgradeCard({
  upgradeId,
  tokenUsage,
  timeoutAt,
  conversationId,
  onResolved,
}: CompactionUpgradeCardProps) {
  const { t } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState(
    Math.max(0, Math.ceil((timeoutAt - Date.now()) / 1000)),
  );
  const resolvedRef = useRef(false);

  const handleResolve = useCallback(
    async (approved: boolean) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;

      try {
        await fetch(`/api/conversations/${conversationId}/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: approved ? "approve_upgrade" : "reject_upgrade",
            upgrade_id: upgradeId,
          }),
        });
      } catch (err) {
        console.error("[CompactionUpgradeCard] Failed to resolve:", err);
      }

      onResolved(approved);
    },
    [conversationId, upgradeId, onResolved],
  );

  // Countdown timer — auto-reject on expiry
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timeoutAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !resolvedRef.current) {
        resolvedRef.current = true;
        handleResolve(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [timeoutAt, handleResolve]);

  // Build QuestionnaireData for reuse
  const approveLabel = t("compactionUpgrade.approve");
  const rejectLabel = t("compactionUpgrade.reject");
  const ratioPercent = Math.round(tokenUsage.ratio * 100);

  const questionnaireData: QuestionnaireData = {
    questions: [
      {
        id: "upgrade_decision",
        type: "single_choice",
        question: t("compactionUpgrade.question", { ratio: String(ratioPercent) }),
        options: [approveLabel, rejectLabel],
      },
    ],
    context: null,
  };

  return (
    <div className="relative">
      {/* Countdown progress bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-zinc-800 rounded-t-2xl overflow-hidden z-10">
        <div
          className="h-full bg-amber-500/60 transition-all duration-1000 ease-linear"
          style={{ width: `${(secondsLeft / 30) * 100}%` }}
        />
      </div>

      <QuestionnaireInline
        data={questionnaireData}
        onSubmit={(text) => {
          const isApprove = text === approveLabel;
          handleResolve(isApprove);
        }}
        onDismiss={() => handleResolve(false)}
      />

      {/* Countdown label */}
      <div className="text-center pb-2 -mt-1">
        <span className="text-[11px] text-zinc-600">
          {t("compactionUpgrade.countdown", { seconds: String(secondsLeft) })}
        </span>
      </div>
    </div>
  );
}
