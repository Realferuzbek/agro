import { readSession } from '@/lib/server/auth';
import { failure, json } from '@/lib/server/http';

export async function GET() {
  try { const { isAdmin, user } = await readSession(); return json({ isAdmin, user: user ? { email: user.email } : null }); }
  catch (error) { return failure(error); }
}
