import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HttpError } from './http';

export const OPERATIONAL_PERMISSIONS=['simulation.manage','devices.manage','parameters.manage','audit.read'] as const;
export type OperationalPermission=typeof OPERATIONAL_PERMISSIONS[number];

export async function readSession() {
  const client = await createServerSupabaseClient();
  if (!client) return { isAdmin: false, user: null, client: null,role:null,permissions:[] as string[],canManageAdmins:false };
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) return { isAdmin: false, user: null, client,role:null,permissions:[] as string[],canManageAdmins:false };
  const { data: profile, error: profileError } = await client.from('profiles').select('role,permissions,can_manage_admins,disabled_at').eq('id', data.claims.sub).maybeSingle();
  const isAdmin=!profileError&&!profile?.disabled_at&&(profile?.role==='admin'||profile?.role==='owner');
  return { client,isAdmin,role:profile?.role??null,permissions:isAdmin?(profile?.role==='owner'?[...OPERATIONAL_PERMISSIONS]:profile?.permissions??[]):[] as string[],canManageAdmins:isAdmin&&(profile?.role==='owner'||profile?.can_manage_admins===true),user:{id:data.claims.sub,email:String(data.claims.email??'')} };
}

export async function requireAdmin(permission?:OperationalPermission) {
  const session = await readSession();
  if (!session.client) throw new HttpError(503, 'Supabase is not configured.');
  if (!session.user) throw new HttpError(401, 'Sign in to access administration.');
  if (!session.isAdmin) throw new HttpError(403, 'An administrator account is required.');
  if(permission&&!session.permissions.includes(permission))throw new HttpError(403,'Your account does not have permission for this operation.');
  return { client: session.client, user: session.user,role:session.role,permissions:session.permissions as string[],canManageAdmins:session.canManageAdmins };
}

export async function requireAdminManager(){const session=await requireAdmin();if(!session.canManageAdmins)throw new HttpError(403,'Administrator management permission is required.');return session;}
