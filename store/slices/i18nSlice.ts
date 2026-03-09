import type { StateCreator } from 'zustand';
import type { Locale } from '@/lib/i18n/types';

export interface I18nSlice {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const createI18nSlice: StateCreator<I18nSlice> = (set) => ({
  locale: 'zh',
  setLocale: (locale) => set({ locale }),
});
