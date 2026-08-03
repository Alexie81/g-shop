<?php
declare(strict_types=1);
require __DIR__.'/src/bootstrap.php';
require __DIR__.'/src/push_notifications.php';

header('Content-Type: application/json; charset=utf-8');
$expected=trim(env_value('PUSH_CRON_TOKEN',''));
$provided=trim((string)($_SERVER['HTTP_X_CRON_KEY']??$_GET['key']??''));
if(PHP_SAPI!=='cli'&&($expected===''||!hash_equals($expected,$provided))){http_response_code(403);echo json_encode(['message'=>'Acces interzis.']);exit;}
try{echo json_encode(['data'=>gshop_notify_all_properties(),'runAt'=>gmdate('c')],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);}
catch(Throwable$error){http_response_code(500);echo json_encode(['message'=>'Notificările nu au putut fi procesate.']);error_log($error->getMessage());}
