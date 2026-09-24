import { createClient } from '@supabase/supabase-js';
import { hostedEnvironment } from './hosted-env';

async function main(){
  const values=hostedEnvironment();if(values.SUPABASE_PROJECT_REF!=='gunzhtlbpxwpprqwnhfd'||new URL(values.NEXT_PUBLIC_SUPABASE_URL).hostname!=='gunzhtlbpxwpprqwnhfd.supabase.co')throw new Error('Unexpected hosted project or URL.');
  const client=createClient(values.NEXT_PUBLIC_SUPABASE_URL,values.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const fieldId='00000000-0000-4000-8000-000000000002';
  const {data,error}=await client.from('product_state').select('state,revision').eq('field_id',fieldId).single();
  if(error||!data||data.state.schemaVersion!==1)throw new Error('Public state unavailable.');
  if(Math.abs(data.state.recommendation.grossVolumeLiters-60086)>100)throw new Error('Hosted golden volume is outside tolerance.');
  if(data.state.rain.forecastMm!==7||data.state.rain.observedMm!==2)throw new Error('Rain provenance scenario mismatch.');
  const checks=await Promise.all([
    client.from('device_credentials').select('*'),client.from('telemetry').select('*'),client.from('audit_logs').select('*'),
    client.from('profiles').update({role:'admin'}).eq('id','00000000-0000-4000-8000-000000000099'),
    client.rpc('commit_simulation_state',{p_field_id:fieldId,p_expected_revision:0,p_idempotency_key:'00000000-0000-4000-8000-000000000098',p_request_hash:'anonymous-denial-check',p_action:'verification',p_state:data.state,p_bundle:{}}),
  ]);
  if(checks.some(check=>!check.error))throw new Error('An anonymous restricted operation unexpectedly succeeded.');
  const devices=await client.from('devices').select('id,mode').eq('field_id',fieldId);if(devices.error||devices.data.length!==12||devices.data.some(device=>device.mode!=='SIMULATED'))throw new Error('Simulated device seed mismatch.');
  console.log(`Hosted verification passed: golden state ${Math.round(data.state.recommendation.grossVolumeLiters)} L, 7 mm forecast / 2 mm observed, 12 simulated devices, anonymous write/role/private-data denials.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Hosted verification failed.');process.exitCode=1;});
