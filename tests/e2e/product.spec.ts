import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

function localCredentials() { return Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)])); }
async function signIn(page:Page) { const env=localCredentials();await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill(env.AGRIFLOW_ADMIN_EMAIL);await page.getByLabel('Password',{exact:true}).fill(env.AGRIFLOW_ADMIN_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'A clearer view of the system.'})).toBeVisible(); }

test('Today shows the persisted golden plan and an accessible explanation', async ({ page }) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Your field, at a glance.'})).toBeVisible();
  await expect(page.locator('.hero-card')).toContainText('60.1');
  await expect(page.locator('.hero-card')).toContainText('5 h 48 min');
  await expect(page.getByRole('button',{name:'Demo — simulated field data'})).toHaveCount(1);
  await page.getByRole('button',{name:'Why this recommendation?'}).first().click();
  await expect(page.getByRole('dialog')).toContainText('Every drop, explained.');
  await expect(page.getByRole('dialog')).toContainText('60,086 L');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('admin can register, commission, issue and revoke a device credential', async ({page}) => {
  const id=`e2e-${crypto.randomUUID()}`,name=`Test rain gauge ${id.slice(-5)}`;
  const env=localCredentials();const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  try {
    await signIn(page);await page.getByRole('tab',{name:'Device Integration',exact:true}).click();await page.getByRole('button',{name:'Register device',exact:true}).click();
    await page.getByLabel('Device ID',{exact:true}).fill(id);await page.getByLabel('Name',{exact:true}).fill(name);await page.getByRole('combobox',{name:'Kind',exact:true}).selectOption('rain');await page.getByRole('button',{name:'Save identity'}).click();
    await expect(page.getByRole('status')).toContainText('Device registered.');
    await page.getByRole('row').filter({has:page.getByText(id,{exact:true})}).getByRole('button',{name:'Inspect',exact:true}).click();
    await expect(page.getByRole('heading',{name:`${name} · integration detail`})).toBeVisible();
    await page.getByRole('button',{name:'Edit configuration',exact:true}).click();await page.getByRole('combobox',{name:'Assignment',exact:true}).selectOption('B');await page.getByRole('textbox',{name:'Configuration (JSON)',exact:true}).fill('{"firmwareVersion":"test-1","freshnessSeconds":300}');await page.getByRole('button',{name:'Save configuration',exact:true}).click();await expect(page.getByRole('status')).toContainText('Device configuration saved.');
    await expect(page.getByRole('row').filter({has:page.getByText(id,{exact:true})})).toContainText('Zone B');
    await page.getByRole('button',{name:'Issue device credential'}).click();await expect(page.getByText('Copy this credential now. It is shown only once.')).toBeVisible();
    await page.getByRole('button',{name:'Revoke',exact:true}).click();await expect(page.getByText('Revoked',{exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'Commissioning',exact:true}).click();await page.getByLabel('Commissioning device').selectOption(id);await page.getByRole('button',{name:'Run simulated checks'}).click();
    await expect(page.getByRole('status')).toContainText('No physical test was performed.');
    await expect(page.locator('.json-view')).toContainText('"physicalTestPerformed": false');
  } finally {
    await service.from('commissioning_runs').delete().eq('device_id',id);await service.from('device_credentials').delete().eq('device_id',id);await service.from('devices').delete().eq('id',id);
  }
});

test('authoritative simulation propagates to a separate public browser through realtime',async({page,browser})=>{
  const publicContext=await browser.newContext();const observer=await publicContext.newPage();
  try{
    await signIn(page);await observer.goto('/');await expect(observer.locator('.hero-card')).toBeVisible();
    await page.getByLabel('Simulation scenario').selectOption('sensor-offline');await page.getByRole('button',{name:'Load / reset'}).click();await expect(page.getByRole('status')).toContainText('Scenario reset');
    await page.getByRole('button',{name:'Step 1 minute'}).click();
    // Poll fallback is 30 seconds; this assertion requires the realtime path.
    await expect(observer.getByText('Moderate data',{exact:true})).toBeVisible({timeout:10000});
    await expect(observer.locator('.preview-banner')).toHaveCount(0);
  }finally{
    const current=await(await page.request.get('/api/product')).json();
    await page.request.post('/api/admin/simulation',{headers:{origin:'http://127.0.0.1:3000'},data:{action:'reset',scenarioId:'rain-underperforms',expectedVersion:current.revision,idempotencyKey:crypto.randomUUID()}});
    await publicContext.close();
  }
});

test('all farmer routes navigate and fit the viewport', async ({ page, isMobile }) => {
  await page.goto('/');const nav=page.locator(isMobile?'.mobile-nav':'.navigation');
  for(const [name,path,title] of [['Field','/field','A living picture of your field.'],['Irrigation','/irrigation','Your irrigation plan.'],['Forecast','/forecast','The week ahead.'],['History','/history','Your field’s history.'],['Devices','/devices','Small devices. A fuller picture.'],['Today','/','Your field, at a glance.']]){
    await nav.getByRole('link',{name,exact:true}).click();await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  }
  await expect(nav.getByRole('link',{name:/admin/i})).toHaveCount(0);
});

test('public preview delivers water locally and survives a reload without mutating shared state', async ({ page, context }) => {
  const before=await (await page.request.get('/api/product')).json();
  const observer=await context.newPage();await observer.goto('/');await page.goto('/');
  await page.getByRole('button',{name:'Preview irrigation',exact:true}).click();await expect(page).toHaveURL('/irrigation');
  await expect(page.locator('.preview-banner')).toBeVisible();
  await expect.poll(async()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('agriflow-preview')??'{}').control?.deliveredVolumeLiters??0)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const delivered=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('agriflow-preview')!).control.deliveredVolumeLiters);
  await page.reload();await expect(page.locator('.preview-banner')).toBeVisible();
  await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('agriflow-preview')!).control.deliveredVolumeLiters)).toBe(delivered);
  const after=await (await page.request.get('/api/product')).json();expect(after.revision).toBe(before.revision);expect(after.state.control.deliveredVolumeLiters).toBe(before.state.control.deliveredVolumeLiters);
  await expect(observer.locator('.preview-banner')).toHaveCount(0);
  await page.getByRole('button',{name:'Exit preview'}).click();await expect(page.locator('.preview-banner')).toHaveCount(0);await observer.close();
});

test('anonymous admin access is protected at the page and API', async ({ page }) => {
  await page.goto('/admin');await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Simulation Lab'})).toHaveCount(0);
  expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
  expect((await page.request.post('/api/admin/simulation',{headers:{origin:'http://127.0.0.1:3000'},data:{action:'reset',scenarioId:'rain-fails',expectedVersion:0,idempotencyKey:crypto.randomUUID()}})).status()).toBe(401);
});

test('farmer routes and explanation meet automated accessibility checks', async ({ page }) => {
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const violations:unknown[]=[];
  for(const route of ['/','/field','/irrigation','/forecast','/history','/devices']){
    await page.goto(route);await expect(page.getByRole('heading',{level:1})).toBeVisible();
    const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    violations.push(...results.violations.map(v=>({route,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})));
  }
  await page.goto('/');await page.getByRole('button',{name:'Why this recommendation?'}).first().click();await expect(page.getByRole('dialog')).toBeVisible();
  const drawer=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();violations.push(...drawer.violations.map(v=>({route:'explanation',id:v.id,nodes:v.nodes.map(n=>n.target)})));
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Why this recommendation?'}).first()).toBeFocused();
  expect(violations).toEqual([]);expect(errors).toEqual([]);
});

test('admin login, shared scenario changes, inspector, and logout work', async ({ page }) => {
  const values=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
  await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill(values.AGRIFLOW_ADMIN_EMAIL);await page.getByLabel('Password',{exact:true}).fill(values.AGRIFLOW_ADMIN_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A clearer view of the system.'})).toBeVisible();
  await page.getByLabel('Simulation scenario').selectOption('sensor-offline');await page.getByRole('button',{name:'Load / reset'}).click();
  await expect(page.getByRole('status')).toContainText('Scenario reset');
  await page.getByRole('button',{name:'Step 1 minute'}).click();
  await expect.poll(async()=>(await(await page.request.get('/api/product')).json()).state.recommendation.confidence).toBe('Moderate');
  await page.getByRole('tab',{name:'Calculation Inspector'}).click();await expect(page.locator('.json-view')).toContainText('engine_version');
  await page.getByRole('tab',{name:'Simulation Lab'}).click();await page.getByLabel('Simulation scenario').selectOption('rain-underperforms');await page.getByRole('button',{name:'Load / reset'}).click();
  await expect(page.getByRole('status')).toContainText('Scenario reset');await page.getByRole('button',{name:'Sign out'}).click();await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
});

test('owner grants limited administrator access and revokes it through the protected workspace',async({page,browser})=>{
  const env=localCredentials(),password=crypto.randomUUID()+crypto.randomUUID(),email=`access-${crypto.randomUUID()}@agriflow.test`;
  const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const created=await service.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const id=created.data.user!.id;
  const colleague=await browser.newContext();
  try{
    await signIn(page);await page.getByRole('tab',{name:'Team & Access'}).click();await expect(page.getByRole('heading',{name:'People & permissions'})).toBeVisible();
    const invite=page.getByRole('heading',{name:'Add an administrator'}).locator('..').locator('..').locator('..');
    await invite.getByLabel('Email address',{exact:true}).fill(email);await invite.getByLabel('Manage simulation and irrigation',{exact:true}).check();await invite.getByRole('button',{name:'Invite / add administrator'}).click();
    await expect(page.getByRole('status')).toContainText('Access request recorded');
    const member=page.locator('.access-member').filter({has:page.getByText(email,{exact:true})});await expect(member).toContainText('Administrator');
    const limited=await colleague.newPage();await limited.goto('/admin');await limited.getByLabel('Email',{exact:true}).fill(email);await limited.getByLabel('Password',{exact:true}).fill(password);await limited.getByRole('button',{name:'Sign in',exact:true}).click();await expect(limited.getByRole('heading',{name:'A clearer view of the system.'})).toBeVisible();
    await expect(limited.getByRole('tab',{name:'Simulation Lab'})).toBeVisible();await expect(limited.getByRole('tab',{name:'Team & Access'})).toHaveCount(0);await expect(limited.getByRole('tab',{name:'Device Integration'})).toHaveCount(0);
    expect((await limited.request.get('/api/admin/access')).status()).toBe(403);expect((await limited.request.get('/api/admin/devices')).status()).toBe(403);
    await member.getByRole('button',{name:'Edit access'}).click();await member.getByRole('combobox',{name:'Access level'}).selectOption('farmer');await member.getByLabel('Manage simulation and irrigation',{exact:true}).uncheck();await member.getByRole('button',{name:'Save access'}).click();await expect(page.getByRole('status')).toContainText('Access updated.');
    expect((await limited.request.get('/api/admin/overview')).status()).toBe(403);
    const audit=await service.from('audit_logs').select('id').eq('entity_id',id);expect(audit.error).toBeNull();expect(audit.data!.length).toBeGreaterThan(0);
  }finally{await colleague.close();await service.from('admin_invitations').delete().eq('email',email);await service.auth.admin.deleteUser(id);}
});

test('administration tabs support keyboard navigation and accessible content',async({page})=>{
  test.setTimeout(120000);await signIn(page);const tabs=page.getByRole('tablist',{name:'Admin sections'});await tabs.getByRole('tab',{name:'Simulation Lab'}).focus();await page.keyboard.press('ArrowRight');await expect(tabs.getByRole('tab',{name:'Device Integration'})).toBeFocused();await page.keyboard.press('End');await expect(tabs.getByRole('tab',{name:'Team & Access'})).toBeFocused();await page.keyboard.press('Home');await expect(tabs.getByRole('tab',{name:'Simulation Lab'})).toBeFocused();
  const violations:unknown[]=[];
  for(const name of ['Simulation Lab','Device Integration','Commissioning','Calculation Inspector','Telemetry','Agronomy Parameters','Alerts','Audit Logs','Team & Access']){
    await tabs.getByRole('tab',{name,exact:true}).click();await expect(page.getByRole('tabpanel')).toBeVisible();const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();violations.push(...result.violations.map(v=>({name,id:v.id,nodes:v.nodes.map(n=>n.target)})));
  }
  expect(violations).toEqual([]);
});
