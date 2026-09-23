import { z } from 'zod';
import { configureZoneSoil, type SimulationState } from '@/domain';
import { requireAdmin } from '@/lib/server/auth';
import { checkOrigin, failure, HttpError, json, readJson } from '@/lib/server/http';
import { requestHash, stateBundle } from '@/lib/server/simulation';
import { DEMO_FIELD_ID } from '@/lib/supabase/config';

const parameters = z.object({
  version: z.string().trim().min(1).max(80), fieldAreaM2: z.number().positive(),
  fieldCapacity: z.number(), wiltingPoint: z.number(), rootDepthM: z.number(), evaporationDepthM: z.number(),
  readilyEvaporableWaterMm: z.number(), cropHeightM: z.number(), kcb: z.number(), depletionFraction: z.number(),
  applicationEfficiency: z.number(), wettedFraction: z.number(), earlyWarningFraction: z.number(),
  actionDepletionFraction: z.number(), targetDepletionFraction: z.number(), capillaryRiseMm: z.literal(0),
}).strict();
const schema = z.object({
  expectedVersion: z.number().int().nonnegative(), idempotencyKey: z.uuid(),
  configuration: z.object({ version: z.string().trim().min(1).max(80), source: z.string().trim().min(1).max(3000),
    zones: z.array(z.object({ zoneId: z.enum(['A', 'B', 'C', 'D']), parameters, rootZoneDepletionMm: z.number().nonnegative(), surfaceDepletionMm: z.number().nonnegative() }).strict()).length(4),
  }).strict(),
}).strict();

/** Configuration is committed with the field state, calculation snapshot and audit event atomically. */
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { client } = await requireAdmin('simulation.manage');
    const input = await readJson(request, schema);
    const { data, error } = await client.from('product_state').select('state,revision').eq('field_id', DEMO_FIELD_ID).single();
    if (error) throw error;
    const state = data.state as SimulationState;
    if (!state || state.schemaVersion !== 1) throw new HttpError(503, 'The field has not been initialized.');
    let configured: SimulationState;
    try { configured = configureZoneSoil(state, input.configuration); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid zone soil configuration.'); }
    const { data: committed, error: commitError } = await client.rpc('commit_simulation_state', {
      p_field_id: DEMO_FIELD_ID, p_expected_revision: input.expectedVersion, p_idempotency_key: input.idempotencyKey,
      p_request_hash: requestHash(input), p_action: 'soil.configure', p_state: configured, p_bundle: stateBundle(configured, 'soil.configure'),
    });
    if (commitError) throw commitError;
    return json(committed);
  } catch (error) { return failure(error); }
}
