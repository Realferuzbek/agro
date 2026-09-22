import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { SimulationState } from '@/domain/types';
import { DEMO_FIELD_ID, publicSupabaseConfiguration } from '@/lib/supabase/config';

export interface ProductStateResult { state: SimulationState | null; error: string | null; revision: number; }

export async function readProductState(): Promise<ProductStateResult> {
  const configuration = publicSupabaseConfiguration();
  if (!configuration) return { state: null, error: 'Connect the local Supabase backend to load the field.', revision: 0 };
  try {
    const client = createClient(configuration.url, configuration.key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(6000) }) } });
    const { data, error } = await client.from('product_state').select('state,revision').eq('field_id', DEMO_FIELD_ID).maybeSingle();
    if (error) return { state: null, error: 'The field database is temporarily unavailable.', revision: 0 };
    if (!data || data.state?.schemaVersion !== 1) return { state: null, error: 'The field has not been initialized. Run the database seed.', revision: 0 };
    return { state: data.state as SimulationState, error: null, revision: Number(data.revision) };
  } catch { return { state: null, error: 'The field database is temporarily unavailable.', revision: 0 }; }
}
