import { createClient } from '@supabase/supabase-js';
import { randomBytes,randomUUID } from 'node:crypto';
import { hostedEnvironment } from './hosted-env';

async function main(){
  const env=hostedEnvironment();
  const ownerEmail=env.BARAKA_OWNER_EMAIL??env.BARAKA_ADMIN_EMAIL;
  const ownerPassword=env.BARAKA_OWNER_PASSWORD??env.BARAKA_ADMIN_PASSWORD;
  if(env.SUPABASE_PROJECT_REF!=='gunzhtlbpxwpprqwnhfd'||ownerEmail?.toLowerCase()!=='iamrealferuzbek@gmail.com'||!ownerPassword)throw new Error('Approved hosted access configuration is incomplete.');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
  const owner=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
  const ownerSignIn=await owner.auth.signInWithPassword({email:ownerEmail,password:ownerPassword});
  if(ownerSignIn.error||!ownerSignIn.data.user)throw new Error('Owner authentication failed.');
  const email=`access-verification-${randomUUID()}@barakaagro.test`,password=randomBytes(36).toString('base64url');
  const created=await service.auth.admin.createUser({email,password,email_confirm:true});
  if(created.error||!created.data.user)throw new Error('Disposable verification identity could not be created.');
  const userId=created.data.user.id;
  try{
    const granted=await owner.rpc('manage_admin_access',{p_user_id:userId,p_changes:{role:'admin',permissions:['simulation.manage','devices.manage','parameters.manage','audit.read'],canManageAdmins:true}});
    if(granted.error)throw new Error('Owner could not grant verified access.');
    const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
    const adminSignIn=await admin.auth.signInWithPassword({email,password});if(adminSignIn.error)throw new Error('Disposable admin authentication failed.');
    const ownerId=ownerSignIn.data.user.id;
    const forbidden=await admin.rpc('manage_admin_access',{p_user_id:ownerId,p_changes:{role:'admin',permissions:[],canManageAdmins:false,disabled:true}});
    if(!forbidden.error)throw new Error('A regular administrator unexpectedly changed the owner.');
    const direct=await admin.from('profiles').update({role:'farmer'}).eq('id',ownerId);
    if(!direct.error)throw new Error('A regular administrator unexpectedly bypassed the access function.');
    const stillOwner=await owner.rpc('admin_access_overview');
    const protectedOwner=stillOwner.data?.users?.find((candidate:{id:string})=>candidate.id===ownerId);
    if(stillOwner.error||stillOwner.data?.actor?.role!=='owner'||protectedOwner?.protectedOwner!==true||protectedOwner?.disabled!==false)throw new Error('Owner protection verification failed.');
    await admin.auth.signOut();
    const demoted=await owner.rpc('manage_admin_access',{p_user_id:userId,p_changes:{role:'farmer',permissions:[],canManageAdmins:false,disabled:false}});
    if(demoted.error)throw new Error('Disposable admin cleanup could not be authorized.');
    console.log('Hosted database verified: regular admins cannot demote, disable, or bypass protections on the permanent owner.');
  }finally{
    await service.auth.admin.deleteUser(userId);
    await owner.auth.signOut();
  }
}
main().catch(()=>{console.error('Hosted access-control verification failed. No credentials were printed.');process.exitCode=1;});
