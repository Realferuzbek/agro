export const locales = ['en', 'uz', 'ru'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const localeCookie = 'baraka-locale';
export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && locales.includes(value as Locale);
export const localizedPath = (locale: Locale, path = '/') => `/${locale}${path === '/' ? '' : path.startsWith('/') ? path : `/${path}`}`;
export const localeName: Record<Locale, string> = { en: 'English', uz: 'Oʻzbek', ru: 'Русский' };
export const languageTag: Record<Locale, string> = { en: 'en', uz: 'uz-UZ', ru: 'ru-RU' };
export const navLabels: Record<Locale, Record<string, string>> = {
  en: { '/': 'Today', '/field': 'Field', '/irrigation': 'Irrigation', '/forecast': 'Forecast', '/history': 'History', '/devices': 'Devices' },
  uz: { '/': 'Bugun', '/field': 'Dala', '/irrigation': 'Sugʻorish', '/forecast': 'Ob-havo', '/history': 'Tarix', '/devices': 'Qurilmalar' },
  ru: { '/': 'Сегодня', '/field': 'Поле', '/irrigation': 'Полив', '/forecast': 'Прогноз', '/history': 'История', '/devices': 'Устройства' },
};
