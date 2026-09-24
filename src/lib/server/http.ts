import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = new URL(request.url).origin;
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin || (origin !== expected && origin !== configured)) throw new HttpError(403, 'This action must be made from the Baraka Agro application.');
}

export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes = 65_536): Promise<T> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Send an application/json request.');
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Request body must contain valid JSON.'); }
  return schema.parse(body);
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: 'Some values are invalid.', issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) }, 400);
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === '40001') return json({ error: 'The field changed. Refresh its state and try again.' }, 409);
    if (code === '42501') return json({ error: 'You are not authorized for this action.' }, 403);
    if (code === '23505') return json({ error: 'This identifier or version already exists.' }, 409);
    if (code === '22023') return json({ error: 'The request conflicts with the current configuration or a previous event.' }, 409);
    if (code === 'P0002') return json({ error: 'The requested record was not found.' }, 404);
    if (code === 'P0001') return json({ error: 'Device request limit reached. Try again shortly.' }, 429);
  }
  // Never expose provider exceptions, SQL, credential values, or raw request bodies.
  return json({ error: 'The backend is unavailable. Please try again shortly.' }, 503);
}
