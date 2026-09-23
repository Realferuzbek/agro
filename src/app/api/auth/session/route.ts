import { readSession } from '@/lib/server/auth';
import { failure, json } from '@/lib/server/http';

export async function GET() {
  try { const { isAdmin,user,role,permissions,canManageAdmins }=await readSession();return json({isAdmin,role,permissions,canManageAdmins,user:user?{id:user.id,email:user.email}:null}); }
  catch (error) { return failure(error); }
}
