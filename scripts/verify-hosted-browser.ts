import { readFileSync,readdirSync } from 'node:fs';
import { resolve,extname,join } from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hostedEnvironment } from './hosted-env';

const baseUrl='http://127.0.0.1:3000';
const routes=['/','/field','/irrigation','/forecast','/history','/devices'];
let stage='configuration';

function assertStaticBundleIsolation(forbidden:string[]){
  const root=resolve('.next/static');
  for(const entry of readdirSync(root,{recursive:true,withFileTypes:true})){
    if(!entry.isFile()||!['.js','.css','.html','.json'].includes(extname(entry.name)))continue;
    const contents=readFileSync(join(entry.parentPath,entry.name),'utf8');
    if(forbidden.some(value=>value&&contents.includes(value))||contents.includes('127.0.0.1:54321')||contents.includes('localhost:54321'))throw new Error('A private value or local backend address was found in a public build asset.');
  }
}

async function main(){
  const env=hostedEnvironment();
  const email=env.BARAKA_OWNER_EMAIL??env.BARAKA_ADMIN_EMAIL;
  const password=env.BARAKA_OWNER_PASSWORD??env.BARAKA_ADMIN_PASSWORD;
  if(env.SUPABASE_PROJECT_REF!=='gunzhtlbpxwpprqwnhfd'||email?.toLowerCase()!=='iamrealferuzbek@gmail.com'||!password)throw new Error('Approved hosted owner configuration is incomplete.');
  const local=Object.fromEntries(readFileSync(resolve('.env.local'),'utf8').split(/\r?\n/).flatMap(line=>{const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);return match?[[match[1],match[2]]]:[];}));
  const forbidden=[env.SUPABASE_SERVICE_ROLE_KEY,password,local.SUPABASE_SERVICE_ROLE_KEY,local.BARAKA_ADMIN_PASSWORD].filter((value):value is string=>Boolean(value));
  stage='public build isolation';
  assertStaticBundleIsolation(forbidden);
  const browser=await chromium.launch();
  try{
    for(const viewport of [{width:1440,height:900},{width:834,height:1112},{width:390,height:844}]){
      const viewportName=`${viewport.width}px`;
      const context=await browser.newContext({viewport});
      const page=await context.newPage();
      const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      try{
        for(const route of routes){
          stage=`${viewportName} ${route}`;
          const response=await page.goto(baseUrl+route);
          if(response?.status()!==200)throw new Error('A hosted-backed product route did not return HTTP 200.');
          stage=`${viewportName} ${route} heading`;
          await page.getByRole('heading',{level:1}).waitFor();
          stage=`${viewportName} ${route} layout`;
          if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)))throw new Error('A hosted-backed product route overflowed its viewport.');
          stage=`${viewportName} ${route} accessibility`;
          const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
          if(axe.violations.length){stage+=` (${axe.violations.map(violation=>`${violation.id}: ${violation.nodes.map(node=>node.target.join(' ')).join(', ')}`).join('; ')})`;throw new Error('A hosted-backed product route failed automated accessibility checks.');}
        }
        stage=`${viewportName} anonymous admin boundary`;
        const anonymous=await page.request.get(baseUrl+'/api/admin/overview');
        if(anonymous.status()!==401)throw new Error('Anonymous admin API access was not denied.');
        stage=`${viewportName} owner sign-in`;
        const signed=await page.request.post(baseUrl+'/api/auth/login',{headers:{Origin:env.NEXT_PUBLIC_SITE_URL},data:{email,password}});
        if(!signed.ok())throw new Error('Hosted owner could not sign in through the production application route.');
        stage=`${viewportName} owner workspace`;
        await page.goto(baseUrl+'/admin');
        await page.getByRole('heading',{name:'A clearer view of the system.'}).waitFor();
        const session=await page.evaluate(async()=>await(await fetch('/api/auth/session',{cache:'no-store'})).json());
        if(session.role!=='owner'||session.canManageAdmins!==true||session.permissions?.length!==4)throw new Error('The production application did not authorize the protected owner.');
        await page.getByRole('tab',{name:'Team & Access'}).click();
        await page.getByText('Protected initial owner',{exact:true}).waitFor();
        stage=`${viewportName} owner accessibility`;
        const adminAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        if(adminAxe.violations.length){stage+=` (${adminAxe.violations.map(violation=>violation.id).join(', ')})`;throw new Error('The hosted-backed owner workspace failed automated accessibility checks.');}
        if(errors.length)throw new Error('The hosted-backed application raised a browser runtime error.');
      }finally{await context.close();}
    }
  }finally{await browser.close();}
  console.log('Hosted-backed production browser passed owner login, public authorization, desktop/tablet/mobile layout and accessibility, and public bundle secret isolation.');
}

main().catch(()=>{console.error(`Hosted-backed production browser verification failed at ${stage}. No credentials were printed.`);process.exitCode=1;});
