import { createClient } from '@supabase/supabase-js';
import { assertLocalBackend, loadLocalEnvironment } from './env';

async function main() {
  loadLocalEnvironment();const {url,key}=assertLocalBackend();
  const email=process.env.BARAKA_ADMIN_EMAIL;const password=process.env.BARAKA_ADMIN_PASSWORD;
  if(!email||!password||password.length<12)throw new Error('Set BARAKA_ADMIN_EMAIL and BARAKA_ADMIN_PASSWORD (at least 12 characters) in .env.local.');
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:list,error:listError}=await client.auth.admin.listUsers({page:1,perPage:1000});if(listError)throw listError;
  let user=list.users.find(candidate=>candidate.email===email);
  if(!user){const {data,error}=await client.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;user=data.user;}
  else {const {error}=await client.auth.admin.updateUserById(user.id,{password,email_confirm:true});if(error)throw error;}
  if(!user)throw new Error('Unable to create the administrator.');
  const {error}=await client.rpc('bootstrap_initial_owner',{p_user_id:user.id});if(error)throw error;
  console.log('Local protected owner is ready. Use the credentials in ignored .env.local at /admin.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Admin bootstrap failed.');process.exitCode=1;});
