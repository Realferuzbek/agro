import { requireAdmin } from '@/lib/server/auth';
import { irrigationMutationSchema } from '@/lib/server/admin-contracts';
import { mutateSimulation } from '@/lib/server/simulation';
import { checkOrigin, failure, json, readJson } from '@/lib/server/http';

export async function POST(request: Request) {
  try { checkOrigin(request); const { client } = await requireAdmin(); const input = await readJson(request, irrigationMutationSchema); return json(await mutateSimulation(client, { ...input, action: 'irrigation' })); }
  catch (error) { return failure(error); }
}
