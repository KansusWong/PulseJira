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
        "flex items-center rounded-md border border-zinc-700/60 overflow-hidden bg-zinc-900/40",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - step, min, max))}
        disabled={decDisabled}
        className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        aria-label="decrease"
      >
        <span className="text-xs leading-none">-</span>
      </button>
      <span
        className={clsx(
          "h-8 min-w-[36px] px-2 flex items-center justify-center text-xs font-mono text-zinc-300 bg-zinc-800/40 tabular-nums select-none",
          valueClassName
        )}
      >
        {formatValue ? formatValue(value) : value}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step, min, max))}
        disabled={incDisabled}
        className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        aria-label="increase"
      >
        <span className="text-xs leading-none">+</span>
      </button>
    </div>
  );
}
