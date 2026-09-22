import { createClient } from '@supabase/supabase-js';
import { buildForecast, createSimulation } from '../src/domain';
import { assertLocalBackend, loadLocalEnvironment } from './env';

async function main() {
  loadLocalEnvironment();const {url,key}=assertLocalBackend();
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const state=createSimulation('rain-underperforms');
  const {data,error}=await client.rpc('initialize_demo_state',{p_field_id:'00000000-0000-4000-8000-000000000002',p_state:state,p_forecasts:buildForecast(state)});
  if(error)throw error;
  console.log(data.initialized?'Persisted golden field state, devices, calculations, and history.':'The demo field is already initialized; existing history was preserved.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Database seed failed. Check local migrations and connection.');process.exitCode=1;});
