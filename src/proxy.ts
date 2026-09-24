import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicSupabaseConfiguration } from '@/lib/supabase/config';
import { defaultLocale, isLocale, localeCookie, type Locale } from '@/config/i18n';

const localizedPaths = new Set(['/', '/field', '/irrigation', '/forecast', '/history', '/devices', '/admin']);
function localeFromRequest(request: NextRequest): Locale {
  const saved = request.cookies.get(localeCookie)?.value;
  if (isLocale(saved)) return saved;
  const preferred = request.headers.get('accept-language')?.toLowerCase() ?? '';
  if (preferred.startsWith('uz')) return 'uz';
  if (preferred.startsWith('ru')) return 'ru';
  return defaultLocale;
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = (request.headers.get('host')?.split(':')[0] ?? url.hostname).toLowerCase();
  const scheme = request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0, -1);
  if (hostname === 'www.barakaagro.app' || (hostname === 'barakaagro.app' && scheme === 'http')) {
    url.hostname = 'barakaagro.app';
    url.protocol = 'https:';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }
  const segments = url.pathname.split('/');
  const prefixedLocale = isLocale(segments[1]) ? segments[1] : null;
  const barePath = prefixedLocale ? `/${segments.slice(2).join('/')}`.replace(/\/$/, '') || '/' : url.pathname;
  if (!prefixedLocale && localizedPaths.has(url.pathname) && !isLocale(request.headers.get('x-baraka-locale'))) {
    url.pathname = `/${localeFromRequest(request)}${url.pathname === '/' ? '' : url.pathname}`;
    return NextResponse.redirect(url, 307);
  }
  const isLocalizedPage = Boolean(prefixedLocale && localizedPaths.has(barePath));
  let requestHeaders: Headers | undefined;
  if (isLocalizedPage) {
    url.pathname = barePath;
    requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-baraka-locale', prefixedLocale!);
  }
  const configuration = publicSupabaseConfiguration();
  const makeResponse = () => isLocalizedPage ? NextResponse.rewrite(url, { request: { headers: requestHeaders! } }) : NextResponse.next({ request });
  let response = makeResponse();
  const persistLocale = () => { if (prefixedLocale && isLocalizedPage) response.cookies.set(localeCookie, prefixedLocale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: url.protocol === 'https:' }); };
  persistLocale();
  if (!configuration) return response;
  const client = createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = makeResponse();
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        persistLocale();
      },
    },
  });
  try { await client.auth.getClaims(); } catch { /* Route handlers remain the authority and fail closed. */ }
  return response;
}

export const config = { matcher: ['/((?!_next|brand|favicon.ico|icon|apple-icon|manifest.webmanifest|sitemap.xml|robots.txt).*)'] };
