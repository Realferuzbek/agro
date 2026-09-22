import { existsSync,readFileSync } from 'node:fs';
import { hostedEnvironment,assertHostedUrl } from './hosted-env';
const values=hostedEnvironment();
const issues:string[]=[];
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SITE_URL']){try{assertHostedUrl(values[key],key);}catch(error){issues.push((error as Error).message);}}
for(const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PROJECT_REF'])if(!values[key])issues.push(`Missing ${key}.`);
if(values.NEXT_PUBLIC_SUPABASE_ANON_KEY?.startsWith('sb_secret_'))issues.push('A server secret was supplied as the public Supabase key.');
try{const payload=JSON.parse(Buffer.from(values.NEXT_PUBLIC_SUPABASE_ANON_KEY?.split('.')[1]??'','base64url').toString());if(payload.role==='service_role')issues.push('A service-role token must never be used as a public key.');}catch{/* Publishable keys are opaque, not JWTs. */}
let project:Record<string,string>={};if(existsSync('.vercel/project.json'))project=JSON.parse(readFileSync('.vercel/project.json','utf8'));
if(!(values.VERCEL_PROJECT_ID||project.projectId))issues.push('Choose/configure VERCEL_PROJECT_ID or link the intended Vercel project.');
if(!(values.VERCEL_ORG_ID||project.orgId))issues.push('Choose/configure VERCEL_ORG_ID or link the intended Vercel team.');
if(issues.length){console.error('Hosted preflight is incomplete:\n'+issues.map(issue=>`- ${issue}`).join('\n'));process.exitCode=1;}
else console.log('Hosted configuration shape is valid. Next verify CLI identity, target schema, and the deployed candidate. Secret values were not printed.');
