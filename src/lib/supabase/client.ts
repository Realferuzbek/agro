'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicSupabaseConfiguration } from './config';

export function createBrowserSupabaseClient() {
  const configuration = publicSupabaseConfiguration();
  return configuration ? createBrowserClient(configuration.url, configuration.key) : null;
}

export const createClient = createBrowserSupabaseClient;
