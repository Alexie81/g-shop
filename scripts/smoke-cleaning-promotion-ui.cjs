/* global __dirname, process */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const state = JSON.parse(fs.readFileSync(path.join(root, 'tmp/cleaning-deployment.json'), 'utf8'));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await context.request.get('https://reparatiicalculatoare-bucuresti.ro/app-api/auth/me', { headers: { Authorization: 'Bearer '+state.accessToken } });
  assert.equal(response.status(), 200);
  const user = (await response.json()).data;
  await context.addInitScript(({ token, user, propertyId }) => {
    localStorage.setItem('gshop.session', JSON.stringify({ accessToken: token, refreshToken: 'test-no-refresh', expiresAt: new Date(Date.now()+600000).toISOString(), user }));
    if (!localStorage.getItem(`gshop.property.${user.id}`)) localStorage.setItem(`gshop.property.${user.id}`, propertyId);
    localStorage.setItem('gshop.theme', 'light');
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', { value: async (data) => { window.__sharedCard = { text: data.text, name: data.files[0].name, size: data.files[0].size, type: data.files[0].type }; } });
  }, { token: state.accessToken, user, propertyId: state.property.id });
  try {
    await page.goto('http://localhost:8081/service/whatsapp-messages', { timeout: 120000 });
    const send = page.getByRole('button', { name: /Trimite imaginea și textul$/ });
    await send.waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: /Vezi \/ editează textul$/ }).click();
    const message = page.getByLabel('Textul cărții de vizită');
    assert.ok((await message.inputValue()).includes('480'));
    await message.fill((await message.inputValue())+'\nTEST PREVIZUALIZARE');
    await send.click();
    await page.waitForFunction(() => window.__sharedCard);
    const shared = await page.evaluate(() => window.__sharedCard);
    assert.equal(shared.name, 'Curatatorie-Canapele.png'); assert.equal(shared.type, 'image/png');
    assert.ok(shared.size > 1000000 && shared.text.includes('TEST PREVIZUALIZARE') && shared.text.includes('https://curatatorie-canapele.ro'));
    await page.getByRole('button', { name: /Ascunde textul$/ }).click();
    await page.screenshot({ path: path.join(root, 'tmp/pdfs/cleaning-promotion-mobile.png'), fullPage: true });
    // A fresh context uses another property; the new marketing section must not appear.
    await page.evaluate((id) => { localStorage.setItem(`gshop.property.${id}`, '11111111-1111-4111-8111-111111111111'); }, user.id);
    await page.reload();
    await page.getByText('Mesajele contului tău', { exact: true }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    assert.equal(await page.getByText('Trimite cartea de vizită', { exact: true }).count(), 0);
    await page.goto('https://curatatorie-canapele.ro/app-api/cleaning-business-card.php');
    assert.ok(await page.locator('img').evaluate((img) => img.complete && img.naturalWidth === 1055));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('OK: mobile business-card UI, editable message, actual PNG + text payload, other-property isolation, public card page; no messages sent.');
  } catch (error) {
    console.error('UI route:', page.url(), 'Errors:', errors, 'Page:', (await page.locator('body').innerText()).slice(-3500));
    await page.screenshot({ path: path.join(root, 'tmp/pdfs/cleaning-promotion-failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
