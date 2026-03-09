"use client";

import clsx from "clsx";

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={clsx(
        "animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300",
        sizeMap[size],
        className
      )}
    />
  );
}
