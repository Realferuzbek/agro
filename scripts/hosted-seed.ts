import { createClient } from '@supabase/supabase-js';
import { buildForecast,createSimulation } from '../src/domain';
import { hostedEnvironment } from './hosted-env';

async function main(){
  const values=hostedEnvironment();const approvedProject='gunzhtlbpxwpprqwnhfd';
  if(values.SUPABASE_PROJECT_REF!==approvedProject||new URL(values.NEXT_PUBLIC_SUPABASE_URL).hostname!==`${approvedProject}.supabase.co`)throw new Error('Hosted configuration does not match the explicitly selected project.');
  const client=createClient(values.NEXT_PUBLIC_SUPABASE_URL,values.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const state=createSimulation('rain-underperforms');
  const {data,error}=await client.rpc('initialize_demo_state',{p_field_id:'00000000-0000-4000-8000-000000000002',p_state:state,p_forecasts:buildForecast(state)});
  if(error)throw error;
  console.log(data.initialized?'Hosted golden field initialized with deterministic calculations, devices, history and forecasts.':'Hosted field already initialized; existing state and history were preserved.');
}
main().catch(()=>{console.error('Hosted golden initialization failed. Check target schema and private hosted credentials.');process.exitCode=1;});
