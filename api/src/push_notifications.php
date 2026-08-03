<?php
declare(strict_types=1);

function gshop_ensure_push_tables(PDO $pdo): void {
    static $ready = false;
    if ($ready) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS push_devices (
        id BINARY(16) PRIMARY KEY,
        user_id BINARY(16) NOT NULL,
        property_id BINARY(16) NOT NULL,
        expo_push_token VARCHAR(255) NOT NULL,
        platform ENUM('android','ios') NOT NULL,
        device_name VARCHAR(120) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_seen_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uq_push_device_token (expo_push_token),
        INDEX idx_push_devices_property_active (property_id,is_active,updated_at),
        INDEX idx_push_devices_user_active (user_id,is_active,updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS push_notification_runs (
        id BINARY(16) PRIMARY KEY,
        property_id BINARY(16) NOT NULL,
        fingerprint CHAR(64) NOT NULL,
        sent_on DATE NOT NULL,
        recipients_count INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        UNIQUE KEY uq_push_run_daily (property_id,fingerprint,sent_on),
        INDEX idx_push_runs_property_date (property_id,sent_on)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $ready = true;
}

function gshop_validated_expo_push_token(mixed $value): string {
    $token = is_string($value) ? trim($value) : '';
    if (strlen($token) > 255 || preg_match('/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9._=\-]+\]$/', $token) !== 1) {
        fail('Tokenul pentru notificări push nu este valid.', 422);
    }
    return $token;
}

function gshop_register_push_device(array $user, string $propertyId, array $body): array {
    $pdo = db();
    gshop_ensure_push_tables($pdo);
    $token = gshop_validated_expo_push_token($body['token'] ?? null);
    $platform = strtolower(trim((string)($body['platform'] ?? 'android')));
    if (!in_array($platform, ['android', 'ios'], true)) fail('Platforma notificărilor nu este validă.', 422);
    $deviceName = trim((string)($body['deviceName'] ?? ''));
    if ($deviceName === '') $deviceName = null;
    if ($deviceName !== null) $deviceName = substr($deviceName, 0, 120);
    $now = now_utc();
    $existing = $pdo->prepare('SELECT '.uuid_sql('id').' id FROM push_devices WHERE expo_push_token=? LIMIT 1');
    $existing->execute([$token]);
    $id = $existing->fetchColumn() ?: uuid_v4();
    $pdo->prepare('INSERT INTO push_devices (id,user_id,property_id,expo_push_token,platform,device_name,is_active,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),property_id=VALUES(property_id),platform=VALUES(platform),device_name=VALUES(device_name),is_active=1,last_seen_at=VALUES(last_seen_at),updated_at=VALUES(updated_at)')
        ->execute([uuid_bin((string)$id),uuid_bin((string)$user['id']),uuid_bin($propertyId),$token,$platform,$deviceName,$now,$now,$now]);
    return ['id'=>(string)$id,'token'=>$token,'platform'=>$platform,'deviceName'=>$deviceName,'isActive'=>true,'lastSeenAt'=>gmdate('c',strtotime($now))];
}

function gshop_unregister_push_device(array $user, string $token): void {
    gshop_ensure_push_tables(db());
    db()->prepare('UPDATE push_devices SET is_active=0,updated_at=? WHERE expo_push_token=? AND user_id=?')
        ->execute([now_utc(),gshop_validated_expo_push_token($token),uuid_bin((string)$user['id'])]);
}

function gshop_missing_document_records(string $propertyId): array {
    ensure_service_documents_table(db());
    $sql='SELECT '.uuid_sql('s.id').' service_sheet_id,s.number service_sheet_number,TRIM(CONCAT(c.first_name,\' \',c.last_name)) client_name,MAX(CASE WHEN d.type=\'INTAKE\' THEN 1 ELSE 0 END) has_intake,MAX(CASE WHEN d.type=\'FINAL_ESTIMATE\' THEN 1 ELSE 0 END) has_final_estimate,MAX(CASE WHEN d.type=\'EXIT\' THEN 1 ELSE 0 END) has_exit,MAX(CASE WHEN d.type=\'WARRANTY\' THEN 1 ELSE 0 END) has_warranty FROM service_sheets s JOIN clients c ON c.id=s.client_id AND c.is_active=1 LEFT JOIN service_documents d ON d.service_sheet_id=s.id AND d.is_active=1 AND d.status=\'PUBLISHED\' WHERE s.property_id=? AND s.is_active=1 GROUP BY s.id,s.number,c.first_name,c.last_name ORDER BY s.received_at DESC,s.created_at DESC LIMIT 500';
    $stmt=db()->prepare($sql);$stmt->execute([uuid_bin($propertyId)]);$items=[];
    $labels=['has_intake'=>'Fișa de intrare','has_final_estimate'=>'Devizul final','has_exit'=>'Fișa de ieșire','has_warranty'=>'Certificatul de garanție'];
    foreach($stmt->fetchAll() as $row){$missing=[];foreach($labels as$key=>$label)if((int)$row[$key]!==1)$missing[]=$label;if(!$missing)continue;$items[]=['serviceSheetId'=>$row['service_sheet_id'],'serviceSheetNumber'=>$row['service_sheet_number'],'clientName'=>$row['client_name'],'missing'=>$missing];}
    return $items;
}

function gshop_expo_push_request(array $messages): array {
    if (!$messages) return [];
    $payload = json_encode($messages, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    if ($payload === false) throw new RuntimeException('Notificările push nu au putut fi serializate.');
    $headers=['Accept: application/json','Accept-Encoding: gzip, deflate','Content-Type: application/json'];
    $accessToken=trim(env_value('EXPO_ACCESS_TOKEN',''));
    if($accessToken!=='')$headers[]='Authorization: Bearer '.$accessToken;
    if(function_exists('curl_init')){
        $curl=curl_init('https://exp.host/--/api/v2/push/send');
        curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$payload,CURLOPT_HTTPHEADER=>$headers,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>8,CURLOPT_ENCODING=>'']);
        $response=curl_exec($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);$error=curl_error($curl);curl_close($curl);
        if($response===false||$status<200||$status>=300)throw new RuntimeException('Serviciul push nu a răspuns corect'.($error!==''?': '.$error:'.'));
    }else{
        $context=stream_context_create(['http'=>['method'=>'POST','header'=>implode("\r\n",$headers),'content'=>$payload,'timeout'=>8,'ignore_errors'=>true]]);
        $response=file_get_contents('https://exp.host/--/api/v2/push/send',false,$context);
        if($response===false)throw new RuntimeException('Serviciul push nu este accesibil.');
    }
    $decoded=json_decode((string)$response,true);
    if(!is_array($decoded))throw new RuntimeException('Răspunsul serviciului push nu este valid.');
    return is_array($decoded['data']??null)?$decoded['data']:[];
}

function gshop_send_expo_push(array $devices, array $content): int {
    $messages=[];
    foreach($devices as$device)$messages[]=['to'=>$device['expo_push_token'],'title'=>$content['title'],'body'=>$content['body'],'sound'=>'default','priority'=>'high','channelId'=>'service-reminders','data'=>$content['data']];
    $results=gshop_expo_push_request($messages);$sent=0;
    foreach($results as$index=>$result){
        if(($result['status']??null)==='ok'){$sent++;continue;}
        if(($result['details']['error']??null)==='DeviceNotRegistered'&&!empty($devices[$index]['expo_push_token']))db()->prepare('UPDATE push_devices SET is_active=0,updated_at=? WHERE expo_push_token=?')->execute([now_utc(),$devices[$index]['expo_push_token']]);
    }
    return$sent;
}

function gshop_notify_missing_documents(string $propertyId, bool $force = false): array {
    $pdo=db();gshop_ensure_push_tables($pdo);$items=gshop_missing_document_records($propertyId);
    if(!$items)return['sent'=>0,'missingRepairs'=>0,'deduplicated'=>false];
    $devices=$pdo->prepare('SELECT expo_push_token FROM push_devices WHERE property_id=? AND is_active=1 ORDER BY updated_at DESC');$devices->execute([uuid_bin($propertyId)]);$recipients=$devices->fetchAll();
    if(!$recipients)return['sent'=>0,'missingRepairs'=>count($items),'deduplicated'=>false];
    $today=gmdate('Y-m-d');$sent=0;$pending=0;
    foreach($items as$item){
        $fingerprint=hash('sha256',json_encode([$item['serviceSheetId'],$item['missing']],JSON_UNESCAPED_UNICODE));
        if(!$force){$seen=$pdo->prepare('SELECT 1 FROM push_notification_runs WHERE property_id=? AND fingerprint=? AND sent_on=? LIMIT 1');$seen->execute([uuid_bin($propertyId),$fingerprint,$today]);if($seen->fetchColumn())continue;}
        $pending++;
        $client=trim((string)($item['clientName']??''));
        $body=($client!==''?$client.': ':'').'lipsesc '.implode(', ',$item['missing']).'.';
        $itemSent=gshop_send_expo_push($recipients,['title'=>'Documente lipsă · '.$item['serviceSheetNumber'],'body'=>$body,'data'=>['kind'=>'missing-documents','route'=>'/service/service-sheets/'.$item['serviceSheetId'],'propertyId'=>$propertyId,'serviceSheetId'=>$item['serviceSheetId'],'missing'=>$item['missing']]]);
        $sent+=$itemSent;
        if($itemSent>0)$pdo->prepare('INSERT IGNORE INTO push_notification_runs (id,property_id,fingerprint,sent_on,recipients_count,created_at) VALUES (?,?,?,?,?,?)')->execute([uuid_bin(uuid_v4()),uuid_bin($propertyId),$fingerprint,$today,$itemSent,now_utc()]);
    }
    return['sent'=>$sent,'missingRepairs'=>count($items),'deduplicated'=>$pending===0];
}

function gshop_notify_missing_documents_safely(string $propertyId): void {
    try{gshop_notify_missing_documents($propertyId);}catch(Throwable$error){error_log('Missing-document push failed: '.$error->getMessage());}
}

function gshop_notify_all_properties(): array {
    gshop_ensure_push_tables(db());$stmt=db()->query('SELECT DISTINCT '.uuid_sql('property_id').' property_id FROM push_devices WHERE is_active=1');$result=[];
    foreach($stmt->fetchAll()as$row){$propertyId=(string)$row['property_id'];try{$result[$propertyId]=gshop_notify_missing_documents($propertyId);}catch(Throwable$error){$result[$propertyId]=['error'=>$error->getMessage()];}}
    return$result;
}
