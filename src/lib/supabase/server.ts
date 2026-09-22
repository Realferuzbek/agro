import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicSupabaseConfiguration } from './config';

export async function createServerSupabaseClient() {
  const configuration = publicSupabaseConfiguration();
  if (!configuration) return null;
  const store = await cookies();
  return createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components cannot write cookies. proxy.ts refreshes the session. */ }
      },
    },
  });
}

export const createClient = createServerSupabaseClient;
