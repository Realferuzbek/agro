import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { checkOrigin, failure, json, readJson } from '@/lib/server/http';

type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context) {
  try {const {client}=await requireAdmin();const {id}=await context.params;const {data,error}=await client.rpc('admin_credential_metadata',{p_device_id:id});if(error)throw error;return json({credentials:data});}
  catch(error){return failure(error);}
}
export async function POST(request:Request,context:Context) {
  try {
    checkOrigin(request);const {client}=await requireAdmin();const {id}=await context.params;
    const input=await readJson(request,z.object({expiresAt:z.iso.datetime({offset:true}).optional()}).strict());
    const token=`agf_${randomBytes(32).toString('base64url')}`;
    const {data,error}=await client.rpc('admin_mutate_configuration',{p_action:'credential.create',p_payload:{deviceId:id,tokenHash:createHash('sha256').update(token).digest('hex'),tokenPrefix:token.slice(0,12),expiresAt:input.expiresAt??null}});
    if(error)throw error;return json({credential:data,token,message:'Copy this token now. It will not be shown again.'},201);
  }catch(error){return failure(error);}
}
export async function DELETE(request:Request) {
  try {checkOrigin(request);const {client}=await requireAdmin();const input=await readJson(request,z.object({id:z.uuid()}).strict());const {data,error}=await client.rpc('admin_mutate_configuration',{p_action:'credential.revoke',p_payload:input});if(error)throw error;return json({credential:data});}
  catch(error){return failure(error);}
}
