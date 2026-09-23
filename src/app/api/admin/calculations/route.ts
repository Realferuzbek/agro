import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { failure, json } from '@/lib/server/http';
import { DEMO_FIELD_ID } from '@/lib/supabase/config';

export async function GET(request:Request) {
  try {
    const {client}=await requireAdmin('audit.read');const params=new URL(request.url).searchParams;
    const limit=z.coerce.number().int().min(1).max(100).parse(params.get('limit')??20);
    let query=client.from('calculation_runs').select('*').eq('field_id',DEMO_FIELD_ID).order('created_at',{ascending:false}).limit(limit);
    if(params.get('id'))query=query.eq('id',z.uuid().parse(params.get('id')));
    const {data,error}=await query;if(error)throw error;return json({calculations:data});
  }catch(error){return failure(error);}
}
