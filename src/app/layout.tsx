import type { Metadata } from 'next';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import './globals.css';
import { brand } from '@/config/brand';
import { requestLocale } from '@/config/seo';
import { LocaleProvider } from '@/components/locale-provider';

export const metadata: Metadata = { metadataBase: new URL(brand.origin), applicationName: brand.name, title: brand.name, description: brand.description, icons: { icon: [{ url: brand.mark, type: 'image/svg+xml' }, { url: '/brand/baraka-agro-icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/brand/baraka-agro-icon-192.png' }, manifest: '/manifest.webmanifest' };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const structuredData = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: brand.name, url: brand.origin, logo: `${brand.origin}${brand.mark}` },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: brand.name, url: brand.origin, inLanguage: ['en', 'uz', 'ru'] },
    { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: brand.name, applicationCategory: 'AgriculturalApplication', operatingSystem: 'Web', url: brand.origin, description: brand.description },
  ];
  return <html lang={locale}><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} /><LocaleProvider locale={locale}>{children}</LocaleProvider></body></html>;
}
