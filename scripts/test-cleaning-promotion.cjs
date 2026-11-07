/* global __dirname, process */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load({ os = 'android', native = true, status = 200, cached = false, dismissed = false } = {}) {
  const calls = [];
  const mocks = {
    'react-native': { Platform: { OS: os }, TurboModuleRegistry: { get: () => native ? {} : null } },
    'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', getInfoAsync: async () => ({ exists: cached, size: cached ? 2000 : 0 }), downloadAsync: async (...args) => { calls.push(['download', ...args]); return { status }; }, deleteAsync: async (...args) => calls.push(['delete', ...args]) },
    'react-native-share': { default: { open: async (options) => { calls.push(['share', options]); return { dismissedAction: dismissed }; } }, __esModule: true },
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/cleaning-business-card.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, URL, process: { env: {} }, require: (id) => mocks[id], setTimeout });
  return { ...module.exports, calls };
}
const id = '44444444-4444-4444-8444-444444444450';
test('dossier retains the client token and pins the selected sheet, dropping stale hash', () => {
  const app = load();
  const base = `https://curatatorie-canapele.ro/app-api/index.php/public/client-form/${id}`;
  assert.equal(app.cleaningDossierUrl(`${base}/documents/intake?v=old`, id), `${base}/dossier/${id}`);
  assert.equal(app.cleaningDossierUrl(`${base}/documents/exit`, id), `${base}/dossier/${id}`);
  assert.equal(app.cleaningDossierUrl('https://example.com/documents/intake', id), null);
  assert.equal(app.cleaningDossierUrl(`${base}/documents/intake`, '../other'), null);
});
test('native share passes a local PNG and the complete editable text together', async () => {
  const app = load();
  const prepared = await app.prepareCleaningCard();
  const message = app.CLEANING_CARD_MESSAGE + '\nMesaj personalizat.';
  assert.equal(await app.shareCleaningCard(prepared, message), 'opened');
  const payload = app.calls.find(([name]) => name === 'share')[1];
  assert.equal(payload.type, 'image/png'); assert.equal(payload.url, 'file:///cache/curatatorie-canapele-v9.png');
  assert.equal(payload.message, message); assert.ok(message.includes('480')); assert.ok(message.includes('https://curatatorie-canapele.ro'));
});
test('failed download is removed and cannot be shared', async () => {
  const app = load({ status: 404 });
  await assert.rejects(app.prepareCleaningCard());
  assert.ok(app.calls.find(([name]) => name === 'delete'));
  assert.ok(!app.calls.find(([name]) => name === 'share'));
});
test('cached file is reused; cancel is not reported as sent', async () => {
  const app = load({ cached: true, dismissed: true });
  assert.equal(await app.shareCleaningCard(await app.prepareCleaningCard(), 'Mesaj'), 'cancelled');
  assert.ok(!app.calls.find(([name]) => name === 'download'));
});
test('Expo Go/older APK does not import an absent native module', async () => {
  const app = load({ native: false });
  await assert.rejects(app.shareCleaningCard(await app.prepareCleaningCard(), 'Mesaj'), /noul APK/);
  assert.ok(!app.calls.find(([name]) => name === 'share'));
});
