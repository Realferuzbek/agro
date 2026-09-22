import { requireAdmin } from '@/lib/server/auth';
import { failure, json } from '@/lib/server/http';
import { DEMO_FIELD_ID } from '@/lib/supabase/config';

export async function GET() {
  try {
    const { client } = await requireAdmin();
    const results = await Promise.all([
      client.from('product_state').select('state,revision').eq('field_id', DEMO_FIELD_ID).single(),
      client.from('audit_logs').select('*').order('created_at',{ ascending:false }).limit(50),
      client.from('telemetry').select('*').eq('field_id',DEMO_FIELD_ID).order('received_at',{ ascending:false }).limit(60),
      client.from('simulation_controls').select('status,speed').eq('field_id',DEMO_FIELD_ID).maybeSingle(),
      client.from('commissioning_runs').select('*').eq('field_id',DEMO_FIELD_ID).order('created_at',{ascending:false}).limit(20),
      client.from('alerts').select('*').eq('field_id',DEMO_FIELD_ID).order('detected_at',{ascending:false}).limit(50),
      client.from('device_latest_state').select('*').eq('field_id',DEMO_FIELD_ID),
    ]);
    for (const result of results) if(result.error) throw result.error;
    return json({ ...results[0].data, auditLogs: results[1].data, telemetry: results[2].data, simulationControl: results[3].data ?? {status:'paused',speed:1}, commissioning: results[4].data, alerts: results[5].data, latestDeviceState: results[6].data });
  } catch(error) { return failure(error); }
}
