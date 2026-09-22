import { createClient } from '@supabase/supabase-js';
import { DEMO_FIELD_ID, publicSupabaseConfiguration } from '@/lib/supabase/config';
import { json } from '@/lib/server/http';
export async function GET() {
  const configuration = publicSupabaseConfiguration();
  if (!configuration) return json({ error: 'The field database is unavailable.' }, 503);
  const client = createClient(configuration.url, configuration.key, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(6000) }) } });
  try {
    const { data, error } = await client.from('irrigation_runs').select('id,status,started_at,updated_at,snapshot').eq('field_id', DEMO_FIELD_ID).order('started_at', { ascending: false }).limit(20);
    if (error) return json({ error: 'Irrigation history is temporarily unavailable.' }, 503);
    return json({ runs: (data ?? []).map(run => ({ id: run.id, status: run.status, startedAt: run.started_at, updatedAt: run.updated_at, targetVolumeLiters: run.snapshot.targetVolumeLiters, deliveredVolumeLiters: run.snapshot.deliveredVolumeLiters, zones: run.snapshot.zones, reason: run.snapshot.reason ?? 'Restore the configured root-zone management target.' })) });
  } catch { return json({ error: 'Irrigation history is temporarily unavailable.' }, 503); }
}
