import { hostedEnvironment,assertHostedUrl } from './hosted-env';
const values=hostedEnvironment();
const index=process.argv.indexOf('--url');
const base=assertHostedUrl(index>=0?process.argv[index+1]:values.NEXT_PUBLIC_SITE_URL,'Deployment URL');
const failures:string[]=[];
async function main(){
  const chunks=new Set<string>();
  for(const path of ['/','/field','/irrigation','/forecast','/history','/devices','/admin']){
    const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(30000)});const html=await response.text();
    if(!response.ok)failures.push(`${path}: HTTP ${response.status}`);
    if(path==='/admin'&&!html.includes('Sign in'))failures.push('/admin did not render the unauthenticated login.');
    for(const match of html.matchAll(/src="([^"]+\.js(?:\?[^\"]*)?)"/g)){const url=new URL(match[1].replaceAll('&amp;','&'),base);if(url.origin===base.origin)chunks.add(url.href);}
  }
  const response=await fetch(new URL('/api/product',base));const body=await response.json();
  if(!response.ok||body.state?.schemaVersion!==1||!Number.isFinite(body.state?.recommendation?.grossVolumeLiters)||!body.state?.calculation?.engineVersion)failures.push('Public product state is unavailable or invalid.');
  const admin=await fetch(new URL('/api/admin/overview',base));if(admin.status!==401)failures.push(`Anonymous admin access returned ${admin.status}, expected 401.`);
  for(const url of chunks){const text=await(await fetch(url)).text();if(values.SUPABASE_SERVICE_ROLE_KEY&&text.includes(values.SUPABASE_SERVICE_ROLE_KEY))failures.push('A server credential appeared in a client bundle.');if(text.includes('127.0.0.1:54321')||text.includes('localhost:54321'))failures.push('A local Supabase URL appeared in a hosted client bundle.');}
  if(failures.length){console.error('Hosted verification failed:\n'+[...new Set(failures)].map(f=>`- ${f}`).join('\n'));process.exitCode=1;}else console.log(`Hosted route, state, anonymous-auth, and ${chunks.size} client-bundle checks passed. Manual authenticated/realtime/browser acceptance remains required.`);
}
main().catch(()=>{console.error('Hosted verification could not connect or decode the application response.');process.exitCode=1;});
