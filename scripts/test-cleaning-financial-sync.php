<?php
declare(strict_types=1);
define('GSHOP_API_LIBRARY_ONLY',true);
require __DIR__.'/../api/index.php';

function check(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function finance(float $work,float $travel,float $discount,float $advance,string $status='UNPAID'): array {
    $subtotal=round($work+$travel,2);$reduction=round($subtotal*$discount/100,2);$total=round($subtotal-$reduction,2);
    $received=$status==='PAID'?$total:min($advance,$total);
    return ['financials'=>['workPrice'=>$work,'diagnosticFee'=>$travel,'discountPercent'=>$discount,'advancePaid'=>$advance,'paymentStatus'=>$status,'currencyCode'=>'RON'],
        'summary'=>['subtotal'=>$subtotal,'discountAmount'=>$reduction,'totalDue'=>$total,'receivedAmount'=>$received,'remainingDue'=>round($total-$received,2)]];
}
$original=['items'=>[
    ['article'=>'Canapea','service'=>'Curățare','quantity'=>3,'unitPrice'=>100,'totalPrice'=>300],
    ['article'=>'Fotoliu','service'=>'Curățare brațe','quantity'=>2,'unitPrice'=>55,'totalPrice'=>110],
], 'serviceAddress'=>'Adresa originală','notes'=>'Observații originale','paymentMethod'=>'Card','costs'=>[]];
foreach([0.0,0.01,100.0,410.0,610.0,9999.99]as$target){
    $next=cleaning_details_from_financials($original,finance($target,40,20,25));
    check(abs(array_sum(array_column($next['items'],'totalPrice'))-$target)<.001,'Allocated total differs from Finances');
    foreach($next['items']as$i=>$item){
        check($item['article']===$original['items'][$i]['article']&&$item['service']===$original['items'][$i]['service']&&$item['quantity']===$original['items'][$i]['quantity'],'Item details changed');
        check(abs(round($item['quantity']*$item['unitPrice'],2)-$item['totalPrice'])<.001,'Quantity/unit/line mismatch');
    }
    check($next['notes']===$original['notes']&&$next['serviceAddress']===$original['serviceAddress'],'Non-financial details changed');
    check(cleaning_details_from_financials($next,finance($target,40,20,25))===$next,'Repeated synchronization changed the result');
}
$paid=cleaning_details_from_financials($original,finance(610,40,20,125,'PAID'));
check($paid['costs']['receivedAmount']===520.0&&$paid['costs']['remainingDue']===0.0,'Paid must have zero balance');
$unpaid=cleaning_details_from_financials($paid,finance(610,40,20,125));
check($unpaid['costs']['receivedAmount']===125.0&&$unpaid['costs']['remainingDue']===395.0,'Unpaid must restore balance after original advance');
$zero=$original;foreach($zero['items']as&$item){$item['unitPrice']=0;$item['totalPrice']=0;}unset($item);
$allocated=cleaning_details_from_financials($zero,finance(100,0,0,0));
check(array_sum(array_column($allocated['items'],'totalPrice'))===100.0,'Zero-priced items allocation duplicated the target');
echo "OK: canonical totals, partial/paid/unpaid, zero prices, rounding, preserved descriptions, idempotence\n";
