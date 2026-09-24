import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target=resolve(process.cwd(),'.env.local');
const previous=existsSync(target)?readFileSync(target,'utf8'):'';
const current=Object.fromEntries(previous.split(/\r?\n/).flatMap(line=>{const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);return match?[[match[1],match[2]]]:[];}));
const repairLocal=process.argv.includes('--repair-local');
if(current.NEXT_PUBLIC_SUPABASE_URL && !['localhost','127.0.0.1','[::1]'].includes(new URL(current.NEXT_PUBLIC_SUPABASE_URL).hostname) && !repairLocal)throw new Error('Refusing to overwrite configuration for a hosted backend. Pass --repair-local only when intentionally restoring this ignored file for the running local stack.');
// Fixed executable/arguments; no user text or secrets enter a shell command.
const stdout=execFileSync(process.execPath,[resolve(process.cwd(),'node_modules/supabase/dist/supabase.js'),'status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const status=JSON.parse(stdout) as Record<string,string>;
const settings={...current,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,NEXT_PUBLIC_SITE_URL:repairLocal?'http://127.0.0.1:3000':current.NEXT_PUBLIC_SITE_URL??'http://127.0.0.1:3000',BARAKA_ADMIN_EMAIL:current.BARAKA_ADMIN_EMAIL||'admin@barakaagro.local',BARAKA_ADMIN_PASSWORD:current.BARAKA_ADMIN_PASSWORD||randomBytes(24).toString('base64url')};
if(!settings.NEXT_PUBLIC_SUPABASE_URL||!settings.NEXT_PUBLIC_SUPABASE_ANON_KEY||!settings.SUPABASE_SERVICE_ROLE_KEY)throw new Error('The local stack did not report its API credentials.');
writeFileSync(target,`# Local development only. Never commit this file.\n${Object.entries(settings).map(([key,value])=>`${key}=${value}`).join('\n')}\n`,{mode:0o600});
console.log('Local configuration saved to ignored .env.local. Credentials were not printed.');
