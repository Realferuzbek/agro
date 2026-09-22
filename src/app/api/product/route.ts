import { readProductState } from '@/lib/server/product';
import { json } from '@/lib/server/http';

export async function GET() { const result = await readProductState(); return json(result, result.state ? 200 : 503); }
