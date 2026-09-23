import { createClient } from '@supabase/supabase-js';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hostedEnvironment } from './hosted-env';
import { assertLocalBackend,loadLocalEnvironment } from './env';

async function main(){
  const local=process.argv.includes('--local');const project='gunzhtlbpxwpprqwnhfd';
  if(!local&&process.argv[process.argv.indexOf('--project-ref')+1]!==project)throw new Error('Select --local or the explicitly approved --project-ref.');
  const id=process.argv[process.argv.indexOf('--user-id')+1];if(!/^[0-9a-f-]{36}$/i.test(id??''))throw new Error('Supply the protected owner UUID using --user-id.');
  if(local)loadLocalEnvironment();const env=local?process.env:hostedEnvironment();const backend=local?assertLocalBackend():{url:env.NEXT_PUBLIC_SUPABASE_URL!,key:env.SUPABASE_SERVICE_ROLE_KEY!};
  if(!local&&new URL(backend.url).hostname!==`${project}.supabase.co`)throw new Error('Unexpected hosted backend.');
  const client=createClient(backend.url,backend.key,{auth:{persistSession:false,autoRefreshToken:false}});
  const recorded=await client.rpc('record_owner_recovery',{p_user_id:id});if(recorded.error)throw recorded.error;
  const identity=await client.auth.admin.getUserById(id);if(identity.error||!identity.data.user.email)throw new Error('Owner identity unavailable.');
  const site=env.NEXT_PUBLIC_SITE_URL;if(!site)throw new Error('Configure NEXT_PUBLIC_SITE_URL for the password recovery callback.');
  const generated=await client.auth.admin.generateLink({type:'recovery',email:identity.data.user.email,options:{redirectTo:new URL('/auth/accept',site).href}});if(generated.error)throw generated.error;
  mkdirSync(resolve('.local'),{recursive:true});writeFileSync(resolve('.local/owner-recovery.txt'),generated.data.properties.action_link,{mode:0o600});
  console.log('Audited owner recovery link saved only to ignored .local/owner-recovery.txt. Open it privately and delete that file after use. No role or identity changed.');
}
main().catch(()=>{console.error('Owner recovery was not completed. Verify the protected UUID and trusted operator configuration. No secrets were printed.');process.exitCode=1;});
