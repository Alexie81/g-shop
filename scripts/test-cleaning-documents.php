<?php
declare(strict_types=1);
define('GSHOP_API_LIBRARY_ONLY',true);
require __DIR__.'/../api/index.php';
require_once __DIR__.'/../api/src/service_document_pdf.php';

$client=['firstName'=>'Maria','lastName'=>'Popescu (EXEMPLU)','phone'=>'0700000000','email'=>'client@example.com'];
$sheet=['id'=>'44444444-4444-4444-8444-444444444450','number'=>'CC-2026-00001','equipment'=>'Canapea și fotolii','reportedIssue'=>'Curățare tapițerie','receivedAt'=>'2026-11-03T08:00:00+00:00','technicianName'=>'Echipa 1'];
$input=['items'=>[
    ['article'=>'Canapea 3 locuri / 220 cm','service'=>'Curățare tapițerie, șezut, spătar și brațe','quantity'=>1,'unitPrice'=>250],
    ['article'=>'Fotoliu / 80 × 85 cm','service'=>'Curățare integrală a suprafețelor textile','quantity'=>2,'unitPrice'=>80],
], 'serviceAddress'=>'București, Str. Exemplului nr. 10, bloc A, etaj 2, ap. 8',
    'interventionAt'=>'2026-11-03T08:00:00+00:00','technicianName'=>'Echipa 1',
    'notes'=>'Tapițerie verificată împreună cu clientul. Aerisire după curățare; utilizare după uscarea completă.',
    'paymentMethod'=>'Card','costs'=>['currencyCode'=>'RON','diagnosticFee'=>30,'discountPercent'=>10,'advancePaid'=>100]];
$details=validated_cleaning_details($input,$sheet,$client,[]);
foreach(['laborCost'=>410,'subtotal'=>440,'discountAmount'=>44,'totalDue'=>396,'receivedAmount'=>100,'remainingDue'=>296]as$key=>$expected){if(abs($details['costs'][$key]-$expected)>.001)throw new RuntimeException('Wrong calculated value: '.$key);}
$out=__DIR__.'/../output/pdf';if(!is_dir($out))mkdir($out,0755,true);
$snapshot=['company'=>['propertyName'=>'Curatatorie Canapele','propertyDomain'=>CLEANING_DOMAIN],'client'=>$client,'sheet'=>$sheet,'cleaning'=>$details,'intake'=>['number'=>'IN-CC-2026-00001','date'=>'2026-11-03T08:00:00+00:00']];
$entries=[];
foreach(['INTAKE','EXIT']as$type){
    if($type==='EXIT'){$snapshot['cleaning']['costs']['advancePaid']=396;$snapshot['cleaning']['costs']['receivedAmount']=396;$snapshot['cleaning']['costs']['remainingDue']=0;$snapshot['cleaning']['interventionAt']='2026-11-03T10:30:00+00:00';}
    $result=generate_service_document_pdf($type,['id'=>'cleaning-example-'.strtolower($type),'number'=>($type==='INTAKE'?'IN':'OUT').'-CC-2026-00001','documentAt'=>'2026-11-03T08:00:00+00:00','agreementAt'=>$type==='EXIT'?'2026-11-03T10:30:00+00:00':'2026-11-03T08:00:00+00:00'],$snapshot,null,null);
    $target=$out.'/Exemplu-curatatorie-'.strtolower($type).'.pdf';copy($result['path'],$target);echo $target.PHP_EOL;
    $entries[]=['type'=>$type,'snapshot'=>$snapshot,'document'=>['number'=>($type==='INTAKE'?'IN':'OUT').'-CC-2026-00001','documentAt'=>'2026-11-03T08:00:00+00:00','agreementAt'=>'2026-11-03T10:30:00+00:00']];
}
file_put_contents($out.'/Exemplu-curatatorie-dosar.pdf',cleaning_package_pdf($entries));
file_put_contents($out.'/Carte-de-vizita-Curatatorie-Canapele.pdf',cleaning_package_pdf());
$snapshot['cleaning']['items']=array_fill(0,22,$details['items'][0]);
$snapshot['cleaning']['items'][0]['service']=str_repeat('Curățare țesătură și verificare suprafețe. ',12);
$snapshot['cleaning']['notes']=str_repeat('Recomandare de uscare și întreținere. ',35);
$result=generate_service_document_pdf('EXIT',['id'=>'cleaning-pagination-test','number'=>'TEST-PAGINARE','documentAt'=>'2026-11-03T08:00:00+00:00'],$snapshot,null,null);
$tmp=__DIR__.'/../tmp/pdfs';if(!is_dir($tmp))mkdir($tmp,0755,true);copy($result['path'],$tmp.'/cleaning-pagination-test.pdf');
echo 'OK: server totals and multipage rendering'.PHP_EOL;
