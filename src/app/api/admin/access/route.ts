import { requireAdminManager } from '@/lib/server/auth';
import { failure,json } from '@/lib/server/http';
export async function GET(){try{const {client}=await requireAdminManager();const {data,error}=await client.rpc('admin_access_overview');if(error)throw error;return json(data);}catch(error){return failure(error);}}
