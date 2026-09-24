'use client';
import { createContext, useContext } from 'react';
import { defaultLocale, type Locale } from '@/config/i18n';

const LocaleContext = createContext<Locale>(defaultLocale);
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext); }
