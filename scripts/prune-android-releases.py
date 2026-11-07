"""Keep one verified published G-Shop APK. Dry-run unless --apply is supplied.

Only named G-Shop APKs in this checkout and the production download directory,
plus APK copies in protected deployment backups, are eligible. Public old URLs
redirect to the current APK; source, database and document backups are untouched.
"""
import argparse
import ftplib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import ssl
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REMOTE = 'reparatiicalculatoare-bucuresti.ro/download-app'
BACKUPS = 'reparatiicalculatoare-bucuresti.ro/app-api/storage/deploy'
PATTERN = re.compile(r'g-shop-android(?:-\d[\dA-Za-z.-]*)?\.apk')
START, END = '# BEGIN GSHOP LATEST APK', '# END GSHOP LATEST APK'


def routing_rules(previous, latest):
    if not PATTERN.fullmatch(latest): raise ValueError('Invalid current APK filename')
    managed = f'{START}\nRewriteEngine On\nRewriteCond %{{REQUEST_FILENAME}} !-f\nRewriteRule ^g-shop-android(?:-[0-9][0-9A-Za-z.-]*)?\\.apk$ /download-app/{latest} [R=302,L,NE]\n{END}'
    if START in previous:
        if previous.count(START) != 1 or previous.count(END) != 1: raise ValueError('Ambiguous redirect configuration')
        return re.sub(re.escape(START)+r'.*?'+re.escape(END), lambda _: managed, previous, flags=re.S)
    return previous.rstrip()+'\n'+managed+'\n'


def local_candidates(latest):
    result = []
    for directory, dirs, files in os.walk(ROOT, followlinks=False):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules') and not Path(directory, d).is_symlink()]
        for name in files:
            if not PATTERN.fullmatch(name): continue
            path = Path(directory, name)
            if path.is_symlink() or not path.resolve().is_relative_to(ROOT): raise ValueError('Unsafe local APK path')
            if path.resolve() != latest: result.append(path)
    return result


def backup_apks(ftp, directory=BACKUPS):
    result = []
    for name, meta in ftp.mlsd(directory):
        if name in ('.', '..') or '/' in name: continue
        path = directory+'/'+name
        if meta.get('type') == 'dir': result.extend(backup_apks(ftp, path))
        elif meta.get('type') == 'file' and name.endswith('.apk'): result.append((path, int(meta['size'])))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--insecure-ftps', action='store_true')
    args = parser.parse_args()
    latest = args.artifact.resolve()
    if not latest.is_relative_to(ROOT) or not latest.is_file() or not PATTERN.fullmatch(latest.name): raise ValueError('Expected a G-Shop APK inside this checkout')
    spec = importlib.util.spec_from_file_location('release', ROOT/'scripts/publish-android-release.py')
    release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)
    metadata = release.current_metadata()
    url = f'{release.BASE_URL}/download-app/{latest.name}'
    if metadata.get('downloadUrl') != url: raise ValueError('Local artifact is not the current public release')
    digest = release.file_digest(latest); size = latest.stat().st_size
    release.verify_https(url, digest, size)
    ftp = ftplib.FTP_TLS(context=ssl._create_unverified_context() if args.insecure_ftps else ssl.create_default_context(), timeout=90)
    ftp.connect(os.environ.get('GSHOP_FTP_HOST', 'ftp.reparatiicalculatoare-bucuresti.ro'))
    ftp.login(os.environ['GSHOP_FTP_USER'], os.environ['GSHOP_FTP_PASSWORD']); ftp.prot_p()
    try:
        remote = [(REMOTE+'/'+name, int(meta['size'])) for name, meta in ftp.mlsd(REMOTE) if meta.get('type') == 'file' and PATTERN.fullmatch(name) and name != latest.name]
        remote += backup_apks(ftp)
        local = local_candidates(latest)
        report = {'mode': 'apply' if args.apply else 'dry-run', 'keep': latest.name, 'remoteFiles': len(remote), 'remoteBytes': sum(s for _, s in remote), 'localFiles': len(local), 'localBytes': sum(p.stat().st_size for p in local)}
        print(json.dumps(report), flush=True)
        if not args.apply: return
        config = io.BytesIO()
        try: ftp.retrbinary('RETR '+REMOTE+'/.htaccess', config.write)
        except ftplib.error_perm as error:
            if not str(error).startswith('550'): raise
        new_config = routing_rules(config.getvalue().decode(), latest.name).encode()
        stage = REMOTE+'/.htaccess.gshop-next'
        ftp.storbinary('STOR '+stage, io.BytesIO(new_config))
        if ftp.size(stage) != len(new_config): raise RuntimeError('Redirect upload failed')
        ftp.rename(stage, REMOTE+'/.htaccess')
        # The rule must work before removing any APK (use an absent old filename).
        probe = f'{release.BASE_URL}/download-app/g-shop-android-0.0.0-0.apk'
        with urllib.request.urlopen(urllib.request.Request(probe, method='HEAD'), timeout=30) as response:
            if response.status != 200 or response.url != url: raise RuntimeError('Old APK redirect did not resolve to the current file')
        # Refuse to prune if a concurrent release changed the advertised file.
        if release.current_metadata().get('downloadUrl') != url: raise RuntimeError('Release changed during cleanup')
        for path, _ in remote:
            if not (path.startswith(REMOTE+'/') or path.startswith(BACKUPS+'/')) or '..' in path.split('/'): raise ValueError('Unsafe remote APK path')
            ftp.delete(path)
        for path in local: path.unlink()
        release.verify_https(f'{release.BASE_URL}/download-app/g-shop-android.apk', digest, size)
        remaining = [name for name, meta in ftp.mlsd(REMOTE) if meta.get('type') == 'file' and name.endswith('.apk')]
        if remaining != [latest.name]: raise RuntimeError('Unexpected APKs remain on server: '+str(remaining))
        if local_candidates(latest) or backup_apks(ftp): raise RuntimeError('Old APK copies remain')
        (ROOT/'tmp/android-cleanup-result.json').write_text(json.dumps(report, indent=2))
        print('Verified: one APK on server and in checkout; old download URLs redirect to it.')
    finally: ftp.quit()


if __name__ == '__main__': main()
