"use client";

import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles: Record<string, string> = {
  primary: "bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)]",
  secondary: "bg-[var(--bg-glass)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
  ghost: "border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-default)]",
  danger: "bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20",
  icon: "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
};

const sizeStyles: Record<string, string> = {
  sm: "py-[7px] px-[10px] text-xs",
  md: "py-[9px] px-[14px] text-sm",
  lg: "py-[11px] px-[18px] text-sm",
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center",
        "focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
