import type { MetadataRoute } from 'next';
import { brand } from '@/config/brand';
import { locales, localizedPath } from '@/config/i18n';
import { publicPages } from '@/config/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(publicPages).flatMap(path => locales.map(locale => ({
    url: `${brand.origin}${localizedPath(locale, path)}`,
    alternates: { languages: Object.fromEntries(locales.map(language => [language, `${brand.origin}${localizedPath(language, path)}`])) },
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 1 : 0.6,
  })));
}
