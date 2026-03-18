"use client";

import clsx from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function Input({ className, icon, ...props }: InputProps) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-3 text-[var(--text-muted)]">{icon}</div>
      )}
      <input
        className={clsx(
          "w-full bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-lg py-3 text-sm text-[var(--text-primary)] transition-colors",
          "placeholder:text-[var(--text-muted)]",
          "focus:border-[var(--border-accent)] focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none",
          icon ? "pl-10 pr-4" : "px-4",
          className
        )}
        {...props}
      />
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function TextArea({ className, ...props }: TextAreaProps) {
  return (
    <textarea
      className={clsx(
        "w-full bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-lg p-4 text-sm text-[var(--text-primary)] transition-colors resize-none",
        "placeholder:text-[var(--text-muted)]",
        "focus:border-[var(--border-accent)] focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none",
        className
      )}
      {...props}
    />
  );
}
