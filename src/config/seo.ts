import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { brand } from './brand';
import { defaultLocale, isLocale, localeCookie, localizedPath, locales, type Locale } from './i18n';

export type PublicPage = 'today' | 'field' | 'irrigation' | 'forecast' | 'history' | 'devices';
export const publicPages: Record<PublicPage, string> = { today: '/', field: '/field', irrigation: '/irrigation', forecast: '/forecast', history: '/history', devices: '/devices' };
export const pageSeo: Record<Locale, Record<PublicPage, { title: string; description: string }>> = {
  en: {
    today: { title: 'Today', description: 'See today’s simulated field conditions, irrigation recommendation, and the evidence behind it.' },
    field: { title: 'Field', description: 'Explore the potato field, soil water balance, growth stage, and simulated sensor readings.' },
    irrigation: { title: 'Irrigation', description: 'Review a zone-by-zone drip irrigation plan and preview delivery without changing the shared field.' },
    forecast: { title: 'Forecast', description: 'Compare forecast rain with observed rain and see how weather informs irrigation decisions.' },
    history: { title: 'History', description: 'Follow the simulated field’s water balance, crop use, and irrigation history.' },
    devices: { title: 'Devices', description: 'View simulated field devices, readings, and data quality.' },
  },
  uz: {
    today: { title: 'Bugun', description: 'Daladagi hozirgi holat, sugʻorish tavsiyasi va uning asoslarini koʻring. Maʼlumotlar namoyish uchun modellashtirilgan.' },
    field: { title: 'Dala', description: 'Kartoshka dalasi, tuproqdagi suv balansi, oʻsish bosqichi va modellashtirilgan sensor maʼlumotlari.' },
    irrigation: { title: 'Sugʻorish', description: 'Tomchilatib sugʻorish rejasini hududlar boʻyicha koʻring va umumiy dala holatini oʻzgartirmasdan sinab koʻring.' },
    forecast: { title: 'Ob-havo', description: 'Kutilayotgan va kuzatilgan yogʻinni solishtiring, ob-havoning sugʻorish qarorlariga taʼsirini koʻring.' },
    history: { title: 'Tarix', description: 'Modellashtirilgan daladagi suv balansi, ekin suv sarfi va sugʻorish tarixini kuzating.' },
    devices: { title: 'Qurilmalar', description: 'Modellashtirilgan dala qurilmalari, koʻrsatkichlari va maʼlumotlar sifatini koʻring.' },
  },
  ru: {
    today: { title: 'Сегодня', description: 'Посмотрите состояние поля, рекомендацию по поливу и данные, на которых она основана. Показания моделируются.' },
    field: { title: 'Поле', description: 'Узнайте о картофельном поле, водном балансе почвы, фазе роста и смоделированных показаниях датчиков.' },
    irrigation: { title: 'Полив', description: 'Изучите план капельного полива по зонам и проверьте его в режиме предварительного просмотра.' },
    forecast: { title: 'Прогноз', description: 'Сравните прогноз осадков с наблюдениями и узнайте, как погода влияет на решение о поливе.' },
    history: { title: 'История', description: 'Проследите водный баланс, потребление воды культурой и историю полива смоделированного поля.' },
    devices: { title: 'Устройства', description: 'Посмотрите смоделированные устройства поля, их показания и качество данных.' },
  },
};
export const privateTitles: Record<Locale, { admin: string; account: string }> = {
  en: { admin: 'Administration', account: 'Account setup' },
  uz: { admin: 'Boshqaruv', account: 'Hisobni sozlash' },
  ru: { admin: 'Управление', account: 'Настройка учётной записи' },
};

export async function requestLocale(): Promise<Locale> {
  const value = (await headers()).get('x-baraka-locale');
  if (isLocale(value)) return value;
  const saved = (await cookies()).get(localeCookie)?.value;
  return isLocale(saved) ? saved : defaultLocale;
}

export async function pageMetadata(page: PublicPage): Promise<Metadata> {
  const locale = await requestLocale();
  const path = publicPages[page];
  const url = localizedPath(locale, path);
  const content = pageSeo[locale][page];
  const title = `${content.title} · ${brand.name}`;
  const languages = Object.fromEntries(locales.map(language => [language, localizedPath(language, path)]));
  return {
    title,
    description: content.description,
    alternates: { canonical: url, languages: { ...languages, 'x-default': localizedPath(defaultLocale, path) } },
    openGraph: { type: 'website', url, siteName: brand.name, locale: locale === 'uz' ? 'uz_UZ' : locale === 'ru' ? 'ru_RU' : 'en_US', title, description: content.description, images: [{ url: brand.socialImage, width: 1200, height: 630, alt: brand.name }] },
    twitter: { card: 'summary_large_image', title, description: content.description, images: [brand.socialImage] },
  };
}
