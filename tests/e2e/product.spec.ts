import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

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

test('keyboard and contrast accessibility on Today', async ({ page }) => {
  await page.goto('/');await expect(page.locator('.hero-card')).toBeVisible();
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});

test('admin login, shared scenario changes, inspector, and logout work', async ({ page, isMobile }) => {
  test.skip(isMobile,'Authoritative mutation is exercised once to keep scenario state deterministic.');
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
