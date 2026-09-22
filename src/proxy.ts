import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicSupabaseConfiguration } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  const configuration = publicSupabaseConfiguration();
  let response = NextResponse.next({ request });
  if (!configuration) return response;
  const client = createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  try { await client.auth.getClaims(); } catch { /* Route handlers remain the authority and fail closed. */ }
  return response;
}

export const config = { matcher: ['/admin/:path*', '/api/auth/:path*', '/api/admin/:path*'] };
