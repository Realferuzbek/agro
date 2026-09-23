import { createClient } from '@supabase/supabase-js';
import { hostedEnvironment } from './hosted-env';

const project='gunzhtlbpxwpprqwnhfd';
const designatedEmail='iamrealferuzbek@gmail.com';
const requiredPermissions=['simulation.manage','devices.manage','parameters.manage','audit.read'];

async function main(){
  const env=hostedEnvironment();
  const email=env.AGRIFLOW_OWNER_EMAIL??env.AGRIFLOW_ADMIN_EMAIL;
  const password=env.AGRIFLOW_OWNER_PASSWORD??env.AGRIFLOW_ADMIN_PASSWORD;
  if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!==`${project}.supabase.co`||email?.toLowerCase()!==designatedEmail||!password)throw new Error('Approved hosted owner configuration is incomplete.');
  const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email,password});
  if(signed.error||signed.data.user?.email?.toLowerCase()!==designatedEmail)throw new Error('Hosted owner sign-in failed.');
  const profile=await client.from('profiles').select('role,permissions,can_manage_admins,disabled_at').eq('id',signed.data.user.id).single();
  if(profile.error||profile.data.role!=='owner'||profile.data.disabled_at!==null||profile.data.can_manage_admins!==true||requiredPermissions.some(permission=>!profile.data.permissions.includes(permission)))throw new Error('Hosted owner profile is incomplete.');
  const overview=await client.rpc('admin_access_overview');
  const owner=overview.data?.users?.find((candidate:{id:string})=>candidate.id===signed.data.user!.id);
  if(overview.error||overview.data?.actor?.role!=='owner'||owner?.protectedOwner!==true)throw new Error('Hosted protected-owner registry confirmation failed.');
  await client.auth.signOut();
  console.log('Hosted owner Auth sign-in, protected UUID binding, role, permissions, and active status verified.');
}
main().catch(()=>{console.error('Hosted owner verification failed. No credentials were printed.');process.exitCode=1;});
