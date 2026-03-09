import { usePulseStore } from '@/store/usePulseStore.new';
import zh from './locales/zh';
import en from './locales/en';
import type { Locale, TranslationDict } from './types';

const dictionaries: Record<Locale, TranslationDict> = { zh, en };

/**
 * Resolve a translation key with optional placeholder interpolation.
 *
 * Usage:
 *   t('agent.running', { count: 3 })  →  "3 个智能体运行中"
 *
 * Falls back to the Chinese dictionary (default language) when a key is
 * missing from the active locale, and finally returns the raw key itself.
 */
function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  let text = dictionaries[locale]?.[key] ?? dictionaries.zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/**
 * React hook – returns a `t()` function bound to the current locale.
 *
 * ```tsx
 * const { t, locale } = useTranslation();
 * <h2>{t('settings.agents.title')}</h2>
 * ```
 */
export function useTranslation() {
  const locale = usePulseStore((s) => s.locale);

  const t = (key: string, params?: Record<string, string | number>): string =>
    translate(locale, key, params);

  return { t, locale } as const;
}

export type { Locale, TranslationDict };
