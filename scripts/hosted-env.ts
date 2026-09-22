import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function hostedEnvironment() {
  const target=resolve('.env.hosted.local');
  const file=existsSync(target)?readFileSync(target,'utf8'):'';
  const values:Record<string,string>={};
  for(const line of file.split(/\r?\n/)){const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(match)values[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}
  for(const name of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SITE_URL','SUPABASE_PROJECT_REF','VERCEL_TOKEN','VERCEL_PROJECT_ID','VERCEL_ORG_ID'])if(process.env[name])values[name]=process.env[name]!;
  return values;
}
export function assertHostedUrl(value:string|undefined,label:string) {
  if(!value)throw new Error(`Missing ${label}. Configure .env.hosted.local.`);
  let url:URL;try{url=new URL(value);}catch{throw new Error(`${label} is not a valid URL.`);}
  if(url.protocol!=='https:'||['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error(`${label} must use a public HTTPS origin.`);
  return url;
}
