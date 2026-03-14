"use client";

import { useState, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import type { QuestionnaireData } from "@/lib/core/types";

interface QuestionnaireInlineProps {
  data: QuestionnaireData;
  onSubmit: (text: string) => void;
  onDismiss: () => void;
}

export function QuestionnaireInline({ data, onSubmit, onDismiss }: QuestionnaireInlineProps) {
  const { t } = useTranslation();
  const { questions } = data;

  // Fast path: single single_choice question → click-to-submit
  const isSingleQuickSelect =
    questions.length === 1 &&
    questions[0].type === "single_choice" &&
    questions[0].options &&
    questions[0].options.length > 0;

  // State for multi-question / complex forms
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const handleQuickSelect = useCallback(
    (option: string) => {
      onSubmit(option);
    },
    [onSubmit],
  );

  const handleToggleOption = useCallback(
    (questionId: string, option: string, isMulti: boolean) => {
      setAnswers((prev) => {
        if (isMulti) {
          const current = (prev[questionId] as string[]) || [];
          const next = current.includes(option)
            ? current.filter((o) => o !== option)
            : [...current, option];
          return { ...prev, [questionId]: next };
        }
        return { ...prev, [questionId]: option };
      });
    },
    [],
  );

  const handleTextChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
    [],
  );

  const handleFormSubmit = useCallback(() => {
    const parts: string[] = [];
    for (const q of questions) {
      const answer = answers[q.id];
      if (!answer || (Array.isArray(answer) && answer.length === 0)) {
        if (q.required) return; // block submit
        continue;
      }
      if (questions.length === 1) {
        // Single question → just send the answer
        parts.push(Array.isArray(answer) ? answer.join(", ") : answer);
      } else {
        // Multiple questions → label each
        const val = Array.isArray(answer) ? answer.join(", ") : answer;
        parts.push(`${q.question}: ${val}`);
      }
    }
    if (parts.length > 0) {
      onSubmit(parts.join("\n"));
    }
  }, [questions, answers, onSubmit]);

  const canSubmit = questions.every((q) => {
    if (!q.required) return true;
    const a = answers[q.id];
    if (!a) return false;
    if (Array.isArray(a) && a.length === 0) return false;
    if (typeof a === "string" && a.trim() === "") return false;
    return true;
  });

  // --- Quick select UI ---
  if (isSingleQuickSelect) {
    const q = questions[0];
    return (
      <div className="mr-auto max-w-lg">
        <div className="rounded-2xl px-4 py-3 bg-zinc-900/80 border border-zinc-800/50">
          <p className="text-sm text-zinc-300 mb-3">{q.question}</p>
          <div className="flex flex-wrap gap-2">
            {q.options!.map((option) => (
              <button
                key={option}
                onClick={() => handleQuickSelect(option)}
                className="px-3 py-1.5 text-sm rounded-lg border border-zinc-700/60 bg-zinc-800/50 text-zinc-200 hover:bg-zinc-700/60 hover:border-zinc-600/80 transition-all cursor-pointer"
              >
                {option}
              </button>
            ))}
          </div>
          <button
            onClick={onDismiss}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors cursor-pointer"
          >
            {t("questionnaire.dismiss")}
          </button>
        </div>
      </div>
    );
  }

  // --- Full form UI ---
  return (
    <div className="mr-auto max-w-lg">
      <div className="rounded-2xl px-4 py-3 bg-zinc-900/80 border border-zinc-800/50 space-y-4">
        {questions.map((q) => (
          <div key={q.id}>
            <p className="text-sm text-zinc-300 mb-2">
              {q.question}
              {q.type === "multiple_choice" && (
                <span className="ml-1.5 text-xs text-zinc-500">
                  ({t("questionnaire.multiSelect")})
                </span>
              )}
            </p>

            {/* Choice options */}
            {(q.type === "single_choice" || q.type === "multiple_choice") &&
              q.options && (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((option) => {
                    const isMulti = q.type === "multiple_choice";
                    const selected = isMulti
                      ? ((answers[q.id] as string[]) || []).includes(option)
                      : answers[q.id] === option;
                    return (
                      <button
                        key={option}
                        onClick={() => handleToggleOption(q.id, option, isMulti)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-all cursor-pointer ${
                          selected
                            ? "border-blue-500/60 bg-blue-500/20 text-blue-300"
                            : "border-zinc-700/60 bg-zinc-800/50 text-zinc-200 hover:bg-zinc-700/60 hover:border-zinc-600/80"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}

            {/* Text input */}
            {q.type === "text" && (
              <input
                type="text"
                placeholder={q.placeholder || ""}
                value={(answers[q.id] as string) || ""}
                onChange={(e) => handleTextChange(q.id, e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-700/60 bg-zinc-800/50 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            )}
          </div>
        ))}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleFormSubmit}
            disabled={!canSubmit}
            className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {t("questionnaire.submit")}
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-1.5 text-sm rounded-lg text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            {t("questionnaire.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
