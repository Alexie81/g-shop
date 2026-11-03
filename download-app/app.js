const desktopButtons = document.querySelectorAll('.desktop-coming');
const androidButtons = document.querySelectorAll('#heroDownload,#androidDownload');
let apkReady = false;
const fallbackApkUrl = new URL('./g-shop-android.apk', window.location.href).href;

async function apkExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok && !/text\/html/i.test(response.headers.get('content-type') || '');
  } catch {
    return false;
  }
}

async function resolveAndroidDownload() {
  try {
    const response = await fetch('https://reparatiicalculatoare-bucuresti.ro/app-api/app-update', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const { data } = response.ok ? await response.json() : {};
    if (data?.downloadUrl) {
      const url = new URL(data.downloadUrl, window.location.href);
      if (url.protocol === 'https:' && /\.apk$/i.test(url.pathname) && await apkExists(url.href)) {
        androidButtons.forEach((link) => { link.href = url.href; });
        const versionLabel = document.getElementById('versionLabel');
        if (versionLabel && data.latestVersion) versionLabel.textContent = `✓ Versiunea ${data.latestVersion}`;
        apkReady = true;
        return;
      }
    }
  } catch {
    // The stable file also serves older/cached download pages during a release.
  }
  apkReady = await apkExists(fallbackApkUrl);
}

resolveAndroidDownload();

androidButtons.forEach((button) => button.addEventListener('click', (event) => {
  if (apkReady) return;
  event.preventDefault();
  if (window.Swal) {
    window.Swal.fire({
      icon: 'info',
      title: 'Build în curs',
      text: 'Pregătim acum versiunea Android de producție. Revino în câteva minute.',
      confirmButtonText: 'Am înțeles',
      confirmButtonColor: '#0967f2',
    });
  }
}));

desktopButtons.forEach((button) => button.addEventListener('click', () => {
  if (window.Swal) {
    window.Swal.fire({
      icon: 'info',
      title: 'Va urma',
      text: 'Versiunea pentru calculator este în lucru.',
      confirmButtonText: 'Am înțeles',
      confirmButtonColor: '#0967f2',
      customClass: { popup: 'gshop-modal' },
    });
    return;
  }
  window.alert('Va urma — versiunea pentru calculator este în lucru.');
}));
