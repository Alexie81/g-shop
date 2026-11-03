/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real TypeScript and screen handler without native modules or a device.
function loadTs(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module, exports: module.exports, URL, setTimeout, clearTimeout,
    require: (id) => Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : require(id),
  }, { filename: file });
  return module.exports;
}

const flow = loadTs('utils/app-update-flow.ts');
const info = { platform: 'android', latestVersion: '1.1.32', latestBuildNumber: 32, downloadUrl: 'https://example.com/g-shop-1.1.32.apk', releaseNotes: [], mandatory: false };
const versions = loadTs('utils/app-version.ts', {
  'expo-constants': { expoConfig: { version: '1.1.31', extra: { releaseVersion: '1.1.31.2' } } },
  'expo-application': { nativeBuildVersion: '31' },
});
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };

function clock() {
  let current = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    options: {
      now: () => current,
      schedule: (callback, delay) => { const id = ++sequence; timers.set(id, { at: current + delay, callback }); return id; },
      clear: (id) => timers.delete(id),
    },
    async advance(milliseconds) {
      const target = current + milliseconds;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.at <= target).sort((left, right) => left[1].at - right[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        timers.delete(id);
        current = timer.at;
        timer.callback();
        await flush();
      }
      current = target;
      await flush();
    },
    get pending() { return timers.size; },
  };
}

test('an old native build sees a higher APK build independent of its OTA release version', () => {
  assert.equal(versions.isNativeUpdateAvailable(32, '1.1.32'), true);
  assert.equal(versions.isNativeUpdateAvailable(31, '1.1.99'), false);
  assert.equal(versions.isNativeUpdateAvailable(30, '1.1.99'), false);
  assert.equal(versions.isNativeUpdateAvailable(undefined, '1.1.99'), false);
  assert.equal(flow.canOfferNativeUpdate('android', info, true), true);
  assert.equal(flow.canOfferNativeUpdate('ios', info, true), false);
  assert.equal(flow.canOfferNativeUpdate('web', info, true), false);
  assert.equal(flow.canOfferNativeUpdate('android', { ...info, downloadUrl: '' }, true), false);
  assert.equal(flow.canOfferNativeUpdate('android', { ...info, downloadUrl: 'javascript:alert(1)' }, true), false);
  assert.equal(flow.canOfferNativeUpdate('android', { ...info, latestBuildNumber: undefined }, true), false);
});

test('native update discovery does not check or download an older pending OTA', async () => {
  const forbidden = () => { throw new Error('OTA must not delay the APK'); };
  const result = await flow.findAvailableUpdate({
    getPublished: async () => info, nativeAvailable: () => true,
    otaEnabled: true, pendingOta: forbidden, checkOta: forbidden, fetchOta: forbidden,
  });
  assert.equal(result.kind, 'native');
  assert.equal(result.published.downloadUrl, info.downloadUrl);
});

test('iOS ignores Android APK metadata and can still receive its own OTA', async () => {
  let fetched = 0;
  const result = await flow.findAvailableUpdate({
    getPublished: async () => info,
    nativeAvailable: (published) => flow.canOfferNativeUpdate('ios', published, true),
    otaEnabled: true, pendingOta: () => ({ available: false, version: null }),
    checkOta: async () => ({ available: true, version: '1.1.32.1' }), fetchOta: async () => { fetched++; },
  });
  assert.equal(result.kind, 'ota');
  assert.equal(fetched, 1);
});

test('no update is offered when neither a new native build nor an OTA exists', async () => {
  const result = await flow.findAvailableUpdate({
    getPublished: async () => info, nativeAvailable: () => false,
    otaEnabled: true, pendingOta: () => ({ available: false, version: null }),
    checkOta: async () => ({ available: false, version: null }),
    fetchOta: async () => { throw new Error('must not download'); },
  });
  assert.equal(result, null);
});

test('an API outage does not hide an already downloaded OTA', async () => {
  const result = await flow.findAvailableUpdate({
    getPublished: async () => { throw new Error('offline'); }, nativeAvailable: () => false,
    otaEnabled: true, pendingOta: () => ({ available: true, version: '1.1.32.1' }),
    checkOta: async () => { throw new Error('must not check again'); }, fetchOta: async () => {},
  });
  assert.equal(result.kind, 'ota');
  assert.equal(result.published, null);
});

test('startup is rescheduled after effect cleanup and reads current OTA state', async () => {
  const time = clock();
  let pendingOta = false;
  const seen = [];
  const check = async () => { seen.push(pendingOta); };
  const initialEffect = flow.createUpdateCheckScheduler(check, time.options);
  initialEffect.request(1200);
  initialEffect.dispose();
  const remountedEffect = flow.createUpdateCheckScheduler(check, time.options);
  remountedEffect.request(1200);
  await time.advance(400);
  pendingOta = true;
  await time.advance(800);
  assert.deepEqual(seen, [true]);
  remountedEffect.dispose();
});

test('foreground retries failed checks after a bounded cooldown and background cancels waiting', async () => {
  const time = clock();
  let attempts = 0;
  const scheduler = flow.createUpdateCheckScheduler(async () => { attempts++; throw new Error('offline'); }, time.options);
  scheduler.request(1200);
  await time.advance(1200);
  assert.equal(attempts, 1);
  scheduler.request();
  scheduler.request();
  assert.equal(time.pending, 1);
  scheduler.cancelScheduled();
  assert.equal(time.pending, 0);
  await time.advance(10_000);
  scheduler.request();
  await time.advance(49_999);
  assert.equal(attempts, 1);
  await time.advance(1);
  assert.equal(attempts, 2);
  scheduler.dispose();
});

test('foreground requests never overlap an in-flight check; disposal cancels queued retries', async () => {
  const time = clock();
  let release;
  let attempts = 0;
  const scheduler = flow.createUpdateCheckScheduler(async () => { attempts++; await new Promise((resolve) => { release = resolve; }); }, time.options);
  scheduler.request();
  await time.advance(0);
  scheduler.request();
  scheduler.request();
  await time.advance(65_000);
  assert.equal(attempts, 1);
  release();
  await flush();
  assert.equal(time.pending, 1);
  scheduler.dispose();
  await time.advance(65_000);
  assert.equal(attempts, 1);
});

async function pressUpdateButton(published, failReload = false, otaVersion = null) {
  const downloaded = [];
  const notices = [];
  let otaCalls = 0;
  const jsx = (type, props) => ({ type, props });
  const mockComponents = Object.fromEntries(['AppHeader', 'AppText', 'Button', 'Card', 'Screen'].map((name) => [`@/components/${name === 'AppHeader' ? 'layout' : 'ui'}/${name}`, { [name]: name }]));
  const screen = loadTs('app/app-update.tsx', {
    ...mockComponents,
    '@/components/ui/States': { LoadingState: 'LoadingState', ErrorState: 'ErrorState' },
    '@/contexts/ThemeContext': { useAppTheme: () => ({ colors: {}, isCleaning: false }) },
    '@/contexts/ToastContext': { useToast: () => ({ showToast: (message) => { notices.push(message); } }) },
    '@/hooks/useAsyncData': { useAsyncData: () => ({ data: published, loading: false, reload: async () => {} }) },
    '@/hooks/useBackToAdministration': { useBackToAdministration: () => {} },
    '@/repositories/api-repositories': { appUpdateRepository: { get: async () => published } },
    '@/theme/tokens': { palette: {}, radius: {}, spacing: {} },
    '@/utils/app-version': versions, '@/utils/app-update-flow': flow,
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'expo-router': { router: { replace: () => {} } },
    'expo-updates': { useUpdates: () => ({ isUpdatePending: true, downloadedUpdate: { manifest: { extra: { releaseVersion: otaVersion } } } }), isEnabled: true, reloadAsync: async () => { otaCalls++; if (failReload) throw new Error('reload failed'); }, checkForUpdateAsync: async () => { otaCalls++; return { isAvailable: false }; } },
    react: { useState: (initial) => [initial, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Linking: { openURL: async (url) => { downloaded.push(url); } }, Platform: { OS: 'android' }, StyleSheet: { create: (styles) => styles }, View: 'View', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl' },
  });
  const findElement = (element, predicate) => {
    if (!element || typeof element !== 'object') return null;
    if (predicate(element)) return element;
    for (const child of [element.props?.children].flat(Infinity)) { const found = findElement(child, predicate); if (found) return found; }
    return null;
  };
  const tree = screen.default();
  const button = findElement(tree, (element) => element.type === 'Button' && element.props.label === 'Descarcă și actualizează');
  assert.ok(button);
  button.props.onPress();
  await flush();
  return { downloaded, otaCalls, notices, availableVersion: findElement(tree, (element) => element.props?.label === 'Disponibilă')?.props.value };
}

test('the actual update screen downloads the APK before applying a pending OTA', async () => {
  const { downloaded, otaCalls } = await pressUpdateButton(info);
  assert.deepEqual(downloaded, [info.downloadUrl]);
  assert.equal(otaCalls, 0);
});

test('an OTA reload failure never downloads an equal/older APK as fallback', async () => {
  const { downloaded, otaCalls, notices } = await pressUpdateButton({ ...info, latestBuildNumber: 31 }, true);
  assert.deepEqual(downloaded, []);
  assert.equal(otaCalls, 1);
  assert.ok(notices.includes('Actualizarea nu a putut fi verificată acum.'));
});

test('pending-only OTA shows its manifest version or an OTA label, never Android metadata', async () => {
  const currentApk = { ...info, latestBuildNumber: 31 };
  const versioned = await pressUpdateButton(currentApk, false, '1.1.31.3');
  assert.equal(versioned.availableVersion, '1.1.31.3');
  const unversioned = await pressUpdateButton(currentApk);
  assert.equal(unversioned.availableVersion, 'OTA disponibil');
});
