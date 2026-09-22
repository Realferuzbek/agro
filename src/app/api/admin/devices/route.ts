import { requireAdmin } from '@/lib/server/auth';
import { deviceSchema } from '@/lib/server/admin-contracts';
import { checkOrigin, failure, json, readJson } from '@/lib/server/http';

export async function GET() {
  try { const { client } = await requireAdmin(); const {data,error}=await client.from('devices').select('*').order('name'); if(error) throw error; return json({devices:data}); }
  catch(error) { return failure(error); }
}
export async function POST(request:Request) {
  try { checkOrigin(request); const {client}=await requireAdmin(); const input=await readJson(request,deviceSchema); const {data,error}=await client.rpc('admin_mutate_configuration',{p_action:'device.upsert',p_payload:input}); if(error) throw error; return json({device:data}); }
  catch(error) { return failure(error); }
}
export const PATCH=POST;
