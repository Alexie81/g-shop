"""Stage, verify and publish an Android APK; defaults to a network-free dry run.

Credentials are read only from GSHOP_FTP_HOST, GSHOP_FTP_USER and
GSHOP_FTP_PASSWORD. This hosting account starts above the domain directories,
without public_html. HTTPS verification always validates TLS certificates;
--insecure-ftps affects only the hosting provider's mismatched FTPS certificate.

Only the shared main API .env is updated. Unrelated configuration is preserved
byte-for-byte, and old .env/canonical APK/app.js copies remain in protected
app-api/storage/deploy/android-<release-id>/ for rollback. The immutable versioned
APK remains available after a rollback, but is no longer advertised.
"""

import argparse
import base64
from datetime import datetime, timezone
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import ssl
import sys
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = 'reparatiicalculatoare-bucuresti.ro'
REMOTE_API = f'{DOMAIN}/app-api'
REMOTE_DOWNLOAD = f'{DOMAIN}/download-app'
BASE_URL = f'https://{DOMAIN}'
METADATA_KEYS = (
    'APP_ANDROID_VERSION', 'APP_ANDROID_BUILD_NUMBER', 'APP_ANDROID_DOWNLOAD_URL',
    'APP_ANDROID_RELEASE_NOTES', 'APP_ANDROID_PUBLISHED_AT', 'APP_ANDROID_MANDATORY',
)

# No configuration values or credentials leave the server. The manifest contains
# public release metadata, expected hashes and unpredictable staging basenames.
PHP_HELPER = r'''<?php
declare(strict_types=1);
ini_set('display_errors','0');
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals('__TOKEN_HASH__',hash('sha256',(string)($_SERVER['HTTP_X_DEPLOY_TOKEN']??'')))) { http_response_code(404);exit; }
header('Content-Type: application/json');header('Cache-Control: no-store');set_time_limit(240);
$m=json_decode(base64_decode('__MANIFEST__'),true,512,JSON_THROW_ON_ERROR);
$base=dirname(__DIR__).'/download-app';$env=__DIR__.'/.env';
$backup=__DIR__.'/storage/deploy/android-'.$m['id'];
function fail(string $message): never {throw new RuntimeException($message);}
function digest(string $path): string {return is_file($path)?(string)hash_file('sha256',$path):'';}
function checked(string $path,string $hash,int $size): void {
    clearstatcache(true,$path);
    if(is_link($path)||!is_file($path)||filesize($path)!==$size||!hash_equals($hash,digest($path)))fail('Artifact integrity check failed');
}
function atomicCopy(string $source,string $target,int $mode=0644): void {
    if(is_link($target))fail('Unexpected target symlink');
    $tmp=tempnam(dirname($target),'.android-release-');
    try {
        if($tmp===false||!copy($source,$tmp)||!chmod($tmp,$mode)||!hash_equals(digest($source),digest($tmp))||!rename($tmp,$target))fail('Atomic file replacement failed');
    } finally {if(is_string($tmp)&&is_file($tmp))unlink($tmp);}
}
function patchEnv(string $bytes,array $values): string {
    $keys=['APP_ANDROID_VERSION','APP_ANDROID_BUILD_NUMBER','APP_ANDROID_DOWNLOAD_URL','APP_ANDROID_RELEASE_NOTES','APP_ANDROID_PUBLISHED_AT','APP_ANDROID_MANDATORY'];
    if(array_keys($values)!==$keys)fail('Invalid release metadata keys');
    $newline=str_contains($bytes,"\r\n")?"\r\n":"\n";$seen=[];
    $patched=preg_replace_callback('/^([ \t]*)(APP_ANDROID_(?:VERSION|BUILD_NUMBER|DOWNLOAD_URL|RELEASE_NOTES|PUBLISHED_AT|MANDATORY))[ \t]*=[^\r\n]*/m',function($match)use($values,&$seen){
        $seen[$match[2]]=true;return $match[1].$match[2].'='.$values[$match[2]];
    },$bytes);
    if(!is_string($patched))fail('Cannot prepare environment update');
    foreach($values as$key=>$value)if(!isset($seen[$key])){
        if($patched!==''&&!str_ends_with($patched,"\n"))$patched.=$newline;
        $patched.=$key.'='.$value.$newline;
    }
    return $patched;
}
function saveState(string $backup,array $state): void {
    $tmp=$backup.'/state.tmp';
    if(file_put_contents($tmp,json_encode($state,JSON_THROW_ON_ERROR),LOCK_EX)===false||!rename($tmp,$backup.'/state.json'))fail('Cannot save release state');
    chmod($backup.'/state.json',0600);
}
function restoreRelease(string $backup,array &$state): void {
    // Refuse to overwrite configuration/files changed by someone after this release.
    foreach($state['files']as$file){
        $now=digest($file['target']);
        if($now!==$file['before']&&$now!==$file['after'])fail('Rollback conflict: a release file changed externally');
    }
    foreach(array_reverse($state['files'])as$file){
        if($file['before']==='') {if(is_file($file['target'])&&!unlink($file['target']))fail('Cannot restore missing file');}
        else atomicCopy($backup.'/'.$file['name'],$file['target'],$file['mode']);
    }
    $state['status']='rolled-back';saveState($backup,$state);
}
try {
    if(is_link($base)||!is_dir($base)||is_link($env)||!is_file($env))fail('Invalid release directories');
    $deploy=__DIR__.'/storage/deploy';
    if(is_link(__DIR__.'/storage')||is_link($deploy))fail('Unexpected storage symlink');
    if(!is_dir($deploy)&&!mkdir($deploy,0750,true))fail('Cannot create protected deployment directory');
    if(file_put_contents($deploy.'/.htaccess',"Require all denied\n",LOCK_EX)===false)fail('Cannot protect rollback storage');
    $lock=fopen($deploy.'/android-release.lock','c');if(!$lock||!flock($lock,LOCK_EX))fail('Cannot lock release');
    $request=json_decode(file_get_contents('php://input'),true,512,JSON_THROW_ON_ERROR);
    $action=$request['action']??'';
    $target=$base.'/'.$m['apkName'];
    if($action==='stage'){
        $currentEnv=file_get_contents($env);if(!is_string($currentEnv))fail('Cannot read current environment');
        $currentBuild='0';
        if(preg_match('/^[ \t]*APP_ANDROID_BUILD_NUMBER[ \t]*=([^\r\n]*)/m',$currentEnv,$matches))$currentBuild=trim($matches[1]," \t\"'");
        if(!ctype_digit($currentBuild)||(int)$currentBuild>=(int)$m['metadata']['APP_ANDROID_BUILD_NUMBER'])fail('Candidate build must be newer than the server build');
        if(!is_dir($backup)&&!mkdir($backup,0700))fail('Cannot create rollback directory');
        $stage=$base.'/'.$m['apkStage'];
        if(is_file($target))checked($target,$m['apkHash'],$m['apkSize']);
        else {checked($stage,$m['apkHash'],$m['apkSize']);if(!chmod($stage,0644)||!rename($stage,$target))fail('Cannot publish versioned APK');}
        checked($target,$m['apkHash'],$m['apkSize']);
        checked($base.'/'.$m['scriptStage'],$m['scriptHash'],$m['scriptSize']);
        $state=['status'=>'staged','envBefore'=>digest($env),'files'=>[]];saveState($backup,$state);
        echo json_encode(['status'=>'staged','sha256'=>$m['apkHash'],'size'=>$m['apkSize']]);
    } elseif($action==='commit') {
        $state=json_decode(file_get_contents($backup.'/state.json'),true,512,JSON_THROW_ON_ERROR);
        if($state['status']!=='staged'||!hash_equals($state['envBefore'],digest($env)))fail('Environment changed since staging; publish again');
        if(($request['verifiedSha256']??'')!==$m['apkHash']||($request['verifiedSize']??0)!==$m['apkSize'])fail('Public HTTPS verification is required before commit');
        checked($target,$m['apkHash'],$m['apkSize']);
        checked($base.'/'.$m['scriptStage'],$m['scriptHash'],$m['scriptSize']);
        $bytes=file_get_contents($env);if(!is_string($bytes))fail('Cannot read current environment');
        $next=patchEnv($bytes,$m['metadata']);
        if(file_put_contents($backup.'/environment.next',$next,LOCK_EX)===false)fail('Cannot stage environment');
        chmod($backup.'/environment.next',0600);
        $plan=[
            ['name'=>'canonical.apk','target'=>$base.'/g-shop-android.apk','source'=>$target,'mode'=>0644],
            ['name'=>'app.js','target'=>$base.'/app.js','source'=>$base.'/'.$m['scriptStage'],'mode'=>0644],
            ['name'=>'environment.before','target'=>$env,'source'=>$backup.'/environment.next','mode'=>(fileperms($env)&0777)],
        ];
        foreach($plan as$file){
            if(is_link($file['target']))fail('Unexpected release target symlink');
            $file['before']=digest($file['target']);$file['after']=digest($file['source']);
            if($file['before']!=='')atomicCopy($file['target'],$backup.'/'.$file['name'],0600);
            $state['files'][]=$file;
        }
        $state['status']='committing';saveState($backup,$state);
        try {
            // The shared metadata is always the final switch.
            foreach($state['files']as$file)atomicCopy($file['source'],$file['target'],$file['mode']);
            $state['status']='committed';saveState($backup,$state);
        } catch(Throwable $error){restoreRelease($backup,$state);throw $error;}
        echo json_encode(['status'=>'committed','backup'=>'app-api/storage/deploy/android-'.$m['id']]);
    } elseif($action==='rollback') {
        $state=json_decode(file_get_contents($backup.'/state.json'),true,512,JSON_THROW_ON_ERROR);
        if(in_array($state['status'],['committing','committed'],true))restoreRelease($backup,$state);
        echo json_encode(['status'=>$state['status']]);
    } else fail('Unknown release action');
} catch(Throwable $error){http_response_code(500);echo json_encode(['error'=>$error->getMessage()]);}
'''


def file_digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def release_manifest(args, release_id):
    artifact = args.artifact.resolve()
    script = args.download_script.resolve()
    if not artifact.is_file() or artifact.suffix.lower() != '.apk':
        raise ValueError('Provide a local, finished .apk artifact.')
    with zipfile.ZipFile(artifact) as archive:
        if 'AndroidManifest.xml' not in archive.namelist() or archive.testzip() is not None:
            raise ValueError('Artifact is not a complete valid Android APK.')
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?', args.version):
        raise ValueError('Version must be a numeric semantic version, optionally with a prerelease suffix.')
    if args.build < 1:
        raise ValueError('Build number must be positive.')
    notes = list(args.notes or [])
    if args.notes_file:
        notes.extend(line.strip() for line in args.notes_file.read_text(encoding='utf-8-sig').splitlines() if line.strip())
    if not notes or any(not note.strip() or any(char in note for char in '\r\n\0|') for note in notes):
        raise ValueError('Provide at least one release note; each note must be a single line without |.')
    name = f'g-shop-android-{args.version}-{args.build}.apk'
    metadata = dict(zip(METADATA_KEYS, [
        args.version, str(args.build), f'{BASE_URL}/download-app/{name}',
        '|'.join(note.strip() for note in notes), datetime.now(timezone.utc).isoformat(timespec='seconds'),
        '1' if args.mandatory else '0',
    ]))
    if not script.is_file():
        raise ValueError('Download page app.js is missing.')
    return artifact, script, {
        'id': release_id, 'apkName': name, 'apkStage': f'.android-{release_id}.apk.part',
        'apkHash': file_digest(artifact), 'apkSize': artifact.stat().st_size,
        'scriptStage': f'.android-{release_id}.js.part', 'scriptHash': file_digest(script),
        'scriptSize': script.stat().st_size, 'metadata': metadata,
    }


def render_helper(manifest, token):
    encoded = base64.b64encode(json.dumps(manifest, ensure_ascii=False).encode()).decode()
    return PHP_HELPER.replace('__TOKEN_HASH__', hashlib.sha256(token.encode()).hexdigest()).replace('__MANIFEST__', encoded).encode()


def fresh_url(url):
    return url + ('&' if '?' in url else '?') + 'releaseCheck=' + secrets.token_hex(8)


def verify_https(url, expected_hash, expected_size):
    if not url.startswith(BASE_URL + '/'):
        raise ValueError('Artifact verification must use the production HTTPS origin.')
    digest = hashlib.sha256()
    size = 0
    request = urllib.request.Request(fresh_url(url), headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity'})
    with urllib.request.urlopen(request, timeout=180) as response:
        if response.status != 200 or not response.url.startswith(BASE_URL + '/'):
            raise RuntimeError('Unexpected artifact HTTP response or redirect.')
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > expected_size:
                raise RuntimeError('Public artifact size exceeds the verified local artifact.')
            digest.update(chunk)
    if size != expected_size or digest.hexdigest() != expected_hash:
        raise RuntimeError('Public artifact SHA-256 or size does not match; metadata remains unchanged.')
    return {'verifiedSha256': digest.hexdigest(), 'verifiedSize': size}


def helper_request(url, token, action, **fields):
    request = urllib.request.Request(url, data=json.dumps({'action': action, **fields}).encode(),
                                     headers={'Content-Type': 'application/json', 'X-Deploy-Token': token}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=260) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        # Never echo arbitrary proxy/server responses or environment contents.
        try:
            detail = json.loads(error.read(8192)).get('error', 'Release helper failed.')
        except (ValueError, AttributeError):
            detail = 'Release helper failed.'
        raise RuntimeError(f'{action}: {detail}') from None
    if result.get('error'):
        raise RuntimeError(f'{action}: {result["error"]}')
    return result


def current_metadata():
    request = urllib.request.Request(fresh_url(f'{BASE_URL}/app-api/app-update'),
                                     headers={'Cache-Control': 'no-cache', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        actual = json.load(response).get('data', {})
    if not isinstance(actual, dict):
        raise RuntimeError('Shared update endpoint returned invalid metadata.')
    return actual


def check_newer_build(candidate, current):
    existing = current.get('latestBuildNumber')
    if isinstance(existing, bool) or not str(existing).isdigit():
        raise RuntimeError('Cannot establish the current published build number.')
    if candidate <= int(existing):
        raise RuntimeError(f'Candidate build {candidate} must be newer than published build {existing}.')


def verify_metadata(expected):
    actual = current_metadata()
    checks = {
        'latestVersion': expected['APP_ANDROID_VERSION'],
        'latestBuildNumber': int(expected['APP_ANDROID_BUILD_NUMBER']),
        'downloadUrl': expected['APP_ANDROID_DOWNLOAD_URL'],
        'releaseNotes': expected['APP_ANDROID_RELEASE_NOTES'].split('|'),
        'publishedAt': expected['APP_ANDROID_PUBLISHED_AT'],
        'mandatory': expected['APP_ANDROID_MANDATORY'] == '1',
    }
    if any(actual.get(key) != value for key, value in checks.items()):
        raise RuntimeError('Shared update endpoint did not return the exact new release metadata.')


def publish(args, artifact, script, manifest):
    user, password = os.environ.get('GSHOP_FTP_USER'), os.environ.get('GSHOP_FTP_PASSWORD')
    if not user or not password:
        raise ValueError('Set GSHOP_FTP_USER and GSHOP_FTP_PASSWORD in the environment.')
    # Read-only preflight before even opening FTP. The helper repeats this check
    # against the server .env in case another publisher races this request.
    check_newer_build(args.build, current_metadata())
    token = secrets.token_hex(32)
    helper_name = f'android-release-{manifest["id"]}.php'
    helper_path = f'{REMOTE_API}/{helper_name}'
    helper_url = f'{BASE_URL}/app-api/{helper_name}'
    context = ssl._create_unverified_context() if args.insecure_ftps else ssl.create_default_context()
    ftp = ftplib.FTP_TLS(context=context, timeout=180)
    uploaded = []
    commit_attempted = False
    keep_helper = False
    try:
        ftp.connect(os.environ.get('GSHOP_FTP_HOST', f'ftp.{DOMAIN}'), 21)
        ftp.login(user, password)
        ftp.prot_p()
        account_root = ftp.pwd()
        ftp.cwd(REMOTE_DOWNLOAD)  # Require the existing site; never guess public_html.
        ftp.cwd(account_root)
        for path, stage in [(artifact, manifest['apkStage']), (script, manifest['scriptStage'])]:
            remote = f'{REMOTE_DOWNLOAD}/{stage}'
            uploaded.append(remote)
            with path.open('rb') as stream:
                ftp.storbinary('STOR ' + remote, stream, blocksize=1024 * 1024)
            if ftp.size(remote) != path.stat().st_size:
                raise RuntimeError('FTPS upload size mismatch.')
        helper = render_helper(manifest, token)
        uploaded.append(helper_path)
        # This provider limits large PHP uploads; APPE avoids that limit.
        for offset in range(0, len(helper), 4096):
            command = 'STOR ' if offset == 0 else 'APPE '
            ftp.storbinary(command + helper_path, io.BytesIO(helper[offset:offset + 4096]))
        if ftp.size(helper_path) != len(helper):
            raise RuntimeError('Release helper upload size mismatch.')
        helper_request(helper_url, token, 'stage')
        print('Versioned APK staged. Verifying its complete bytes over public HTTPS...', flush=True)
        verification = verify_https(manifest['metadata']['APP_ANDROID_DOWNLOAD_URL'], manifest['apkHash'], manifest['apkSize'])
        commit_attempted = True
        result = helper_request(helper_url, token, 'commit', **verification)
        verify_metadata(manifest['metadata'])
        verify_https(f'{BASE_URL}/download-app/g-shop-android.apk', manifest['apkHash'], manifest['apkSize'])
        verify_https(f'{BASE_URL}/download-app/app.js', manifest['scriptHash'], manifest['scriptSize'])
        print(json.dumps({'status': 'verified', 'downloadUrl': manifest['metadata']['APP_ANDROID_DOWNLOAD_URL'],
                          'downloadPage': f'{BASE_URL}/download-app/', 'sha256': manifest['apkHash'],
                          'size': manifest['apkSize'], 'rollbackBackup': result['backup']}, ensure_ascii=False))
    except BaseException:
        if commit_attempted:
            try:
                result = helper_request(helper_url, token, 'rollback')
                print('Release was not confirmed; rollback status:', result['status'], file=sys.stderr)
            except Exception:
                keep_helper = True
                # Store the one-use token only in an ignored local file, never stdout.
                recovery = ROOT / 'tmp' / f'android-release-{manifest["id"]}-recovery.json'
                recovery.parent.mkdir(exist_ok=True)
                recovery.write_text(json.dumps({'helperUrl': helper_url, 'token': token,
                                                'backup': f'{REMOTE_API}/storage/deploy/android-{manifest["id"]}'}), encoding='utf-8')
                print('Automatic rollback could not be confirmed. Private recovery details:', recovery, file=sys.stderr)
        raise
    finally:
        if uploaded:
            try:
                ftp.voidcmd('NOOP')
            except (OSError, EOFError, ftplib.Error):
                # Hashing the APK over HTTPS can outlast the FTP idle timeout.
                ftp.close()
                ftp = ftplib.FTP_TLS(context=context, timeout=60)
                try:
                    ftp.connect(os.environ.get('GSHOP_FTP_HOST', f'ftp.{DOMAIN}'), 21)
                    ftp.login(user, password)
                    ftp.prot_p()
                except (OSError, EOFError, ftplib.Error):
                    print('FTP cleanup connection unavailable; inspect temporary release files.', file=sys.stderr)
        for remote in reversed(uploaded):
            if keep_helper and remote == helper_path:
                continue
            try:
                ftp.delete(remote)
            except ftplib.error_perm as error:
                if not str(error).startswith('550'):
                    print('Temporary upload cleanup requires inspection:', remote, file=sys.stderr)
            except (OSError, EOFError, AttributeError, ftplib.Error):
                print('Temporary upload cleanup requires inspection:', remote, file=sys.stderr)
        try:
            ftp.quit()
        except (OSError, EOFError, AttributeError, ftplib.Error):
            ftp.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--build', type=int, required=True)
    parser.add_argument('--notes', action='append', help='Repeat once per release note.')
    parser.add_argument('--notes-file', type=Path, help='UTF-8 file with one note per line.')
    parser.add_argument('--mandatory', action='store_true')
    parser.add_argument('--download-script', type=Path, default=ROOT / 'download-app' / 'app.js')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--publish', action='store_true', help='Upload and publish; without this flag no network is used.')
    mode.add_argument('--dry-run', action='store_true', help='Validate locally only (the default).')
    parser.add_argument('--insecure-ftps', action='store_true', help='Allow the hosting FTPS certificate mismatch; HTTPS stays verified.')
    args = parser.parse_args()
    manifest_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(6)
    try:
        artifact, script, manifest = release_manifest(args, manifest_id)
        print(json.dumps({'mode': 'publish' if args.publish else 'dry-run', 'version': args.version,
                          'build': args.build, 'sha256': manifest['apkHash'], 'size': manifest['apkSize'],
                          'downloadUrl': manifest['metadata']['APP_ANDROID_DOWNLOAD_URL'],
                          'apiEnvironment': f'{REMOTE_API}/.env', 'metadataKeys': list(METADATA_KEYS)}, ensure_ascii=False), flush=True)
        if args.publish:
            publish(args, artifact, script, manifest)
    except (ValueError, OSError, RuntimeError, zipfile.BadZipFile, ftplib.Error) as error:
        # Exception messages are generated by local validation or the purpose-built
        # helper. FTP authentication errors do not include the supplied credentials.
        print(f'Publication failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
