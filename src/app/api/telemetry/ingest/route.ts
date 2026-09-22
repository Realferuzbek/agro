import { createHash } from 'node:crypto';
import { createServiceClient } from '@/lib/server/service-client';
import { telemetrySchema,validateTelemetryQuality } from '@/lib/server/telemetry-contract';
import { failure,HttpError,json,readJson } from '@/lib/server/http';
import { applyMeasuredObservation } from '@/lib/server/telemetry-model';
import type { SimulationState } from '@/domain/types';

export const runtime='nodejs';

export async function POST(request:Request) {
  try {
    const token=request.headers.get('authorization')?.match(/^Bearer (agf_[A-Za-z0-9_-]{43})$/)?.[1];
    if(!token)throw new HttpError(401,'A valid device credential is required.');
    const client=createServiceClient();
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const {data:credential,error:credentialError}=await client.from('device_credentials').select('id,device_id,expires_at,revoked_at').eq('token_hash',tokenHash).maybeSingle();
    if(credentialError)throw credentialError;
    if(!credential||credential.revoked_at||(credential.expires_at&&Date.parse(credential.expires_at)<=Date.now()))throw new HttpError(401,'A valid device credential is required.');
    const input=await readJson(request,telemetrySchema);
    if(input.deviceId!==credential.device_id)throw new HttpError(403,'The credential does not authorize this device.');
    const {data:device,error:deviceError}=await client.from('devices').select('*').eq('id',credential.device_id).single();
    if(deviceError)throw deviceError;
    if(!device.enabled)throw new HttpError(403,'This device is disabled.');
    if(device.mode!=='MEASURED')throw new HttpError(409,'Register a measured device for ingestion. Simulator identities cannot submit measured telemetry.');
    let quality:'valid'|'outlier'|'stale'|'conflict';
    try {quality=validateTelemetryQuality(input,device.kind,Date.now());}catch(error){throw new HttpError(400,error instanceof Error?error.message:'Invalid telemetry.');}
    const normalized=Object.fromEntries(input.measurements.map(measurement=>[measurement.metric,{...measurement,provenance:'MEASURED',sourceId:device.id,measuredAt:input.observedAt,quality}]));
    const contentHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    let nextState:SimulationState|null=null;let expectedRevision:number|null=null;let expectedLatestAt:string|null=null;
    if(quality==='valid'&&device.configuration?.fieldModelApproved===true) {
      const [{data:field,error:fieldError},{data:current,error:stateError},{data:latest,error:latestError}]=await Promise.all([
        client.from('fields').select('settings').eq('id',device.field_id).single(),
        client.from('product_state').select('state,revision').eq('field_id',device.field_id).maybeSingle(),
        client.from('device_latest_state').select('measurements,observed_at').eq('device_id',device.id).maybeSingle(),
      ]);
      if(fieldError||stateError||latestError)throw fieldError??stateError??latestError;
      if(field?.settings?.dataMode==='MEASURED'&&current&&(!latest||Date.parse(input.observedAt)>=Date.parse(latest.observed_at))) {
        nextState=applyMeasuredObservation(current.state as SimulationState,input,device,latest?.measurements??null);expectedRevision=Number(current.revision);expectedLatestAt=latest?.observed_at??null;
      }
    }
    const {data,error}=await client.rpc('ingest_and_recalculate',{p_credential_id:credential.id,p_device_id:device.id,p_event_id:input.eventId,p_content_hash:contentHash,p_observed_at:input.observedAt,p_quality:quality,p_measurements:normalized,p_raw_payload:input.rawPayload??null,p_expected_revision:expectedRevision,p_next_state:nextState,p_calculation:nextState?{recommendation:nextState.recommendation,soil:nextState.soil,accounting:nextState.accounting}:null,p_expected_latest_at:expectedLatestAt});
    if(error)throw error;
    return json({...data,provenance:'MEASURED',controlApplied:false,message:data.fieldModelUpdated?'Observed data updated the field model and recommendation. No hardware command was issued.':'Telemetry stored and validated. Field assimilation requires a commissioned binding and a matching model day.'},data.duplicate?200:201);
  }catch(error){return failure(error);}
}
