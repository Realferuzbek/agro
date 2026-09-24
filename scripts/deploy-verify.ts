import { hostedEnvironment, assertHostedUrl } from './hosted-env';
import { brand } from '../src/config/brand';
import { locales, localizedPath } from '../src/config/i18n';

const values = hostedEnvironment();
const index = process.argv.indexOf('--url');
const base = assertHostedUrl(index >= 0 ? process.argv[index + 1] : values.NEXT_PUBLIC_SITE_URL, 'Deployment URL');
const failures: string[] = [];

async function main() {
  const chunks = new Set<string>();
  for (const locale of locales) for (const path of ['/', '/field', '/irrigation', '/forecast', '/history', '/devices']) {
    const localized = localizedPath(locale, path);
    const response = await fetch(new URL(localized, base), { signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    if (!response.ok || new URL(response.url).pathname !== localized) failures.push(`${localized}: HTTP ${response.status} or unexpected redirect`);
    if (!html.includes(`<html lang="${locale}"`)) failures.push(`${localized}: wrong HTML language`);
    if (!html.includes(`rel="canonical" href="${brand.origin}${localized}"`)) failures.push(`${localized}: missing canonical`);
    for (const alternate of locales) if (!html.includes(`hrefLang="${alternate}"`) && !html.includes(`hreflang="${alternate}"`)) failures.push(`${localized}: missing ${alternate} alternate`);
    if (!html.includes(brand.name) || html.includes('content="noindex')) failures.push(`${localized}: bad public metadata`);
    for (const match of html.matchAll(/src="([^"]+\.js(?:\?[^\"]*)?)"/g)) {
      const url = new URL(match[1].replaceAll('&amp;', '&'), base);
      if (url.origin === base.origin) chunks.add(url.href);
    }
  }
  for (const locale of locales) {
    const path = localizedPath(locale, '/admin');
    const response = await fetch(new URL(path, base));
    const html = await response.text();
    if (!response.ok || !html.includes('name="robots" content="noindex')) failures.push(`${path}: anonymous login or noindex missing`);
  }
  const [product, admin, sitemap, robots, manifest] = await Promise.all([
    fetch(new URL('/api/product', base)), fetch(new URL('/api/admin/overview', base)), fetch(new URL('/sitemap.xml', base)), fetch(new URL('/robots.txt', base)), fetch(new URL('/manifest.webmanifest', base)),
  ]);
  const body = await product.json();
  if (!product.ok || body.state?.schemaVersion !== 1 || !Number.isFinite(body.state?.recommendation?.grossVolumeLiters) || !body.state?.calculation?.engineVersion) failures.push('Public product state is unavailable or invalid.');
  if (admin.status !== 401) failures.push(`Anonymous admin access returned ${admin.status}, expected 401.`);
  const sitemapText = await sitemap.text();
  for (const locale of locales) if (!sitemapText.includes(`${brand.origin}/${locale}`)) failures.push(`Sitemap missing ${locale}`);
  if (!(await robots.text()).includes(`${brand.origin}/sitemap.xml`)) failures.push('Robots file has no production sitemap.');
  if (!(await manifest.text()).includes(brand.name)) failures.push('Manifest has wrong brand.');
  for (const url of chunks) {
    const text = await (await fetch(url)).text();
    if (values.SUPABASE_SERVICE_ROLE_KEY && text.includes(values.SUPABASE_SERVICE_ROLE_KEY)) failures.push('A server credential appeared in a client bundle.');
    if (text.includes('127.0.0.1:54321') || text.includes('localhost:54321')) failures.push('A local Supabase URL appeared in a hosted client bundle.');
  }
  if (failures.length) { console.error('Hosted verification failed:\n' + [...new Set(failures)].map(f => `- ${f}`).join('\n')); process.exitCode = 1; }
  else console.log(`Localized routes, SEO, state, anonymous-auth, and ${chunks.size} client-bundle checks passed. Manual authenticated/realtime/browser acceptance remains required.`);
}
main().catch(() => { console.error('Hosted verification could not connect or decode the application response.'); process.exitCode = 1; });
