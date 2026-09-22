import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HttpError } from './http';

export async function readSession() {
  const client = await createServerSupabaseClient();
  if (!client) return { isAdmin: false, user: null, client: null };
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) return { isAdmin: false, user: null, client };
  const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('id', data.claims.sub).maybeSingle();
  return { client, isAdmin: !profileError && profile?.role === 'admin', user: { id: data.claims.sub, email: String(data.claims.email ?? '') } };
}

export async function requireAdmin() {
  const session = await readSession();
  if (!session.client) throw new HttpError(503, 'Supabase is not configured.');
  if (!session.user) throw new HttpError(401, 'Sign in to access administration.');
  if (!session.isAdmin) throw new HttpError(403, 'An administrator account is required.');
  return { client: session.client, user: session.user };
}
