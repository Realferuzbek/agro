import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { hostedEnvironment } from './hosted-env';

const project='gunzhtlbpxwpprqwnhfd';
const fieldId='00000000-0000-4000-8000-000000000002';
function within<T>(promise:Promise<T>,milliseconds:number,fallback:T):Promise<T>{
  return new Promise(resolve=>{const timer=setTimeout(()=>resolve(fallback),milliseconds);void promise.then(value=>{clearTimeout(timer);resolve(value);});});
}

async function main(){
  const env=hostedEnvironment();
  if(env.SUPABASE_PROJECT_REF!==project||new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!==`${project}.supabase.co`)throw new Error('Unexpected hosted target.');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const publicClient=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
  const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
  const id=`realtime-verification-${randomUUID()}`;
  let finishSubscription:(status:string)=>void=()=>{};
  let finishEvent:(value:boolean)=>void=()=>{};
  const subscribed=new Promise<string>(resolve=>{finishSubscription=resolve;});
  const delivered=new Promise<boolean>(resolve=>{finishEvent=resolve;});
  const channel=publicClient.channel(`hosted-alert-verification-${id}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'alerts',filter:`field_id=eq.${fieldId}`},payload=>{
      if(payload.new.id===id)finishEvent(true);
    })
    .subscribe(status=>{if(status==='SUBSCRIBED'||status==='CHANNEL_ERROR'||status==='TIMED_OUT')finishSubscription(status);});
  try{
    const status=await within(subscribed,20000,'TIMEOUT');
    if(status!=='SUBSCRIBED')throw new Error('Hosted Realtime subscription did not open.');
    const inserted=await service.from('alerts').insert({id,field_id:fieldId,type:'VERIFICATION',severity:'info',detected_at:new Date().toISOString(),status:'open',evidence:{temporary:true,source:'hosted-realtime-verification'}});
    if(inserted.error)throw new Error('Temporary hosted alert could not be inserted.');
    const observed=await within(delivered,20000,false);
    if(!observed)throw new Error('Hosted anonymous subscriber did not receive the committed alert event.');
    console.log('Hosted Realtime verified: an anonymous subscriber received a committed public-demo alert event.');
  }finally{
    const removed=await service.from('alerts').delete().eq('id',id);
    await publicClient.removeChannel(channel);
    publicClient.realtime.disconnect();
    if(removed.error)throw new Error('Temporary hosted alert cleanup failed.');
  }
}

main().catch(()=>{console.error('Hosted Realtime verification failed. No credentials were printed.');process.exitCode=1;});
