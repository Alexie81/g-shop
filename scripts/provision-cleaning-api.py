"""Provision the dedicated cleaning API through a short-lived authenticated deploy helper.

Credentials: GSHOP_FTP_HOST, GSHOP_FTP_USER, GSHOP_FTP_PASSWORD.
Default: only the new API. --publish-shared also deploys the compatible changes to
the existing APIs after the new API has been tested. No customer files are copied.
"""
import argparse
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import ssl
import urllib.request
import urllib.error
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['index.php', 'client-form.php', 'src/cleaning_orders.php', 'src/cleaning_document_pdf.php',
         'src/service_document_pdf.php', 'src/push_notifications.php', 'assets/cleaning/logo.png',
         'src/cleaning_promotion.php', 'cleaning-business-card.php', 'assets/cleaning/business-card.png']
parser = argparse.ArgumentParser()
parser.add_argument('--publish-shared', action='store_true')
parser.add_argument('--insecure-ftps', action='store_true', help='For the hosting provider certificate mismatch only')
args = parser.parse_args()
secret = secrets.token_hex(32)
suffix = secrets.token_hex(12)
helper = 'cleaning-deploy-' + suffix + '.php'
archive = 'cleaning-deploy-' + suffix + '.zip'
source = 'reparatiicalculatoare-bucuresti.ro/app-api'
url = 'https://reparatiicalculatoare-bucuresti.ro/app-api/' + helper
manifest = {name: hashlib.sha256((ROOT / 'api' / name).read_bytes()).hexdigest() for name in FILES}

php = r'''<?php
declare(strict_types=1);
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals('__SECRET_HASH__',hash('sha256',(string)($_SERVER['HTTP_X_DEPLOY_TOKEN']??'')))) { http_response_code(404);exit; }
header('Content-Type: application/json');header('Cache-Control: no-store');
set_time_limit(180);
try {
    $base=realpath(dirname(__DIR__,2));
    $domain=realpath($base.'/curatatorie-canapele.ro');
    if(!$base || !$domain || dirname($domain)!==$base || is_link($domain))throw new RuntimeException('Invalid domain directory');
    $target=$domain.'/app-api';
    if(is_link($target))throw new RuntimeException('API directory must not be a symlink');
    $new=!is_dir($target);
    if($new && !mkdir($target,0755,true))throw new RuntimeException('Cannot create API directory');
    $copyTree=function(string $from,string $to)use(&$copyTree):void{
        if(is_link($from))throw new RuntimeException('Unexpected source symlink');
        if(is_dir($from)){if(!is_dir($to)&&!mkdir($to,0755,true))throw new RuntimeException('Cannot create dependency directory');foreach(scandir($from)as$name)if($name!=='.'&&$name!=='..')$copyTree($from.'/'.$name,$to.'/'.$name);}
        else {
            $expected=hash_file('sha256',$from);
            if(is_file($to) && hash_equals($expected,hash_file('sha256',$to)))return;
            @copy($from,$to);clearstatcache(true,$to);
            if(!is_file($to)||!hash_equals($expected,hash_file('sha256',$to)))throw new RuntimeException('Dependency copy failed: '.$from.' ('.(error_get_last()['message']??'unknown').')');
        }
    };
    if($new || !is_file($target.'/vendor/autoload.php') || !is_file($target.'/.installed')) {
        // Protect configuration before copying it; retain the shared database/key.
        foreach(['.htaccess','.env','.installed','index.php','client-form.php','src','vendor','assets']as$name){if(!file_exists(__DIR__.'/'.$name))throw new RuntimeException('Missing source dependency: '.$name);$copyTree(__DIR__.'/'.$name,$target.'/'.$name);}
        mkdir($target.'/storage',0750,true);mkdir($target.'/uploads',0755,true);
        file_put_contents($target.'/storage/.htaccess',"Require all denied\n");
    }
    $zip=new ZipArchive();if($zip->open(__DIR__.'/storage/deploy/__ARCHIVE__')!==true)throw new RuntimeException('Cannot open deploy archive');
    $manifest=json_decode('__MANIFEST__',true,512,JSON_THROW_ON_ERROR);
    $targets=[$target];
    if(__PUBLISH_SHARED__)foreach(['reparatiicalculatoare-bucuresti.ro','gshop-trotinete.ro','calculatoareprofesionale.ro']as$name){$path=realpath($base.'/'.$name.'/app-api');if(!$path || dirname(dirname($path))!==$base)throw new RuntimeException('Invalid existing API');$targets[]=$path;}
    foreach($targets as$api){
        $backup=$api.'/storage/deploy/backups-__SUFFIX__';if(!is_dir($backup))mkdir($backup,0750,true);
        // index.php is installed last so required files are always present first.
        $ordered=array_keys($manifest);usort($ordered,fn($a,$b)=>($a==='index.php')<=>($b==='index.php'));
        foreach($ordered as$name){
            if(str_contains($name,'..') || str_starts_with($name,'/'))throw new RuntimeException('Invalid archive path');
            $bytes=$zip->getFromName($name);if(!is_string($bytes)||!hash_equals($manifest[$name],hash('sha256',$bytes)))throw new RuntimeException('Archive integrity failed: '.$name);
            $path=$api.'/'.$name;if(!is_dir(dirname($path)))mkdir(dirname($path),0755,true);
            if(is_file($path)){if(!is_dir(dirname($backup.'/'.$name)))mkdir(dirname($backup.'/'.$name),0750,true);if(!copy($path,$backup.'/'.$name))throw new RuntimeException('Cannot back up '.$name);}
            $temp=tempnam(dirname($path),'.deploy-');if($temp===false || file_put_contents($temp,$bytes,LOCK_EX)===false || !rename($temp,$path))throw new RuntimeException('Cannot publish '.$name);
            chmod($path,0644);if(function_exists('opcache_invalidate'))opcache_invalidate($path,true);
            if(!hash_equals($manifest[$name],hash_file('sha256',$path)))throw new RuntimeException('Published integrity failed');
        }
    }
    $zip->close();
    define('GSHOP_API_LIBRARY_ONLY',true);require $target.'/index.php';
    $actor=user_record(primary_admin_id());$property=ensure_cleaning_property($actor);
    [$token,$expires]=jwt_issue($actor['id']);
    echo json_encode(['property'=>$property,'targets'=>count($targets),'verifiedFiles'=>count($manifest),'accessToken'=>$token,'expires'=>$expires,'database'=>env_value('DB_NAME'),'createdApi'=>$new],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
} catch(Throwable $error){http_response_code(500);echo json_encode(['error'=>$error->getMessage()]);}
'''
php = php.replace('__SECRET_HASH__', hashlib.sha256(secret.encode()).hexdigest()).replace('__ARCHIVE__', archive)
php = php.replace('__MANIFEST__', json.dumps(manifest, separators=(',', ':'))).replace('__SUFFIX__', suffix)
php = php.replace('__PUBLISH_SHARED__', 'true' if args.publish_shared else 'false')
bundle = io.BytesIO()
with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as zipped:
    for name in FILES: zipped.write(ROOT / 'api' / name, name)
bundle.seek(0)
context = ssl._create_unverified_context() if args.insecure_ftps else ssl.create_default_context()
ftp = ftplib.FTP_TLS(context=context, timeout=45)
ftp.connect(os.environ.get('GSHOP_FTP_HOST', 'ftp.reparatiicalculatoare-bucuresti.ro'),21)
ftp.login(os.environ['GSHOP_FTP_USER'], os.environ['GSHOP_FTP_PASSWORD'])
ftp.prot_p()
uploaded = []
try:
    for directory in [source+'/storage', source+'/storage/deploy']:
        try: ftp.mkd(directory)
        except ftplib.error_perm as error:
            if not str(error).startswith('550'): raise
    archive_path = source+'/storage/deploy/'+archive
    uploaded.append(archive_path)
    ftp.storbinary('STOR '+archive_path, bundle)
    helper_path = source+'/'+helper
    uploaded.append(helper_path)
    helper_bytes = php.encode('utf-8')
    for offset in range(0, len(helper_bytes), 4096):
        ftp.storbinary(('STOR ' if offset == 0 else 'APPE ')+helper_path, io.BytesIO(helper_bytes[offset:offset+4096]))
    if ftp.size(helper_path) != len(helper_bytes): raise RuntimeError('Deploy helper upload size mismatch')
    request = urllib.request.Request(url, data=b'{}', headers={'Content-Type':'application/json','X-Deploy-Token':secret}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=190) as response: result=json.load(response)
    except urllib.error.HTTPError as error:
        # The helper only returns deployment diagnostics, never configuration.
        raise RuntimeError(error.read().decode('utf-8')[:1200]) from None
    private = ROOT/'tmp'/'cleaning-deployment.json'
    private.parent.mkdir(exist_ok=True)
    private.write_text(json.dumps(result), encoding='utf-8')
    print(json.dumps({key:result[key] for key in ['targets','verifiedFiles','database','createdApi']},ensure_ascii=False))
    print('Property:',result['property']['name'],result['property']['domain'])
finally:
    for name in reversed(uploaded):
        try: ftp.delete(name)
        except ftplib.error_perm: print('Cleanup requires inspection:',name)
    ftp.quit()
try:
    with urllib.request.urlopen(url, timeout=20) as response:
        raise RuntimeError('Deploy helper is still reachable: '+str(response.status))
except urllib.error.HTTPError as error:
    if error.code != 404: raise
print('Temporary deploy helper removed (HTTP 404).')
