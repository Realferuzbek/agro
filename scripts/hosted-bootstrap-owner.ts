import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hostedEnvironment } from './hosted-env';

const project='gunzhtlbpxwpprqwnhfd';
const designatedEmail='iamrealferuzbek@gmail.com';
async function main(){
  if(process.argv[process.argv.indexOf('--project-ref')+1]!==project)throw new Error(`Pass --project-ref ${project} for the approved target.`);
  const env=hostedEnvironment();
  if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!==`${project}.supabase.co`||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Hosted configuration does not match the approved project.');
  const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  // The email selects the explicitly designated identity once. Every authorization afterwards uses its UUID.
  let user;for(let page=1;page<=100;page++){const result=await service.auth.admin.listUsers({page,perPage:1000});if(result.error)throw result.error;user=result.data.users.find(candidate=>candidate.email?.toLowerCase()===designatedEmail);if(user||result.data.users.length<1000)break;}
  const target=resolve('.env.hosted.local');let contents=readFileSync(target,'utf8');
  const save=(name:string,value:string)=>{const line=`${name}=${value}`;const pattern=new RegExp(`^${name}=.*$`,'m');contents=pattern.test(contents)?contents.replace(pattern,line):`${contents.trimEnd()}\n${line}\n`;writeFileSync(target,contents,{mode:0o600});};
  if(!user){
    const password=randomBytes(36).toString('base64url');
    // Persist privately before creation so an interrupted bootstrap never loses the generated password.
    save('AGRIFLOW_OWNER_EMAIL',designatedEmail);save('AGRIFLOW_OWNER_PASSWORD',password);
    const created=await service.auth.admin.createUser({email:designatedEmail,password,email_confirm:true});if(created.error)throw created.error;user=created.data.user;
  }
  if(!user)throw new Error('The designated Auth identity was not found.');
  const bound=await service.rpc('bootstrap_initial_owner',{p_user_id:user.id});if(bound.error)throw bound.error;
  save('AGRIFLOW_OWNER_EMAIL',designatedEmail);save('AGRIFLOW_OWNER_ID',user.id);
  console.log('Designated owner UUID is protected. Existing identities and passwords were preserved; newly generated credentials are only in ignored .env.hosted.local.');
}
main().catch(()=>{console.error('Hosted owner bootstrap was not confirmed. Inspect the owner registry before retrying; no credentials were printed.');process.exitCode=1;});
