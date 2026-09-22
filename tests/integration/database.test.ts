import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { createSimulation } from '@/domain';
import type { SimulationState } from '@/domain/types';
import { telemetrySchema } from '@/lib/server/telemetry-contract';
import { applyMeasuredObservation } from '@/lib/server/telemetry-model';
import { loadLocalEnvironment } from '../../scripts/env';

vi.mock('server-only',()=>({}));
import { POST as ingest } from '@/app/api/telemetry/ingest/route';

loadLocalEnvironment();
const enabled=process.env.AGRIFLOW_INTEGRATION_TESTS==='1';
const digest=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fields:string[]=[];const farms:string[]=[];const users:string[]=[];const devices:string[]=[];
let service:SupabaseClient;let anonymous:SupabaseClient;let admin:SupabaseClient;let farmer:SupabaseClient;let adminId:string;let farmerId:string;

async function createField(isPublic=false,measured=false) {
  const farmId=randomUUID(),fieldId=randomUUID();farms.push(farmId);fields.push(fieldId);
  const farm=await service.from('farms').insert({id:farmId,name:'Integration test farm',region:'Test',is_public_demo:isPublic});expect(farm.error).toBeNull();
  const field=await service.from('fields').insert({id:fieldId,farm_id:farmId,name:'Integration test field',area_m2:10000,settings:measured?{dataMode:'MEASURED'}:{}});expect(field.error).toBeNull();
  const state=createSimulation();state.id=randomUUID();state.field.id=fieldId;
  // Test-only independent field: no real public demonstration records are changed.
  if(measured){state.clock=new Date().toISOString();state.rain.windowEnd=state.clock;}
  state.devices=[];
  const row=await service.from('product_state').insert({field_id:fieldId,state,revision:0});expect(row.error).toBeNull();
  return {fieldId,state};
}
async function createDevice(fieldId:string,kind='rain',approved=false) {
  const id=`test-${randomUUID()}`;devices.push(id);
  const row=await service.from('devices').insert({id,field_id:fieldId,name:'Integration test sensor',kind,mode:'MEASURED',configuration:{fieldModelApproved:approved}});expect(row.error).toBeNull();
  const token=`agf_${randomBytes(32).toString('base64url')}`;
  const credential=await service.from('device_credentials').insert({device_id:id,token_hash:digest(token),token_prefix:token.slice(0,12)}).select('id').single();expect(credential.error).toBeNull();
  return {id,token,credentialId:credential.data!.id};
}
function commit(client:SupabaseClient,fieldId:string,state:SimulationState,expected=0,key=randomUUID(),hash='request-one',bundle:unknown={}) {
  return client.rpc('commit_simulation_state',{p_field_id:fieldId,p_expected_revision:expected,p_idempotency_key:key,p_request_hash:hash,p_action:'integration.test',p_state:state,p_bundle:bundle});
}
function envelope(deviceId:string,overrides:Record<string,unknown>={}) {
  return {version:1,deviceId,eventId:randomUUID(),observedAt:new Date().toISOString(),measurements:[{metric:'rainfallIncrementMm',value:2,unit:'mm'}],...overrides};
}
async function send(token:string,body:unknown) {
  return ingest(new Request('http://localhost/api/telemetry/ingest',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)}));
}

describe.skipIf(!enabled)('real PostgreSQL, Supabase Auth, RLS and ingestion',()=>{
  beforeAll(async()=>{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Integration tests require the local Supabase stack.');
    const options={auth:{persistSession:false,autoRefreshToken:false}};
    service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);anonymous=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
    async function identity(role:'admin'|'farmer'){
      const email=`test-${randomUUID()}@agriflow.test`,password=randomBytes(24).toString('base64url');
      const created=await service.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();
      const userId=created.data.user!.id;users.push(userId);
      const promoted=await service.from('profiles').update({role}).eq('id',userId);expect(promoted.error).toBeNull();
      const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
      const signed=await client.auth.signInWithPassword({email,password});expect(signed.error).toBeNull();return {client,userId};
    }
    const a=await identity('admin');admin=a.client;adminId=a.userId;
    const f=await identity('farmer');farmer=f.client;farmerId=f.userId;
  },60_000);

  afterAll(async()=>{
    if(!service)return;
    // Every cleanup predicate is scoped to this suite's generated IDs.
    if(devices.length)await service.from('device_credentials').delete().in('device_id',devices);
    if(fields.length){
      for(const table of ['state_mutations','simulation_controls','recommendations','calculation_runs','telemetry','device_latest_state','weather_observations','weather_forecasts','irrigation_runs','alerts','simulation_events','commissioning_runs','product_state'])await service.from(table).delete().in('field_id',fields);
      await service.from('devices').delete().in('field_id',fields);await service.from('fields').delete().in('id',fields);
      await service.from('audit_logs').delete().in('entity_id',fields);
    }
    if(farms.length)await service.from('farms').delete().in('id',farms);
    if(users.length){await service.from('audit_logs').delete().in('actor_id',users);for(const id of users)await service.auth.admin.deleteUser(id);}
  },60_000);

  it('publishes only explicitly public farm data and denies raw/admin tables',async()=>{
    const shared=await createField(true),privateField=await createField();
    expect((await anonymous.from('product_state').select('field_id').eq('field_id',shared.fieldId)).data).toHaveLength(1);
    expect((await anonymous.from('product_state').select('field_id').eq('field_id',privateField.fieldId)).data).toHaveLength(0);
    expect((await anonymous.from('telemetry').select('*')).error).not.toBeNull();
    expect((await anonymous.from('audit_logs').select('*')).error).not.toBeNull();
    expect((await anonymous.from('device_credentials').select('*')).error).not.toBeNull();
  });
  it('denies public mutations and prevents farmer role escalation',async()=>{
    const {fieldId,state}=await createField(true);
    expect((await anonymous.from('product_state').update({revision:99}).eq('field_id',fieldId)).error).not.toBeNull();
    expect((await farmer.from('profiles').update({role:'admin'}).eq('id',farmerId)).error).not.toBeNull();
    expect((await farmer.from('profiles').select('role').eq('id',farmerId).single()).data?.role).toBe('farmer');
    expect((await commit(anonymous,fieldId,state)).error).not.toBeNull();
    expect((await commit(farmer,fieldId,state)).error?.code).toBe('42501');
    expect((await admin.from('product_state').update({revision:99}).eq('field_id',fieldId)).error).not.toBeNull();
  });
  it('commits authorized state, calculation, recommendation and audit together',async()=>{
    const {fieldId,state}=await createField();state.version+=1;
    const bundle={calculation:{engineVersion:state.calculation.engineVersion,parameterVersion:state.calculation.parameterVersion,inputs:{weather:state.weather,currentSoil:state.soil},outputs:{recommendation:state.recommendation}},simulationControl:{status:'running',speed:10}};
    const result=await commit(admin,fieldId,state,0,randomUUID(),'authorized',bundle);expect(result.error).toBeNull();expect(result.data.revision).toBe(1);
    expect((await service.from('calculation_runs').select('id').eq('field_id',fieldId)).data).toHaveLength(1);
    expect((await service.from('recommendations').select('id').eq('field_id',fieldId)).data).toHaveLength(1);
    expect((await service.from('audit_logs').select('actor_id').eq('entity_id',fieldId)).data?.[0].actor_id).toBe(adminId);
    expect((await admin.from('simulation_controls').select('speed').eq('field_id',fieldId).single()).data?.speed).toBe(10);
  });
  it('deduplicates mutations and rejects reused keys with altered requests',async()=>{
    const {fieldId,state}=await createField(),key=randomUUID();
    expect((await commit(admin,fieldId,state,0,key)).error).toBeNull();
    const replay=await commit(admin,fieldId,state,0,key);expect(replay.error).toBeNull();expect(replay.data.duplicate).toBe(true);expect(replay.data.revision).toBe(1);
    expect((await commit(admin,fieldId,state,1,key,'changed')).error?.code).toBe('22023');
  });
  it('serializes concurrent compare-and-swap updates without lost state',async()=>{
    const {fieldId,state}=await createField();
    const results=await Promise.all([commit(admin,fieldId,state),commit(admin,fieldId,state)]);
    expect(results.filter(result=>!result.error)).toHaveLength(1);expect(results.find(result=>result.error)?.error?.code).toBe('40001');
    expect((await service.from('product_state').select('revision').eq('field_id',fieldId).single()).data?.revision).toBe(1);
  });
  it('rolls back the entire mutation when any persisted event is invalid',async()=>{
    const {fieldId,state}=await createField();
    const result=await commit(admin,fieldId,state,0,randomUUID(),'invalid-event',{telemetry:[{deviceId:'nonexistent-integration-device',eventId:'invalid',hash:'invalid',at:state.clock,quality:'valid',measurements:{}}]});
    expect(result.error).not.toBeNull();
    expect((await service.from('product_state').select('revision').eq('field_id',fieldId).single()).data?.revision).toBe(0);
    expect((await service.from('state_mutations').select('*').eq('field_id',fieldId)).data).toHaveLength(0);
  });
  it('database constraints prevent forecast values becoming observations',async()=>{
    const {fieldId}=await createField();
    const result=await service.from('weather_observations').insert({field_id:fieldId,observed_at:new Date().toISOString(),source_id:'forecast-test',provenance:'FORECAST',data:{rainfallMm:7}});
    expect(result.error?.code).toBe('23514');
  });
  it('credentials are scoped, hashed, private and revocable',async()=>{
    const {fieldId}=await createField(),a=await createDevice(fieldId),b=await createDevice(fieldId);
    expect((await send(a.token,envelope(b.id))).status).toBe(403);
    const hidden=await admin.from('device_credentials').select('*');expect(hidden.error).not.toBeNull();
    const stored=await service.from('device_credentials').select('token_hash').eq('id',a.credentialId).single();expect(stored.data?.token_hash).toBe(digest(a.token));expect(stored.data?.token_hash).not.toContain(a.token);
    const metadata=await admin.rpc('admin_credential_metadata',{p_device_id:a.id});expect(metadata.error).toBeNull();expect(JSON.stringify(metadata.data)).not.toContain(a.token);expect(JSON.stringify(metadata.data)).not.toContain('token_hash');
    expect((await admin.rpc('admin_mutate_configuration',{p_action:'credential.revoke',p_payload:{id:a.credentialId}})).error).toBeNull();
    expect((await send(a.token,envelope(a.id))).status).toBe(401);
  });
  it('validates units, device kind, timestamps, body limits and protected provenance',async()=>{
    const {fieldId}=await createField(),device=await createDevice(fieldId);
    expect((await send(device.token,envelope(device.id,{measurements:[{metric:'rainfallIncrementMm',value:2,unit:'liters'}]}))).status).toBe(400);
    expect((await send(device.token,envelope(device.id,{measurements:[{metric:'flowM3h',value:2,unit:'m³/h'}]}))).status).toBe(400);
    expect((await send(device.token,envelope(device.id,{provenance:'SIMULATED'}))).status).toBe(400);
    expect((await send(device.token,envelope(device.id,{observedAt:new Date(Date.now()+600_000).toISOString()}))).status).toBe(400);
    expect((await send(device.token,envelope(device.id,{rawPayload:{oversize:'x'.repeat(70_000)}}))).status).toBe(413);
  });
  it('persists normalized provenance and deduplicates telemetry across credentials',async()=>{
    const {fieldId}=await createField(),device=await createDevice(fieldId),body=envelope(device.id);
    const token2=`agf_${randomBytes(32).toString('base64url')}`;
    expect((await service.from('device_credentials').insert({device_id:device.id,token_hash:digest(token2),token_prefix:token2.slice(0,12)})).error).toBeNull();
    const responses=await Promise.all([send(device.token,body),send(token2,body)]);
    expect(responses.map(response=>response.status).sort()).toEqual([200,201]);
    const rows=await service.from('telemetry').select('normalized,provenance').eq('device_id',device.id);expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0].normalized.rainfallIncrementMm).toMatchObject({value:2,unit:'mm',sourceId:device.id,provenance:'MEASURED',quality:'valid'});
    expect((await send(device.token,{...body,measurements:[{metric:'rainfallIncrementMm',value:3,unit:'mm'}]})).status).toBe(409);
  });
  it('quarantines outliers and never regresses latest state for stale/out-of-order data',async()=>{
    const {fieldId}=await createField(),device=await createDevice(fieldId,'soil');
    const valid=envelope(device.id,{measurements:[{metric:'soilMoisturePct',value:24.4,unit:'%'}]});expect((await send(device.token,valid)).status).toBe(201);
    const outlier=await send(device.token,envelope(device.id,{measurements:[{metric:'soilMoisturePct',value:97.8,unit:'%'}]}));expect((await outlier.json()).quality).toBe('outlier');
    const older=envelope(device.id,{observedAt:new Date(Date.now()-60_000).toISOString(),measurements:[{metric:'soilMoisturePct',value:20,unit:'%'}]});expect((await send(device.token,older)).status).toBe(201);
    const latest=await service.from('device_latest_state').select('measurements').eq('device_id',device.id).single();expect(latest.data?.measurements.soilMoisturePct.value).toBe(24.4);
    const alerts=await service.from('alerts').select('type').eq('field_id',fieldId);expect(alerts.data?.some(alert=>alert.type==='SENSOR_OUTLIER')).toBe(true);
    const stale=await send(device.token,envelope(device.id,{observedAt:new Date(Date.now()-48*3600_000).toISOString(),measurements:[{metric:'soilMoisturePct',value:22,unit:'%'}]}));expect((await stale.json()).quality).toBe('stale');
  });
  it('keeps public simulated state isolated from measured telemetry',async()=>{
    const {fieldId,state}=await createField(true),device=await createDevice(fieldId,'rain',true);
    const response=await send(device.token,envelope(device.id));expect(response.status).toBe(201);expect((await response.json()).fieldModelUpdated).toBe(false);
    const latest=await service.from('product_state').select('state,revision').eq('field_id',fieldId).single();expect(latest.data?.revision).toBe(0);expect(latest.data?.state.soil).toEqual(state.soil);
  });
  it('atomically applies commissioned observed rainfall once and recalculates without charging ET',async()=>{
    const {fieldId,state}=await createField(false,true),device=await createDevice(fieldId,'rain',true),body=envelope(device.id);
    const response=await send(device.token,body);expect(response.status).toBe(201);expect((await response.json()).fieldModelUpdated).toBe(true);
    const latest=await service.from('product_state').select('state,revision').eq('field_id',fieldId).single();
    expect(latest.data?.revision).toBe(1);expect(latest.data?.state.soil.rootZoneDepletionMm).toBeCloseTo(state.soil.rootZoneDepletionMm-2,8);
    expect(latest.data?.state.rain.observedMm).toBe(state.rain.observedMm+2);expect(latest.data?.state.accounting.appliedEtMm).toBe(state.accounting.appliedEtMm);
    expect(latest.data?.state.recommendation.grossVolumeLiters).toBeLessThan(state.recommendation.grossVolumeLiters);
    expect((await send(device.token,body)).status).toBe(200);
    expect((await service.from('product_state').select('revision').eq('field_id',fieldId).single()).data?.revision).toBe(1);
    expect((await service.from('calculation_runs').select('id').eq('field_id',fieldId)).data).toHaveLength(1);
  });
  it('cumulative rain establishes a baseline and charges only monotonic deltas',async()=>{
    const {fieldId,state}=await createField(false,true),device=await createDevice(fieldId,'rain',true);
    for(const value of [100,102,1])expect((await send(device.token,envelope(device.id,{measurements:[{metric:'rainfallCumulativeMm',value,unit:'mm'}]}))).status).toBe(201);
    const latest=await service.from('product_state').select('state').eq('field_id',fieldId).single();expect(latest.data?.state.rain.observedMm).toBe(state.rain.observedMm+2);
  });
  it('a flow reading changes neither delivered volume nor root-zone water',async()=>{
    const {fieldId,state}=await createField(false,true),device=await createDevice(fieldId,'flow',true);
    const response=await send(device.token,envelope(device.id,{measurements:[{metric:'flowM3h',value:10.3,unit:'m³/h'}]}));expect(response.status).toBe(201);
    const latest=await service.from('product_state').select('state').eq('field_id',fieldId).single();expect(latest.data?.state.control.deliveredVolumeLiters).toBe(state.control.deliveredVolumeLiters);expect(latest.data?.state.soil.rootZoneDepletionMm).toBe(state.soil.rootZoneDepletionMm);
    expect(latest.data?.state.recommendation.confidence).toBe('Degraded');
    expect((await service.from('alerts').select('type').eq('field_id',fieldId)).data?.some(alert=>alert.type==='TELEMETRY_CONFLICT')).toBe(true);
  });
  it('a stale commissioned CAS rolls back both telemetry and field changes',async()=>{
    const {fieldId,state}=await createField(false,true),device=await createDevice(fieldId,'rain',true);
    const input=telemetrySchema.parse(envelope(device.id));const next=applyMeasuredObservation(state,input,{id:device.id,name:'Rain',kind:'rain'},null);
    const response=await service.rpc('ingest_and_recalculate',{p_credential_id:device.credentialId,p_device_id:device.id,p_event_id:input.eventId,p_content_hash:'stale-cas',p_observed_at:input.observedAt,p_quality:'valid',p_measurements:{rainfallIncrementMm:{value:2}},p_expected_revision:99,p_next_state:next,p_calculation:{}});
    expect(response.error?.code).toBe('40001');
    expect((await service.from('telemetry').select('id').eq('device_id',device.id)).data).toHaveLength(0);
    expect((await service.from('product_state').select('revision').eq('field_id',fieldId).single()).data?.revision).toBe(0);
  });
});
