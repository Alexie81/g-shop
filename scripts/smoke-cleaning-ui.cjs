/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tmp/cleaning-ui-session.json'), 'utf8').replace(/^\uFEFF/, ''));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('request', (request) => { if (request.method() === 'POST') console.log('POST',new URL(request.url()).pathname); });
  await context.addInitScript(({ session, propertyId }) => {
    localStorage.setItem('gshop.session', JSON.stringify(session));
    localStorage.setItem(`gshop.property.${session.user.id}`, propertyId);
  }, fixture);
  try {
    const apiBase = 'https://curatatorie-canapele.ro/app-api';
    const headers = { Authorization: 'Bearer '+fixture.session.accessToken };
    const ownedClient = await context.request.get(`${apiBase}/clients/${fixture.clientId}`, { headers });
    if (!(await ownedClient.json()).data.firstName.startsWith('TEST')) throw new Error('Not a test fixture');
    const previous = await context.request.get(`${apiBase}/service-sheets/${fixture.sheetId}/documents`, { headers });
    for (const doc of (await previous.json()).data) if (doc.available) {
      const removed = await context.request.delete(`${apiBase}/service-sheets/${fixture.sheetId}/documents/${doc.type}`, { headers });
      if (!removed.ok()) throw new Error('Cannot reset test document');
    }
    await page.goto('http://localhost:8081/select-property?manual=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('button', { name: 'Deschide Curatatorie Canapele', exact: true }).click({ timeout: 120000 });
    await page.waitForURL('**/service/dashboard', { timeout: 30000 });
    await page.goto(`http://localhost:8081/service/service-sheets/${fixture.sheetId}?document=EXIT`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByText('Fișă de ieșire a comenzii', { exact: true }).waitFor({ timeout: 30000 });
    await page.getByText('Preț unitar (RON)', { exact: true }).locator('..').locator('input').fill('200');
    await page.getByText('Preț unitar (RON)', { exact: true }).locator('..').locator('input').press('Tab');
    const [response] = await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/service-sheets/${fixture.sheetId}/documents/EXIT`) && response.request().method() === 'POST', { timeout: 30000 }),
      page.getByRole('button', { name: /Generează PDF$/ }).click({ timeout: 30000 }),
    ]);
    if (![200, 201].includes(response.status())) throw new Error('UI generation failed: '+await response.text());
    const result = await response.json();
    if (result.data.cleaning.costs.totalDue !== 200) throw new Error('UI amount not persisted');
    await page.getByText('Fișă de ieșire a comenzii', { exact: true }).waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(root, 'tmp/pdfs/cleaning-mobile-ui.png'), fullPage: true });
    await page.goto('http://localhost:8081/service/register', { waitUntil: 'domcontentloaded' });
    await page.getByText('1 lipsă', { exact: true }).waitFor({ timeout: 30000 });
    if (await page.getByText('Deviz final', { exact: true }).count()) throw new Error('Repair documents leaked into cleaning register');
    await page.screenshot({ path: path.join(root, 'tmp/pdfs/cleaning-mobile-register.png'), fullPage: true });
    await page.goto(`http://localhost:8081/service/service-sheets/${fixture.sheetId}?document=INTAKE`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Fișă de intrare a comenzii', { exact: true }).waitFor();
    const [intakeResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/service-sheets/${fixture.sheetId}/documents/INTAKE`) && response.request().method() === 'POST'),
      page.getByRole('button', { name: /Generează PDF$/ }).click(),
    ]);
    if (!intakeResponse.ok()) throw new Error('Intake generation failed: '+await intakeResponse.text());
    const intake = (await intakeResponse.json()).data;
    await page.getByText('Fișă de intrare a comenzii', { exact: true }).waitFor({ state: 'hidden' });
    console.log('OK: both documents generated through the editor');
    await page.goto(`http://localhost:8081/service/service-sheets/${fixture.sheetId}?document=EXIT`, { waitUntil: 'domcontentloaded' });
    await page.getByText(new RegExp('Fișă de intrare de referință: '+intake.number)).waitFor();
    await page.getByRole('button', { name: 'Închide', exact: true }).click();
    await page.getByText('Fișă de ieșire a comenzii', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /(?:Semnează|Resemnează)$/ }).first().click();
    const canvas = page.getByLabel('Desenează semnătura clientului');
    await canvas.waitFor();
    const bounds = await canvas.boundingBox();
    // Draw the word TEST, never a customer's signature, through actual pointer events.
    const strokes = [[[0,0],[30,0]],[[15,0],[15,45]],[[45,45],[45,0],[75,0]],[[45,22],[70,22]],[[45,45],[75,45]],[[115,0],[85,0],[85,22],[115,22],[115,45],[85,45]],[[125,0],[155,0]],[[140,0],[140,45]]];
    for (const points of strokes) {
      await page.mouse.move(bounds.x+30+points[0][0],bounds.y+100+points[0][1]);await page.mouse.down();
      for (const [x,y] of points.slice(1)) await page.mouse.move(bounds.x+30+x,bounds.y+100+y,{steps:4});
      await page.mouse.up();
    }
    await page.screenshot({ path: path.join(root, 'tmp/pdfs/cleaning-signature-ui.png') });
    const [signedResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/service-sheets/${fixture.sheetId}/signature`) && response.request().method() === 'POST'),
      page.getByRole('button', { name: /Salvează semnătura$/ }).click(),
    ]);
    if (!signedResponse.ok() || !(await signedResponse.json()).data.signedAt) throw new Error('UI signature was not saved');
    await canvas.waitFor({ state: 'hidden' });
    const docsResponse = await context.request.get(`https://curatatorie-canapele.ro/app-api/service-sheets/${fixture.sheetId}/documents`, { headers: { Authorization: 'Bearer '+fixture.session.accessToken } });
    const docs = (await docsResponse.json()).data;
    for (const doc of docs) {
      if (!doc.available) throw new Error('Signed document missing');
      const pdf = await context.request.get(doc.url);
      if (!pdf.ok()) throw new Error('Signed PDF download failed');
      fs.writeFileSync(path.join(root, `tmp/pdfs/cleaning-ui-signed-${doc.type.toLowerCase()}.pdf`),await pdf.body());
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('OK: mobile property selection, both PDF editors, saved amounts, two-document register, intake reference and client signature; no JS errors.');
  } catch (error) {
    console.error((await page.locator('body').innerText()).slice(-7000));
    await page.screenshot({ path: path.join(root, 'tmp/pdfs/cleaning-ui-failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
