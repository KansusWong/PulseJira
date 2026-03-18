"use client";

import { useState } from "react";
import { ArrowRight, Zap } from "lucide-react";

interface BottomInputBarProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function BottomInputBar({
  onSubmit,
  placeholder = "Describe a new feature or ask a question...",
  disabled = false,
}: BottomInputBarProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3">
      <Zap className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
