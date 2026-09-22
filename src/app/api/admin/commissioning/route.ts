import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { checkOrigin, failure, HttpError, json, readJson } from '@/lib/server/http';

export async function POST(request:Request) {
  try {
    checkOrigin(request);const {client}=await requireAdmin();
    const input=await readJson(request,z.object({deviceId:z.string().min(1).max(80)}).strict());
    const {data:device,error:deviceError}=await client.from('devices').select('*').eq('id',input.deviceId).single();
    if(deviceError)throw deviceError;if(device.mode!=='SIMULATED')throw new HttpError(400,'Physical commissioning is not available. No hardware test was performed.');
    const results={mode:'SIMULATED',physicalTestPerformed:false,steps:[
      {name:'Device identity',status:'passed',evidence:'Registered device identity found.'},
      {name:'Field binding',status:'passed',evidence:device.field_id},
      {name:'Telemetry adapter',status:'simulated',evidence:'Deterministic simulator adapter.'},
      {name:'Valve, flow and pressure',status:'simulated',evidence:'Conceptual model only; verify physical equipment before enabling a live controller.'},
      {name:'Physical calibration',status:'pending',evidence:'Requires connected hardware and field commissioning.'},
    ]};
    const {data,error}=await client.rpc('admin_mutate_configuration',{p_action:'commissioning.create',p_payload:{deviceId:input.deviceId,results}});
    if(error)throw error;return json({commissioning:data},201);
  }catch(error){return failure(error);}
}
