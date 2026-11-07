<?php
declare(strict_types=1);

const CLEANING_DOMAIN = 'curatatorie-canapele.ro';

function is_cleaning_property(string $propertyId): bool {
    static $domains = [];
    if (!array_key_exists($propertyId, $domains)) $domains[$propertyId] = strtolower((string)property_record($propertyId)['domain']);
    return $domains[$propertyId] === CLEANING_DOMAIN;
}

/** Idempotent provisioning; existing company settings and user choices are retained. */
function ensure_cleaning_property(array $actor): array {
    $pdo = db();
    ensure_property_companies_table($pdo);
    migrate_whatsapp_messages($pdo);
    $now = now_utc();
    $lookup = $pdo->prepare('SELECT '.uuid_sql('id').' id FROM properties WHERE domain=? LIMIT 1');
    $lookup->execute([CLEANING_DOMAIN]);
    $propertyId = (string)($lookup->fetchColumn() ?: '44444444-4444-4444-8444-444444444444');
    $modules = json_encode(['dashboard','clients','qr','serviceSheets','collaborators','technicians','whatsapp','users','reports','register','audit']);
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO properties (id,name,domain,type,enabled_modules,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,\'SERVICE\',?,1,?,?,?,?) ON DUPLICATE KEY UPDATE enabled_modules=VALUES(enabled_modules)')
            ->execute([uuid_bin($propertyId),'Curatatorie Canapele',CLEANING_DOMAIN,$modules,$now,$now,uuid_bin($actor['id']),uuid_bin($actor['id'])]);
        $pdo->prepare("INSERT IGNORE INTO user_properties (user_id,property_id) SELECT id,? FROM users WHERE is_active=1 AND (role='ADMIN' OR id=?)")
            ->execute([uuid_bin($propertyId),uuid_bin($actor['id'])]);
        $lookup = $pdo->prepare('SELECT '.uuid_sql('id').' id FROM property_companies WHERE property_id=? AND is_active=1 ORDER BY is_default DESC,created_at LIMIT 1');
        $lookup->execute([uuid_bin($propertyId)]);
        $companyId = $lookup->fetchColumn();
        if (!$companyId) {
            $companyId = uuid_v4();
            $pdo->prepare('INSERT INTO property_companies (id,property_id,is_default,legal_name,country,website,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,1,?,?,?,1,?,?,?,?)')
                ->execute([uuid_bin($companyId),uuid_bin($propertyId),'Curatatorie Canapele','România',CLEANING_DOMAIN,$now,$now,uuid_bin($actor['id']),uuid_bin($actor['id'])]);
        }
        $pdo->prepare('INSERT IGNORE INTO property_company_selections (property_id,company_id,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?)')
            ->execute([uuid_bin($propertyId),uuid_bin((string)$companyId),$now,$now,uuid_bin($actor['id']),uuid_bin($actor['id'])]);
        $lookup = $pdo->prepare('SELECT COUNT(*) FROM whatsapp_messages WHERE property_id=?');
        $lookup->execute([uuid_bin($propertyId)]);
        if (!(int)$lookup->fetchColumn()) {
            $insert = $pdo->prepare('INSERT INTO whatsapp_messages (id,property_id,user_id,title,message,sort_order,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,1,?,?,?,?)');
            foreach ([
                ['Confirmare comandă','Bună ziua, {prenume}! Vă contactăm din partea {proprietate} pentru confirmarea comenzii de curățare.'],
                ['Lucrare finalizată','Bună ziua, {prenume}! Lucrarea de curățare a fost finalizată. Vă mulțumim, {proprietate}!'],
                ['Status și documente','Bună ziua, {prenume}! Puteți urmări comanda și consulta documentele aici: {link_status}'],
            ] as $i => $message) $insert->execute([uuid_bin(uuid_v4()),uuid_bin($propertyId),uuid_bin($actor['id']),$message[0],$message[1],$i+1,$now,$now,uuid_bin($actor['id']),uuid_bin($actor['id'])]);
        }
        $pdo->commit();
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    sync_shared_service_people($pdo, true);
    return property_record($propertyId);
}

function validated_cleaning_details(mixed $input, array $sheet, array $client, array $bundle): array {
    if (!is_array($input)) fail('Datele comenzii de curățare nu sunt valide.',422);
    $positions = $input['items'] ?? [];
    if (!is_array($positions) || count($positions) < 1 || count($positions) > 60) fail('Completează între 1 și 60 de articole.',422);
    $items = [];
    $services = 0.0;
    foreach ($positions as $position) {
        if (!is_array($position)) fail('Articol invalid.',422);
        $article = company_detail_text($position['article'] ?? '', 'Articolul / dimensiunile',180,true);
        $service = company_detail_text($position['service'] ?? '', 'Serviciul și suprafețele',600,true);
        $quantity = service_document_item_number($position['quantity'] ?? 1,'Cantitatea',100000,true);
        service_document_item_number($position['unitPrice'] ?? 0,'Prețul unitar',999999999.99);
        // Automatic allocation of a changed service total can require fractions of a cent.
        $unit = round((float)str_replace(',','.',(string)($position['unitPrice'] ?? 0)),8);
        $total = round($quantity * $unit,2);
        if ($total > 999999999.99) fail('Totalul articolului depășește limita permisă.',422);
        $services += $total;
        $items[] = ['article'=>$article,'service'=>$service,'quantity'=>$quantity,'unitPrice'=>$unit,'totalPrice'=>$total];
    }
    $rawCosts = $input['costs'] ?? [];
    if (!is_array($rawCosts)) fail('Valorile comenzii nu sunt valide.',422);
    // Totals are always computed on the server, never trusted from a PDF/editor.
    $rawCosts['partsCost'] = 0;
    $rawCosts['laborCost'] = round($services,2);
    $costs = validated_service_document_estimated_costs($rawCosts,service_document_estimated_costs_from_snapshot($bundle));
    return [
        'items'=>$items,
        'serviceAddress'=>company_detail_text($input['serviceAddress'] ?? '', 'Adresa prestării',500,true),
        'interventionAt'=>iso_date(service_document_db_date($input['interventionAt'] ?? '',now_utc())),
        'technicianName'=>company_detail_text($input['technicianName'] ?? $sheet['technicianName'] ?? '', 'Tehnicianul / echipa',160) ?? '',
        'notes'=>company_detail_text($input['notes'] ?? '', 'Observațiile',2000) ?? '',
        'paymentMethod'=>company_detail_text($input['paymentMethod'] ?? '', 'Modalitatea de plată',80) ?? '',
        'costs'=>$costs,
    ];
}

function cleaning_default_details(array $sheet, array $client, array $bundle): array {
    $costs=service_document_estimated_costs_from_snapshot($bundle);
    $costs['laborCost']=(float)($bundle['financials']['workPrice']??$costs['laborCost']);$costs['partsCost']=0;
    $costs['laborCost']=round($costs['partsCost']+$costs['laborCost'],2);$costs['partsCost']=0;
    return [
        'items'=>[['article'=>$sheet['equipment'] ?: 'Articol de curățat','service'=>$sheet['workPerformed'] ?: $sheet['reportedIssue'],'quantity'=>1,'unitPrice'=>$costs['laborCost'],'totalPrice'=>$costs['laborCost']]],
        'serviceAddress'=>implode(', ',array_filter([$client['address']??'',$client['city']??'',$client['county']??''])),
        'interventionAt'=>$sheet['receivedAt'],'technicianName'=>$sheet['technicianName']??'',
        'notes'=>$sheet['handoverNotes']??'','paymentMethod'=>'','costs'=>$costs,
    ];
}

/** Keep descriptions and quantities while aligning every displayed amount with Finances. */
function cleaning_details_from_financials(array $details, array $bundle): array {
    $costs=service_document_estimated_costs_from_snapshot($bundle);
    $target=round(max(0,(float)$bundle['financials']['workPrice']),2);
    $costs['partsCost']=0.0;$costs['laborCost']=$target;
    $items=$details['items'];
    $amounts=array_map(fn($item)=>round((float)$item['quantity']*(float)$item['unitPrice'],2),$items);
    $base=array_sum($amounts);
    if(abs($base-$target)>.004){
        $cumulative=0.0;$assigned=0.0;$last=count($items)-1;
        foreach($items as$index=>&$item){
            $cumulative+=$amounts[$index];
            $through=$index===$last?$target:round($target*($base>0?$cumulative/$base:1),2);
            // Eight decimals are sufficient even for the maximum quantity of 100,000.
            $item['unitPrice']=round(max(0,$through-$assigned)/(float)$item['quantity'],8);
            $item['totalPrice']=round((float)$item['quantity']*$item['unitPrice'],2);
            $assigned=$through;
        }
        unset($item);
    }
    $details['items']=$items;$details['costs']=$costs;
    return $details;
}

/** Repair stale PDFs on reads too, including links sent before a financial change. */
function refresh_cleaning_document_row(array $row, ?array $user=null): array {
    $snapshot=json_decode((string)($row['snapshot_json']??''),true);
    if(!is_array($snapshot['cleaning']??null)||!is_cleaning_property((string)$row['property_id']))return$row;
    $pdo=db();$ownsTransaction=!$pdo->inTransaction();$rendered=null;$previous=$row;
    if($ownsTransaction)$pdo->beginTransaction();
    try{
        $pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE')->execute([uuid_bin((string)$row['client_id'])]);
        $stmt=$pdo->prepare(service_document_select().' WHERE d.id=? AND d.is_active=1 AND d.status=\'PUBLISHED\' FOR UPDATE');
        $stmt->execute([uuid_bin((string)$row['id'])]);$current=$stmt->fetch();
        if(!$current){if($ownsTransaction)$pdo->rollBack();fail('Documentul nu mai este disponibil.',404);}
        $previous=$current;$snapshot=json_decode((string)$current['snapshot_json'],true);
        if(!is_array($snapshot['cleaning']??null))throw new RuntimeException('Datele documentului de curățare nu sunt valide.');
        $client=get_client((string)$current['client_id']);$bundle=client_financial_bundle($client);
        $next=$snapshot;$next['cleaning']=cleaning_details_from_financials($snapshot['cleaning'],$bundle);
        $next['financials']=$next['cleaning']['costs'];$next['summary']=$next['cleaning']['costs'];
        if($current['type']==='EXIT')$next['intake']=service_document_reference((string)$current['service_sheet_id'],'INTAKE');
        if($next!=$snapshot){
            $signaturePath=service_document_signature_path((string)$current['service_sheet_id']);
            require_once __DIR__.'/service_document_pdf.php';
            $rendered=generate_service_document_pdf((string)$current['type'],['id'=>$current['id'],'number'=>$current['number'],'documentAt'=>iso_date($current['document_at']),'agreementAt'=>iso_date($current['agreement_at'])],$next,$signaturePath,null);
            $now=now_utc();$actor=$user['id']??$current['updated_by']??$current['created_by'];
            $json=json_encode($next,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
            $pdo->prepare('UPDATE service_documents SET snapshot_json=?,signature_path=?,file_path=?,file_sha256=?,generated_at=?,updated_at=?,updated_by=? WHERE id=?')
                ->execute([$json,$signaturePath,$rendered['filePath'],$rendered['sha256'],$now,$now,uuid_bin($actor),uuid_bin((string)$current['id'])]);
            $current=array_merge($current,['snapshot_json'=>$json,'signature_path'=>$signaturePath,'file_path'=>$rendered['filePath'],'file_sha256'=>$rendered['sha256'],'generated_at'=>$now,'updated_at'=>$now,'updated_by'=>$actor]);
        }
        if($ownsTransaction)$pdo->commit();
    }catch(Throwable$error){
        if($ownsTransaction&&$pdo->inTransaction())$pdo->rollBack();
        if($rendered&&empty($rendered['cached']))remove_obsolete_service_document_file($rendered['filePath'],$previous['file_path']??null);
        throw$error;
    }
    if($ownsTransaction&&$rendered)remove_obsolete_service_document_file($previous['file_path']??null,$rendered['filePath']);
    return$current;
}

function refresh_cleaning_documents_from_financials(string $clientId, array $user): int {
    $client=get_client($clientId);if(!is_cleaning_property((string)$client['propertyId']))return 0;
    ensure_service_documents_table(db());
    $stmt=db()->prepare(service_document_select()." JOIN service_sheets s ON s.id=d.service_sheet_id AND s.is_active=1 WHERE d.client_id=? AND d.property_id=? AND d.is_active=1 AND d.status='PUBLISHED' AND d.type IN ('INTAKE','EXIT') ORDER BY FIELD(d.type,'INTAKE','EXIT')");
    $stmt->execute([uuid_bin($clientId),uuid_bin((string)$client['propertyId'])]);$count=0;
    foreach($stmt->fetchAll()as$row){$next=refresh_cleaning_document_row($row,$user);if($next['file_sha256']!==$row['file_sha256'])$count++;}
    if($count)audit_log('CLEANING_DOCUMENTS_REGENERATED_FROM_FINANCIALS','service_documents','Fișele de intrare și ieșire au fost actualizate din finanțele curente','Client',$clientId,$client['propertyId'],null,['documentsRegenerated'=>$count],$user);
    return$count;
}

function generate_cleaning_document_record(array $sheet, string $type, array $body, array $user): array {
    $type=validated_service_document_type($type);
    ensure_property((string)$sheet['propertyId'],$user);
    if (!in_array($type,['INTAKE','EXIT'],true)) fail('Pentru curățare sunt disponibile fișa de intrare și fișa de ieșire.',422);
    ensure_service_documents_table(db());
    $existing=service_document_existing_row((string)$sheet['id'],$type);
    $stored=$existing?json_decode((string)$existing['snapshot_json'],true):null;
    $client=get_client((string)$sheet['clientId']);$bundle=client_financial_bundle($client);
    $details=$body['cleaning']??$stored['cleaning']??null;
    if (!is_array($details) && $type==='EXIT') {
        $intake=service_document_existing_row((string)$sheet['id'],'INTAKE');
        $initial=$intake?json_decode((string)$intake['snapshot_json'],true):null;
        $details=$initial['cleaning']??null;
    }
    $details=validated_cleaning_details($details??cleaning_default_details($sheet,$client,$bundle),$sheet,$client,$bundle);
    $documentAt=service_document_db_date($body['documentAt']??null,$existing['document_at']??now_utc());
    $agreementAt=array_key_exists('agreementAt',$body)?service_document_optional_db_date($body['agreementAt']):($existing['agreement_at']??$documentAt);
    $id=$existing['id']??uuid_v4();$number=$existing['number']??(service_document_definitions()[$type]['prefix'].'-'.$sheet['number']);
    $now=now_utc();$pdo=db();$rendered=null;
    $company=company_for_service_sheet($sheet);$company['propertyDomain']=CLEANING_DOMAIN;
    $pdo->beginTransaction();
    try {
        $lock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$lock->execute([uuid_bin($client['id'])]);
        if (!empty($body['syncCleaningFinancials'])) {
            if (!user_has_permission($user,'financials.view') || !user_has_permission($user,'clients.update')) fail('Nu ai permisiunea de modificare a valorilor financiare.',403);
            $current=client_financial_record($client);
            if ($details['costs']['currencyCode'] !== $current['currencyCode']) fail('Schimbă moneda din secțiunea financiară înainte de generare.',422);
            if (array_key_exists('financialUpdatedAt',$body) && ($body['financialUpdatedAt']??null)!==($current['updatedAt']??null)) fail('Valorile financiare au fost modificate între timp. Redeschide documentul pentru valorile actuale.',409);
            ensure_client_financial_shell($pdo,$client,$user,$now);
            $costs=$details['costs'];
            $status=$costs['totalDue']>0 && $costs['receivedAmount'] >= $costs['totalDue'] ? 'PAID':'UNPAID';
            $pdo->prepare('UPDATE client_financials SET work_price=?,displayed_parts_cost=0,displayed_labor_cost=?,diagnostic_fee=?,advance_paid=?,discount_percent=?,payment_status=?,currency_code=?,updated_at=?,updated_by=? WHERE client_id=?')
                ->execute([$costs['laborCost'],$costs['laborCost'],$costs['diagnosticFee'],$costs['advancePaid'],$costs['discountPercent'],$status,$costs['currencyCode'],$now,uuid_bin($user['id']),uuid_bin($client['id'])]);
            $financial=client_financial_record($client);$expenses=client_expenses((string)$client['id']);
            sync_service_sheet_financials_from_client($pdo,$client,$financial,$expenses,$user);
            sync_client_commission($pdo,$client,$financial,$expenses,$user,false);
            $sheet=get_sheet((string)$sheet['id']);
            audit_log('CLEANING_FINANCIALS_UPDATED','financials','Valorile comenzii de curățare au fost actualizate','Client',$client['id'],$sheet['propertyId'],$current,$financial,$user);
        }
        $details=cleaning_details_from_financials($details,client_financial_bundle($client));
        $snapshot=['company'=>$company,'client'=>$client,'sheet'=>$sheet,'cleaning'=>$details,'intake'=>service_document_reference((string)$sheet['id'],'INTAKE'),
            'financials'=>$details['costs'],'summary'=>$details['costs'],'parts'=>[],'labor'=>[]];
        $signaturePath=service_document_signature_path((string)$sheet['id']);
        require_once __DIR__.'/service_document_pdf.php';
        $rendered=generate_service_document_pdf($type,['id'=>$id,'number'=>$number,'documentAt'=>iso_date($documentAt),'agreementAt'=>iso_date($agreementAt)],$snapshot,$signaturePath,null);
        $columns=['id','service_sheet_id','client_id','property_id','type','number','status','document_at','agreement_at','agreement_status','estimated_repair_days','product_state','final_notes','parts_json','labor_json','snapshot_json','signature_path','file_path','file_sha256','generated_at','is_active','created_at','updated_at','created_by','updated_by'];
        $values=[uuid_bin($id),uuid_bin($sheet['id']),uuid_bin($client['id']),uuid_bin($sheet['propertyId']),$type,$number,'PUBLISHED',$documentAt,$agreementAt,'ACCEPTED',0,$type==='EXIT'?'REPAIRED':'INITIAL',$details['notes'],'[]','[]',json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR),$signaturePath,$rendered['filePath'],$rendered['sha256'],$now,1,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])];
        $updates=[];foreach($columns as$column)if(!in_array($column,['id','created_at','created_by'],true))$updates[]=$column.'=VALUES('.$column.')';
        $pdo->prepare('INSERT INTO service_documents ('.implode(',',$columns).') VALUES ('.implode(',',array_fill(0,count($values),'?')).') ON DUPLICATE KEY UPDATE '.implode(',',$updates))->execute($values);
        $pdo->commit();
    } catch(Throwable $error) {
        if($pdo->inTransaction())$pdo->rollBack();
        if($rendered && empty($rendered['cached']))remove_obsolete_service_document_file($rendered['filePath'],$existing['file_path']??null);
        throw $error;
    }
    remove_obsolete_service_document_file($existing['file_path']??null,$rendered['filePath']);
    // Existing documents follow the same saved finances; missing/deleted ones stay missing.
    refresh_cleaning_documents_from_financials((string)$client['id'],$user);
    return service_document_record((string)$sheet['id'],$type,true);
}
