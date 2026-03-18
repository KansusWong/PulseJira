"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import { ChevronLeft, ChevronRight, X, Pencil } from "lucide-react";
import type { QuestionnaireData } from "@/lib/core/types";

interface QuestionnaireInlineProps {
  data: QuestionnaireData;
  onSubmit: (text: string) => void;
  onDismiss: () => void;
}

export function QuestionnaireInline({ data, onSubmit, onDismiss }: QuestionnaireInlineProps) {
  const { t } = useTranslation();
  const { questions } = data;

  const [currentPage, setCurrentPage] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = questions.length;
  const currentQ = questions[currentPage];

  // ── helpers ──

  const formatAndSubmit = useCallback(() => {
    const parts: string[] = [];
    for (const q of questions) {
      const answer = answers[q.id];
      if (!answer || (Array.isArray(answer) && answer.length === 0)) continue;
      if (questions.length === 1) {
        parts.push(Array.isArray(answer) ? answer.join(", ") : answer);
      } else {
        const val = Array.isArray(answer) ? answer.join(", ") : answer;
        parts.push(`${q.question}: ${val}`);
      }
    }
    if (parts.length > 0) {
      onSubmit(parts.join("\n"));
    } else {
      onDismiss();
    }
  }, [questions, answers, onSubmit, onDismiss]);

  const goNext = useCallback(() => {
    if (currentPage < total - 1) {
      setCurrentPage((p) => p + 1);
    } else {
      formatAndSubmit();
    }
  }, [currentPage, total, formatAndSubmit]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) setCurrentPage((p) => p - 1);
  }, [currentPage]);

  // ── single choice: click → record → auto-advance ──
  const handleSingleSelect = useCallback(
    (option: string) => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      setAnswers((prev) => ({ ...prev, [currentQ.id]: option }));
      // clear any custom text when picking a regular option
      setCustomTexts((prev) => ({ ...prev, [currentQ.id]: "" }));
      setShowCustomInput((prev) => ({ ...prev, [currentQ.id]: false }));
      autoAdvanceTimer.current = setTimeout(() => {
        goNext();
      }, 300);
    },
    [currentQ, goNext],
  );

  // ── multiple choice: toggle ──
  const handleMultiToggle = useCallback(
    (option: string) => {
      setAnswers((prev) => {
        const current = (prev[currentQ.id] as string[]) || [];
        const next = current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option];
        return { ...prev, [currentQ.id]: next };
      });
    },
    [currentQ],
  );

  // ── text input ──
  const handleTextChange = useCallback(
    (value: string) => {
      setAnswers((prev) => ({ ...prev, [currentQ.id]: value }));
    },
    [currentQ],
  );

  // ── "Something else" ──
  const handleCustomTextChange = useCallback(
    (value: string) => {
      setCustomTexts((prev) => ({ ...prev, [currentQ.id]: value }));
    },
    [currentQ],
  );

  const handleCustomSubmit = useCallback(() => {
    const text = (customTexts[currentQ.id] || "").trim();
    if (!text) return;
    if (currentQ.type === "multiple_choice") {
      // add custom text to multi-select answers
      setAnswers((prev) => {
        const current = (prev[currentQ.id] as string[]) || [];
        if (!current.includes(text)) {
          return { ...prev, [currentQ.id]: [...current, text] };
        }
        return prev;
      });
      setCustomTexts((prev) => ({ ...prev, [currentQ.id]: "" }));
      setShowCustomInput((prev) => ({ ...prev, [currentQ.id]: false }));
    } else {
      // single choice: set as answer and advance
      setAnswers((prev) => ({ ...prev, [currentQ.id]: text }));
      setCustomTexts((prev) => ({ ...prev, [currentQ.id]: "" }));
      setShowCustomInput((prev) => ({ ...prev, [currentQ.id]: false }));
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(() => {
        goNext();
      }, 300);
    }
  }, [currentQ, customTexts, goNext]);

  // ── skip current question ──
  const handleSkip = useCallback(() => {
    goNext();
  }, [goNext]);

  // ── derived state ──
  const isChoiceQ = currentQ.type === "single_choice" || currentQ.type === "multiple_choice";
  const isMulti = currentQ.type === "multiple_choice";
  const isText = currentQ.type === "text";
  const customInputVisible = showCustomInput[currentQ.id] ?? false;

  const currentAnswer = answers[currentQ.id];
  const hasAnswer =
    currentAnswer !== undefined &&
    currentAnswer !== "" &&
    (!Array.isArray(currentAnswer) || currentAnswer.length > 0);

  const showContinue = (isMulti && hasAnswer) || isText || (customInputVisible && isMulti);

  return (
    <div className="mr-auto max-w-lg w-full">
      <div className="rounded-2xl bg-[var(--bg-glass)] border border-[var(--border-subtle)] overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <p className="text-sm text-[var(--text-primary)] font-medium flex-1 mr-3">{currentQ.question}</p>
          <div className="flex items-center gap-1 shrink-0">
            {total > 1 && (
              <>
                <button
                  onClick={goPrev}
                  disabled={currentPage === 0}
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-[var(--text-muted)] tabular-nums min-w-[3.5rem] text-center">
                  {t("questionnaire.of", { current: String(currentPage + 1), total: String(total) })}
                </span>
                <button
                  onClick={goNext}
                  disabled={currentPage === total - 1}
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onDismiss}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── multi-select hint ── */}
        {isMulti && (
          <div className="px-4 pb-1">
            <span className="text-xs text-[var(--text-muted)]">({t("questionnaire.multiSelect")})</span>
          </div>
        )}

        {/* ── Body ── */}
        <div className="px-4 pb-3 space-y-2">
          {/* Choice options */}
          {isChoiceQ &&
            currentQ.options?.map((option, index) => {
              const selected = isMulti
                ? ((currentAnswer as string[]) || []).includes(option)
                : currentAnswer === option;

              return (
                <button
                  key={option}
                  onClick={() => (isMulti ? handleMultiToggle(option) : handleSingleSelect(option))}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left cursor-pointer ${
                    selected
                      ? "border-blue-500/60 bg-blue-500/10"
                      : "border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-accent)]"
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-medium shrink-0 ${
                      selected
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className={`text-sm ${selected ? "text-blue-200" : "text-[var(--text-primary)]"}`}>
                    {option}
                  </span>
                </button>
              );
            })}

          {/* "Something else" row for choice questions */}
          {isChoiceQ && (
            <div
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                customInputVisible
                  ? "border-[var(--border-accent)] bg-[var(--bg-elevated)]"
                  : "border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-accent)]"
              }`}
            >
              <Pencil className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              {customInputVisible ? (
                <input
                  autoFocus
                  type="text"
                  placeholder={t("questionnaire.somethingElse")}
                  value={customTexts[currentQ.id] || ""}
                  onChange={(e) => handleCustomTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCustomSubmit();
                    }
                  }}
                  className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => setShowCustomInput((prev) => ({ ...prev, [currentQ.id]: true }))}
                  className="flex-1 text-sm text-[var(--text-muted)] text-left cursor-pointer"
                >
                  {t("questionnaire.somethingElse")}
                </button>
              )}
              {customInputVisible && (customTexts[currentQ.id] || "").trim() && (
                <button
                  onClick={handleCustomSubmit}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer shrink-0"
                >
                  {t("questionnaire.continue")}
                </button>
              )}
            </div>
          )}

          {/* Text input question */}
          {isText && (
            <input
              type="text"
              placeholder={currentQ.placeholder || ""}
              value={(currentAnswer as string) || ""}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hasAnswer) {
                  e.preventDefault();
                  goNext();
                }
              }}
              className="w-full px-4 py-3 text-sm rounded-xl border border-[var(--border-subtle)] bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)] transition-colors"
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 px-4 pb-3">
          {showContinue && (
            <button
              onClick={goNext}
              disabled={!hasAnswer}
              className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {t("questionnaire.continue")}
            </button>
          )}
          <button
            onClick={handleSkip}
            className="px-3 py-1.5 text-sm rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            {t("questionnaire.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
