/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const test = require('node:test');
const { patchWhatsAppLaunch } = require('../plugins/with-single-whatsapp-launch');

test('WhatsApp and Business native adapters launch once and retain recipient, image and text preparation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gshop-whatsapp-patch-'));
  try {
    const packageRoot = path.join(root, 'node_modules/react-native-share');
    const javaRoot = path.join(packageRoot, 'android/src/main/java/cl/json/social');
    fs.mkdirSync(javaRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '12.3.1' }));
    for (const name of ['WhatsAppShare.java', 'WhatsAppBusinessShare.java']) {
      fs.copyFileSync(path.join(__dirname, '../node_modules/react-native-share/android/src/main/java/cl/json/social', name), path.join(javaRoot, name));
    }
    patchWhatsAppLaunch(root);
    for (const name of ['WhatsAppShare.java', 'WhatsAppBusinessShare.java']) {
      const file = path.join(javaRoot, name);
      const code = fs.readFileSync(file, 'utf8');
      assert.equal(code.match(/this\.openIntentChooser\(\)/g).length, 1);
      assert.ok(code.includes('super.open(options);')); // builds the URI grant, message and jid
      assert.ok(code.includes('ACTION_SEND)'));
      assert.ok(code.includes('EXTRA_STREAM, files.get(0)'));
      assert.ok(!code.includes('Thread.sleep('));
      assert.ok(!code.includes('.setComponent('));
      patchWhatsAppLaunch(root);
      assert.equal(fs.readFileSync(file, 'utf8'), code);
    }
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '99.0.0' }));
    assert.throws(() => patchWhatsAppLaunch(root), /Review/);
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('gshop-whatsapp-patch-'));
    fs.rmSync(resolved, { recursive: true });
  }
});
