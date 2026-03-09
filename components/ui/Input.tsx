"use client";

import clsx from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function Input({ className, icon, ...props }: InputProps) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-3 text-zinc-600">{icon}</div>
      )}
      <input
        className={clsx(
          "w-full bg-black border border-border rounded-lg py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-800",
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
        "w-full bg-black border border-border rounded-lg p-4 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-800 resize-none",
        className
      )}
      {...props}
    />
  );
}
