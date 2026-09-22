import { requireAdmin } from '@/lib/server/auth';
import { parameterSchema } from '@/lib/server/admin-contracts';
import { checkOrigin, failure, json, readJson } from '@/lib/server/http';

export async function GET() {
  try {const {client}=await requireAdmin();const {data,error}=await client.from('parameter_sets').select('*').order('created_at',{ascending:false});if(error)throw error;return json({parameters:data});}
  catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {checkOrigin(request);const {client}=await requireAdmin();const input=await readJson(request,parameterSchema);const {data,error}=await client.rpc('admin_mutate_configuration',{p_action:'parameter.create',p_payload:input});if(error)throw error;return json({parameter:data},201);}
  catch(error){return failure(error);}
}
