import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkOrigin, failure, json } from '@/lib/server/http';

export async function POST(request: Request) {
  try { checkOrigin(request); const client = await createServerSupabaseClient(); if (client) await client.auth.signOut(); return json({ signedOut: true }); }
  catch (error) { return failure(error); }
}
