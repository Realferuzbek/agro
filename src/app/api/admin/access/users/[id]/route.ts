import { z } from 'zod';
import { requireAdminManager } from '@/lib/server/auth';
import { accessChangeSchema } from '@/lib/server/access-contracts';
import { checkOrigin,failure,json,readJson } from '@/lib/server/http';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){try{checkOrigin(request);const {client}=await requireAdminManager();const id=z.uuid().parse((await context.params).id);const changes=await readJson(request,accessChangeSchema);const {data,error}=await client.rpc('manage_admin_access',{p_user_id:id,p_changes:changes});if(error)throw error;return json({user:data});}catch(error){return failure(error);}}
