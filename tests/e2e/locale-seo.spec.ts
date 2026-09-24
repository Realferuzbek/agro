import { expect, test } from '@playwright/test';

test('language switch keeps the page and preference, including protected admin copy', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('pageerror', error => { if (error.message.includes('Hydration')) hydrationErrors.push(error.message); });
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('Hydration')) hydrationErrors.push(message.text()); });
  await page.goto('/uz/field');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uz');
  await expect(page.getByRole('heading', { name: 'Dalangizning bugungi holati.' })).toBeVisible();
  await page.locator('.language-switcher a[lang="ru"]').click();
  await expect(page).toHaveURL('/ru/field');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('heading', { name: 'Ваше поле сегодня.' })).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL('/ru');
  await page.goto('/ru/admin');
  await expect(page.getByRole('heading', { name: 'С возвращением.' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect(hydrationErrors).toEqual([]);
});

test('localized canonical, language alternates, sitemap, and host redirects are consistent', async ({ page, request }) => {
  await page.goto('/en/forecast');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://barakaagro.app/en/forecast');
  for (const locale of ['en', 'uz', 'ru']) await expect(page.locator(`link[rel="alternate"][hreflang="${locale}"]`)).toHaveAttribute('href', `https://barakaagro.app/${locale}/forecast`);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const locale of ['en', 'uz', 'ru']) expect(sitemap).toContain(`https://barakaagro.app/${locale}/forecast`);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('https://barakaagro.app/sitemap.xml');
  const redirect = await request.get('/en/field?probe=1', { headers: { Host: 'www.barakaagro.app' }, maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe('https://barakaagro.app/en/field?probe=1');
});
