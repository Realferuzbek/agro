import { requireAdmin } from '@/lib/server/auth';
import { simulationMutationSchema } from '@/lib/server/admin-contracts';
import { mutateSimulation } from '@/lib/server/simulation';
import { checkOrigin, failure, json, readJson } from '@/lib/server/http';

export async function POST(request: Request) {
  try { checkOrigin(request); const { client } = await requireAdmin(); const input = await readJson(request, simulationMutationSchema); return json(await mutateSimulation(client, input)); }
  catch (error) { return failure(error); }
}
