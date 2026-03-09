"use client";

import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles: Record<string, string> = {
  primary: "bg-white text-black hover:bg-zinc-200",
  secondary: "bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800",
  danger: "bg-red-900/20 text-red-500 border border-red-900/50 hover:bg-red-900/30",
  ghost: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300",
};

const sizeStyles: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-sm",
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
