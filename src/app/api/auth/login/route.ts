import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkOrigin, failure, HttpError, json, readJson } from '@/lib/server/http';
import { readSession } from '@/lib/server/auth';

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = await readJson(request, z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).strict());
    const client = await createServerSupabaseClient();
    if (!client) throw new HttpError(503, 'Supabase is not configured.');
    const { error } = await client.auth.signInWithPassword(input);
    if (error) throw new HttpError(401, 'The email or password is incorrect.');
    const { isAdmin, user } = await readSession();
    if (!isAdmin) { await client.auth.signOut(); throw new HttpError(403, 'This account does not have administrator access.'); }
    return json({ isAdmin, user: user ? { email: user.email } : null });
  } catch (error) { return failure(error); }
}
