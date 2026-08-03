const desktopButtons = document.querySelectorAll('.desktop-coming');
const androidButtons = document.querySelectorAll('#heroDownload,#androidDownload');
let apkReady = false;

fetch('./g-shop-android.apk', { method: 'HEAD', cache: 'no-store' })
  .then((response) => { apkReady = response.ok; })
  .catch(() => { apkReady = false; });

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

fetch('https://reparatiicalculatoare-bucuresti.ro/app-api/app-update', { headers: { Accept: 'application/json' } })
  .then((response) => response.ok ? response.json() : Promise.reject())
  .then(({ data }) => {
    if (!data) return;
    const versionLabel = document.getElementById('versionLabel');
    if (versionLabel && data.latestVersion) versionLabel.innerHTML = `<b>✓</b> Versiunea ${data.latestVersion}`;
    if (data.downloadUrl && /\.apk(?:\?|$)/i.test(data.downloadUrl)) {
      document.querySelectorAll('#heroDownload,#androidDownload').forEach((link) => { link.href = data.downloadUrl; });
    }
  })
  .catch(() => undefined);
