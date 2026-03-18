"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  valueClassName?: string;
  formatValue?: (value: number) => ReactNode;
}

function clamp(value: number, min?: number, max?: number): number {
  if (typeof min === "number" && value < min) return min;
  if (typeof max === "number" && value > max) return max;
  return value;
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  className,
  valueClassName,
  formatValue,
}: NumberStepperProps) {
  const decDisabled = disabled || (typeof min === "number" && value <= min);
  const incDisabled = disabled || (typeof max === "number" && value >= max);

  return (
    <div
      className={clsx(
        "flex items-center rounded-md border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-glass)]",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - step, min, max))}
        disabled={decDisabled}
        className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        aria-label="decrease"
      >
        <span className="text-xs leading-none">-</span>
      </button>
      <span
        className={clsx(
          "h-8 min-w-[36px] px-2 flex items-center justify-center text-xs font-mono text-[var(--text-primary)] bg-[var(--bg-glass)] tabular-nums select-none",
          valueClassName
        )}
      >
        {formatValue ? formatValue(value) : value}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step, min, max))}
        disabled={incDisabled}
        className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        aria-label="increase"
      >
        <span className="text-xs leading-none">+</span>
      </button>
    </div>
  );
}
