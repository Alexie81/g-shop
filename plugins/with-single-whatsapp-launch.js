const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

const MARKER = 'GSHOP_SINGLE_WHATSAPP_LAUNCH';
const OPEN = `public void open(ReadableMap options) throws ActivityNotFoundException {
        // ${MARKER}: keep the sender visible until the only activity launch.
        // Opening Conversation first makes Android 16 block the attachment activity.
        super.open(options);
        android.content.Intent shareIntent = this.getIntent();
        if (android.content.Intent.ACTION_SEND_MULTIPLE.equals(shareIntent.getAction())) {
            java.util.ArrayList<android.net.Uri> files = shareIntent.getParcelableArrayListExtra(android.content.Intent.EXTRA_STREAM);
            if (files != null && files.size() == 1) {
                shareIntent.removeExtra(android.content.Intent.EXTRA_STREAM);
                shareIntent.setAction(android.content.Intent.ACTION_SEND);
                shareIntent.putExtra(android.content.Intent.EXTRA_STREAM, files.get(0));
            }
        }
        this.openIntentChooser();
    }
    `;

function patchWhatsAppLaunch(projectRoot) {
  const packageRoot = path.join(projectRoot, 'node_modules/react-native-share');
  const version = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
  if (version !== '12.3.1') throw new Error(`Review the WhatsApp single-launch patch for react-native-share ${version}.`);
  for (const name of ['WhatsAppShare.java', 'WhatsAppBusinessShare.java']) {
    const file = path.join(packageRoot, 'android/src/main/java/cl/json/social', name);
    const original = fs.readFileSync(file, 'utf8');
    if (original.includes(MARKER)) continue;
    const method = /public void open\(ReadableMap options\) throws ActivityNotFoundException \{[\s\S]*?(?=@Override\s+protected String getPackage)/;
    const match = original.match(method);
    if (!match || !match[0].includes('Thread.sleep(START_ACTIVITY_TIME_GAP_MS)')) throw new Error(`Unexpected WhatsApp implementation: ${name}`);
    fs.writeFileSync(file, original.replace(method, OPEN));
  }
}

module.exports = function withSingleWhatsAppLaunch(config) {
  return withDangerousMod(config, ['android', async (mod) => {
    patchWhatsAppLaunch(mod.modRequest.projectRoot);
    return mod;
  }]);
};
module.exports.patchWhatsAppLaunch = patchWhatsAppLaunch;
if (require.main === module) patchWhatsAppLaunch(path.resolve(__dirname, '..'));
