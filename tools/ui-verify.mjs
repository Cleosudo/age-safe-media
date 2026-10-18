/**
 * Browser-based UI verification for the Expo web build.
 *
 * Prerequisites
 *   1. an API matching docs/API.md — the repo ships `mock-api/` for this
 *   2. `cd mobile && npx expo start --web --port 8081`
 *   3. `cd tools && npm i playwright && npx playwright install chromium`
 *
 * Run:  node tools/ui-verify.mjs
 * It writes screenshots to docs/screenshots/ and exits non-zero on a failed check.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:8081';
const OUT = path.resolve('docs/screenshots');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

await mkdir(OUT, { recursive: true });

try {
  // start from a clean session so the script is repeatable
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(OUT, '01-login.png') });
  check('login screen rendered', await page.getByRole('button', { name: 'Sign in' }).isVisible());

  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(5000);
  check('chat screen after sign-in', await page.getByLabel('Type your question').isVisible());
  await page.screenshot({ path: path.join(OUT, '02-chat.png') });

  await page.getByLabel('Type your question').fill('Show me books about volcanoes');
  await page.getByRole('button', { name: 'Send message' }).click();
  const cards = page.locator('[aria-label^="Recommendation: "]');
  await cards.first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const cardCount = await cards.count();
  check('recommendation cards returned', cardCount > 0, `${cardCount} cards`);
  await page.screenshot({ path: path.join(OUT, '03-recommendations.png') });

  // hearts are stateful across runs: normalise, then save
  const heartLocator = page.locator('[aria-label$="favourites"]');
  const firstLabel = await heartLocator.first().getAttribute('aria-label');
  if (firstLabel?.startsWith('Remove')) {
    await heartLocator.first().click();
    await page.waitForTimeout(1200);
  }
  await heartLocator.first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '04-saved-toast.png') });

  await page.getByRole('tab', { name: 'Saved' }).click();
  await page.waitForTimeout(2500);
  const savedText = await page.evaluate(() => document.body.innerText);
  check('favourite appears on Saved tab', savedText.length > 0 && !savedText.includes('Nothing saved yet'));
  await page.screenshot({ path: path.join(OUT, '05-saved.png') });

  await page.getByRole('tab', { name: 'Insights' }).click();
  await page.waitForTimeout(3000);
  const insightsText = await page.evaluate(() => document.body.innerText);
  check('dashboard shows totals', /Searches/i.test(insightsText) && /Active days/i.test(insightsText));
  await page.screenshot({ path: path.join(OUT, '06-insights.png') });

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.waitForTimeout(2000);
  const settingsText = await page.evaluate(() => document.body.innerText);
  check('settings shows API base URL', settingsText.includes('API base URL'));
  check('settings lists child profiles', settingsText.includes('Child profiles'));
  await page.screenshot({ path: path.join(OUT, '07-settings.png') });

  await page.getByRole('button', { name: 'Manage Amelia' }).click();
  await page.waitForTimeout(2000);
  const editorText = await page.evaluate(() => document.body.innerText);
  check('child editor opens', editorText.includes('Parental restrictions'));
  await page.screenshot({ path: path.join(OUT, '08-child-editor.png') });

  await page.goBack();
  await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: 'Chat' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Output preferences' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '09-output-preferences.png') });
  check('preferences sheet opens', (await page.getByText('How results appear').count()) > 0);

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (error) {
  check('unhandled failure', false, error.message);
} finally {
  await browser.close();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
