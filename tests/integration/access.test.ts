import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes,randomUUID } from 'node:crypto';
import { loadLocalEnvironment } from '../../scripts/env';

loadLocalEnvironment();
const enabled=process.env.AGRIFLOW_INTEGRATION_TESTS==='1';
const all=['simulation.manage','devices.manage','parameters.manage','audit.read'];
type Identity={id:string;email:string;client:SupabaseClient};
let service:SupabaseClient;let anon:SupabaseClient;let owner:SupabaseClient;let ownerId:string;
let manager:Identity;let ordinary:Identity;let limited:Identity;let target:Identity;let secondOwner:Identity;
const ids:string[]=[];

async function identity():Promise<Identity>{
  const email=`access-${randomUUID()}@agriflow.test`,password=randomBytes(24).toString('base64url');
  const result=await service.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull();const id=result.data.user!.id;ids.push(id);
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();return {id,email,client};
}
function update(actor:SupabaseClient,id:string,changes:Record<string,unknown>){return actor.rpc('manage_admin_access',{p_user_id:id,p_changes:changes});}
function request(actor:SupabaseClient,email:string,role='admin',permissions:string[]=[],canManageAdmins=false){return actor.rpc('request_admin_invitation',{p_email:email,p_role:role,p_permissions:permissions,p_can_manage_admins:canManageAdmins});}

describe.skipIf(!enabled)('owner invariants, capability enforcement and audited access grants',()=>{
  beforeAll(async()=>{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Access tests require local Supabase.');
    const options={auth:{persistSession:false,autoRefreshToken:false}};
    service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);anon=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);owner=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
    const signed=await owner.auth.signInWithPassword({email:process.env.AGRIFLOW_ADMIN_EMAIL!,password:process.env.AGRIFLOW_ADMIN_PASSWORD!});expect(signed.error).toBeNull();ownerId=signed.data.user!.id;
    const profile=await owner.from('profiles').select('role').eq('id',ownerId).single();expect(profile.data?.role).toBe('owner');
    manager=await identity();ordinary=await identity();limited=await identity();target=await identity();secondOwner=await identity();
    expect((await update(owner,manager.id,{role:'admin',permissions:['devices.manage'],canManageAdmins:true})).error).toBeNull();
    expect((await update(owner,ordinary.id,{role:'admin',permissions:all})).error).toBeNull();
    expect((await update(owner,limited.id,{role:'admin',permissions:[]})).error).toBeNull();
  },60_000);
  afterAll(async()=>{
    if(!service||!ids.length)return;
    if(secondOwner)await update(owner,secondOwner.id,{role:'farmer',disabled:false});
    await service.from('admin_invitations').delete().in('requested_by',ids);
    await service.from('admin_invitations').delete().in('target_user_id',ids);
    await service.from('audit_logs').delete().in('actor_id',ids);
    await service.from('audit_logs').delete().in('entity_id',ids);
    for(const id of ids){const deleted=await service.auth.admin.deleteUser(id);expect(deleted.error).toBeNull();}
  },60_000);

  it('binds the initial UUID idempotently and refuses replacement or public bootstrap/recovery',async()=>{
    const same=await service.rpc('bootstrap_initial_owner',{p_user_id:ownerId});expect(same.error).toBeNull();expect(same.data.alreadyBound).toBe(true);
    expect((await service.rpc('bootstrap_initial_owner',{p_user_id:ordinary.id})).error?.code).toBe('42501');
    for(const client of [anon,ordinary.client,owner]){
      expect((await client.rpc('bootstrap_initial_owner',{p_user_id:ordinary.id})).error).not.toBeNull();
      expect((await client.rpc('record_owner_recovery',{p_user_id:ownerId})).error).not.toBeNull();
    }
    expect((await service.rpc('record_owner_recovery',{p_user_id:ordinary.id})).error?.code).toBe('42501');
  });
  it('exposes safe account metadata only to explicit access managers',async()=>{
    expect((await anon.rpc('admin_access_overview')).error).not.toBeNull();
    expect((await ordinary.client.rpc('admin_access_overview')).error?.code).toBe('42501');
    const result=await manager.client.rpc('admin_access_overview');expect(result.error).toBeNull();
    const initial=result.data.users.find((user:{id:string})=>user.id===ownerId);expect(initial.protectedOwner).toBe(true);
    expect(JSON.stringify(result.data)).not.toMatch(/encrypted_password|access_token|service_role|token_hash/);
  });
  it('prevents direct service-role grants as well as browser self-promotion',async()=>{
    expect((await service.from('profiles').update({role:'owner'}).eq('id',ordinary.id)).error?.code).toBe('42501');
    expect((await ordinary.client.from('profiles').update({role:'owner'}).eq('id',ordinary.id)).error).not.toBeNull();
    expect((await update(ordinary.client,target.id,{role:'admin'})).error?.code).toBe('42501');
    expect((await update(manager.client,manager.id,{permissions:all})).error?.code).toBe('42501');
    expect((await request(manager.client,manager.email,'admin',['devices.manage'],true)).error?.code).toBe('42501');
  });
  it('allows a manager to delegate only permissions it already possesses',async()=>{
    expect((await update(manager.client,target.id,{role:'admin',permissions:['devices.manage']})).error).toBeNull();
    expect((await update(manager.client,target.id,{permissions:['simulation.manage']})).error?.code).toBe('42501');
    expect((await update(manager.client,target.id,{role:'owner'})).error?.code).toBe('42501');
    expect((await request(manager.client,target.email,'owner')).error?.code).toBe('42501');
    expect((await request(manager.client,target.email,'admin',['audit.read'])).error?.code).toBe('42501');
  });
  it('enforces operational scopes inside database RPCs and RLS',async()=>{
    expect((await limited.client.rpc('commit_simulation_state',{p_field_id:'00000000-0000-4000-8000-000000000002',p_expected_revision:-1,p_idempotency_key:randomUUID(),p_request_hash:'scope-denial',p_action:'test',p_state:{},p_bundle:{}})).error?.code).toBe('42501');
    for(const action of ['device.upsert','credential.revoke','parameter.create','alert.resolve'])expect((await limited.client.rpc('admin_mutate_configuration',{p_action:action,p_payload:{}})).error?.code).toBe('42501');
    expect((await limited.client.rpc('admin_credential_metadata',{p_device_id:'rain-01'})).error?.code).toBe('42501');
    expect((await limited.client.from('audit_logs').select('id')).data).toEqual([]);
    expect((await limited.client.from('telemetry').select('id')).data).toEqual([]);
    expect((await limited.client.from('simulation_controls').select('field_id')).data).toEqual([]);
    expect((await manager.client.rpc('admin_credential_metadata',{p_device_id:'rain-01'})).error).toBeNull();
  });
  it('protects the permanent owner and the last active ownership from revocation',async()=>{
    for(const actor of [owner,ordinary.client,manager.client])for(const changes of [{role:'admin'},{role:'farmer'},{disabled:true},{permissions:[]}])expect((await update(actor,ownerId,changes)).error?.code).toBe('42501');
    expect((await service.from('profiles').delete().eq('id',ownerId)).error?.code).toBe('42501');
    const result=await owner.from('profiles').select('role,disabled_at').eq('id',ownerId).single();expect(result.data).toEqual({role:'owner',disabled_at:null});
  });
  it('blocks privileged Auth deletion, bans and email replacement of an owner',async()=>{
    expect((await service.auth.admin.deleteUser(ownerId)).error).not.toBeNull();
    expect((await service.auth.admin.updateUserById(ownerId,{ban_duration:'24h'})).error).not.toBeNull();
    expect((await service.auth.admin.updateUserById(ownerId,{email:`hijack-${randomUUID()}@agriflow.test`})).error).not.toBeNull();
    expect((await service.auth.admin.getUserById(ownerId)).data.user?.email).toBe(process.env.AGRIFLOW_ADMIN_EMAIL);
  });
  it('lets only an owner grant and revoke another nonprotected owner',async()=>{
    expect((await update(owner,secondOwner.id,{role:'owner'})).error).toBeNull();
    for(const changes of [{role:'farmer'},{disabled:true},{permissions:[]},{canManageAdmins:false}])expect((await update(manager.client,secondOwner.id,changes)).error?.code).toBe('42501');
    expect((await service.auth.admin.deleteUser(secondOwner.id)).error).not.toBeNull();
    expect((await request(manager.client,secondOwner.email)).error?.code).toBe('42501');
    expect((await update(owner,secondOwner.id,{role:'admin',permissions:[],canManageAdmins:false})).error).toBeNull();
  });
  it('immediately withdraws disabled administrator powers from an existing JWT',async()=>{
    expect((await update(owner,manager.id,{disabled:true})).error).toBeNull();
    expect((await manager.client.rpc('admin_access_overview')).error?.code).toBe('42501');
    expect((await manager.client.rpc('admin_credential_metadata',{p_device_id:'rain-01'})).error?.code).toBe('42501');
    expect((await update(owner,manager.id,{disabled:false})).error).toBeNull();
  });
  it('completes an existing-user grant only through the server and records its actor',async()=>{
    const pending=await request(manager.client,target.email,'admin',['devices.manage']);expect(pending.error).toBeNull();
    const args={p_invitation_id:pending.data.id,p_user_id:target.id,p_error_code:null};
    expect((await manager.client.rpc('finish_admin_invitation',args)).error).not.toBeNull();
    const result=await service.rpc('finish_admin_invitation',args);expect(result.error).toBeNull();expect(result.data.status).toBe('added');
    const duplicate=await service.rpc('finish_admin_invitation',args);expect(duplicate.data.duplicate).toBe(true);
    const logs=await service.from('audit_logs').select('actor_id,action').eq('entity_id',target.id).eq('action','access.invitation.granted');expect(logs.data?.[0]?.actor_id).toBe(manager.id);
  });
  it('rechecks requester capabilities after Auth onboarding and rejects mismatched recipients',async()=>{
    const pending=await request(manager.client,target.email,'admin',['devices.manage']);expect(pending.error).toBeNull();
    expect((await service.rpc('finish_admin_invitation',{p_invitation_id:pending.data.id,p_user_id:limited.id})).error?.code).toBe('42501');
    expect((await update(owner,manager.id,{canManageAdmins:false})).error).toBeNull();
    const result=await service.rpc('finish_admin_invitation',{p_invitation_id:pending.data.id,p_user_id:target.id});expect(result.error).toBeNull();expect(result.data.status).toBe('failed');
    expect((await update(owner,manager.id,{canManageAdmins:true})).error).toBeNull();
  });
  it('grants a new confirmed identity from an audited pending request without sending test email',async()=>{
    const created=await identity();const pending=await request(owner,created.email,'admin',['audit.read']);expect(pending.error).toBeNull();
    const result=await service.rpc('finish_admin_invitation',{p_invitation_id:pending.data.id,p_user_id:created.id});expect(result.error).toBeNull();
    const profile=await created.client.from('profiles').select('role,permissions').eq('id',created.id).single();expect(profile.data).toEqual({role:'admin',permissions:['audit.read']});
    expect((await created.client.from('audit_logs').select('id').limit(1)).data).toHaveLength(1);
  });
});
