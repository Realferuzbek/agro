'use client';
import { useLocale } from '@/components/locale-provider';
import { copy as englishCopy } from './copy';
import { accessCopy as englishAccessCopy, authCopy as englishAuthCopy } from './access-copy';
import { defaultLocale, isLocale, type Locale } from './i18n';
import { translations } from './translations';

export function localeFromPath(pathname: string): Locale {
  const candidate = pathname.split('/')[1];
  return isLocale(candidate) ? candidate : defaultLocale;
}

function withTranslations<T extends Record<string, unknown>>(source: T, replacement: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key,
    value && typeof value === 'object' && !Array.isArray(value)
      ? withTranslations(value as Record<string, unknown>, (replacement[key] as Record<string, unknown>) ?? {})
      : replacement[key] ?? value,
  ])) as T;
}

export function getCopy(locale: Locale) { return locale === 'en' ? englishCopy : withTranslations(englishCopy, translations[locale].copy); }
export function getAccessCopy(locale: Locale) { return locale === 'en' ? englishAccessCopy : withTranslations(englishAccessCopy, translations[locale].access); }
export function getAuthCopy(locale: Locale) { return locale === 'en' ? englishAuthCopy : withTranslations(englishAuthCopy, translations[locale].auth); }
export { useLocale };
export function useCopy() { return getCopy(useLocale()); }
export function useAccessCopy() { return getAccessCopy(useLocale()); }
export function useAuthCopy() { return getAuthCopy(useLocale()); }
