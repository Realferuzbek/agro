import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadLocalEnvironment() {
  const path=resolve(process.cwd(),'.env.local');
  if(!existsSync(path))return;
  for(const line of readFileSync(path,'utf8').split(/\r?\n/)) {
    const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if(match && !process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
}

export function assertLocalBackend() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('This script only operates on a local Supabase instance. Hosted operations require explicit deployment procedures.');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Run scripts/setup-local.ts first.');
  return {url,key};
}
