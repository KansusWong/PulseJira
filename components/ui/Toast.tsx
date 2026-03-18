"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import clsx from "clsx";

/* ── Toast types ────────────────────────────────────────────── */

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

/* ── Simple external store (no extra deps) ──────────────────── */

let toasts: ToastItem[] = [];
let listeners: Set<() => void> = new Set();
let nextId = 0;

function emitChange() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

function addToast(item: ToastItem) {
  toasts = [...toasts, item];
  emitChange();
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emitChange();
}

/* ── Public API: toast() ────────────────────────────────────── */

export function toast(message: string, variant: ToastVariant = "info") {
  const id = `toast-${++nextId}`;
  addToast({ id, message, variant });
  return id;
}

/* ── Variant icon SVGs ──────────────────────────────────────── */

const icons: Record<ToastVariant, React.ReactNode> = {
  success: (
    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
    </svg>
  ),
};

/* ── Single toast renderer ──────────────────────────────────── */

function ToastEntry({ item }: { item: ToastItem }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const enterFrame = requestAnimationFrame(() => setVisible(true));

    // Start exit after 3s
    const exitTimer = setTimeout(() => {
      setExiting(true);
      setVisible(false);
    }, 3000);

    // Remove from store after fade-out completes
    const removeTimer = setTimeout(() => {
      removeToast(item.id);
    }, 3300);

    return () => {
      cancelAnimationFrame(enterFrame);
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [item.id]);

  return (
    <div
      role="alert"
      className={clsx(
        "glass-2 rounded-lg max-w-[320px] px-4 py-3 flex items-center gap-3 text-sm text-[var(--text-primary)] shadow-md",
        "transition-all duration-300 ease-in-out",
        visible && !exiting
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2"
      )}
    >
      {icons[item.variant]}
      <span className="leading-snug">{item.message}</span>
    </div>
  );
}

/* ── Toast container (mount once in layout) ─────────────────── */

export function ToastContainer() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none">
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastEntry item={item} />
        </div>
      ))}
    </div>
  );
}
