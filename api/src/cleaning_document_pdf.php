<?php
declare(strict_types=1);

// A4 portrait, matching the approved orange/gray intake and completion forms.
const CLEANING_INK = [23,32,38];
const CLEANING_TEXT = [65,76,85];
const CLEANING_MUTED = [107,116,123];
const CLEANING_LINE = [209,214,217];
const CLEANING_ORANGE = [250,77,8];
const CLEANING_WIDTH = 531.2756;

function cleaning_font(GshopServiceDocumentPdf $pdf, float $size, bool $bold=false): void {
    $pdf->SetFont('DejaVu',$bold?'B':'',$size/GSHOP_PDF_FONT_SCALE);
}
function cleaning_text(GshopServiceDocumentPdf $pdf,float $x,float $top,string $text,float $size=10,bool $bold=false,array $color=CLEANING_TEXT): void {
    cleaning_font($pdf,$size,$bold);$pdf->SetTextColor(...$color);$pdf->Text($x,$top+$size,$text);
}
function cleaning_line(GshopServiceDocumentPdf $pdf,float $x,float $y,float $end,array $color=CLEANING_LINE,float $weight=.7): void {
    $pdf->SetDrawColor(...$color);$pdf->SetLineWidth($weight);$pdf->Line($x,$y,$end,$y);
}
function cleaning_box(GshopServiceDocumentPdf $pdf,float $x,float $y,float $w,float $h,array $fill=[251,252,252]): void {
    $pdf->SetFillColor(...$fill);$pdf->SetDrawColor(...CLEANING_LINE);$pdf->SetLineWidth(.65);$pdf->RoundedRect($x,$y,$w,$h,5,'DF');
}
function cleaning_wrap(GshopServiceDocumentPdf $pdf,string $text,float $width,float $size=10,bool $bold=false): array {
    cleaning_font($pdf,$size,$bold);$lines=[];$line='';
    foreach(preg_split('/\s+/u',trim($text))?:[] as$word){
        if($word==='')continue;
        if($line!=='' && $pdf->GetStringWidth($line.' '.$word)>$width){$lines[]=$line;$line='';}
        // Long identifiers and addresses must wrap, never disappear outside a cell.
        foreach(preg_split('//u',$word,-1,PREG_SPLIT_NO_EMPTY)?:[] as$char){
            if($line!=='' && $pdf->GetStringWidth($line.$char)>$width){$lines[]=rtrim($line);$line='';}
            $line.=$char;
        }
        $line.=' ';
    }
    if(trim($line)!=='')$lines[]=trim($line);
    return $lines ?: [''];
}
function cleaning_paragraph(GshopServiceDocumentPdf $pdf,float $x,float $y,string $text,float $width,float $size=9.1,bool $bold=false): float {
    $lines=cleaning_wrap($pdf,$text,$width,$size,$bold);$leading=$size+3;
    foreach($lines as$i=>$line)cleaning_text($pdf,$x,$y+$i*$leading,$line,$size,$bold);
    return $y+count($lines)*$leading;
}
function cleaning_section(GshopServiceDocumentPdf $pdf,float $y,string $number,string $title): void {
    $pdf->SetFillColor(255,240,232);$pdf->RoundedRect(32,$y,27,24,6,'F');
    cleaning_text($pdf,38,$y+4.5,$number,10.4,true,CLEANING_ORANGE);
    cleaning_text($pdf,70,$y+3.7,$title,11.3,true,CLEANING_INK);
    cleaning_font($pdf,11.3,true);$end=70+$pdf->GetStringWidth($title)+14;
    cleaning_line($pdf,$end,$y+13,563.2756);
}
function cleaning_date(?string $value,string $format='d.m.Y'): string {
    if(!$value)return '';
    try{return(new DateTimeImmutable($value))->setTimezone(new DateTimeZone('Europe/Bucharest'))->format($format);}catch(Throwable){return '';}
}
function cleaning_header(GshopServiceDocumentPdf $pdf,string $type,array $document): void {
    $pdf->AddPage('P','A4');
    $pdf->Image(__DIR__.'/../assets/cleaning/logo.png',18,24,231,77);
    $title=$type==='INTAKE'?'FIȘĂ DE INTRARE A COMENZII':'FIȘĂ DE IEȘIRE A COMENZII';
    $size=19;cleaning_font($pdf,$size,true);while($pdf->GetStringWidth($title)>282 && $size>15){$size-=.2;cleaning_font($pdf,$size,true);}
    cleaning_text($pdf,281,43,$title,$size,true,CLEANING_INK);
    cleaning_text($pdf,281,87,'NR.',8.2,true,CLEANING_MUTED);
    cleaning_text($pdf,305,82,(string)($document['number']??''),9);
    cleaning_line($pdf,305,99,420,CLEANING_TEXT);
    cleaning_text($pdf,431,87,'DATA',8.2,true,CLEANING_MUTED);
    cleaning_text($pdf,463,82,cleaning_date($document['documentAt']??null),9);
    cleaning_line($pdf,463,99,563.2756,CLEANING_TEXT);
    cleaning_line($pdf,32,115,563.2756);cleaning_line($pdf,32,115,67,CLEANING_ORANGE,2);
    if($type==='EXIT'){
        $reference=$document['intakeReference']??[];
        cleaning_text($pdf,32,124,'Fișa de intrare de referință:',9,true,CLEANING_INK);
        cleaning_text($pdf,204,124,'Nr. '.($reference['number']??'—').'     Data: '.(cleaning_date($reference['date']??null)?:'—'),9);
    }
    cleaning_text($pdf,510,818,'Pagina '.$pdf->PageNo(),7.5,false,CLEANING_MUTED);
}
function cleaning_fields(GshopServiceDocumentPdf $pdf,float $y,array $fields): float {
    $height=41;$prepared=[];
    foreach($fields as[$width,$label,$value]){
        $lines=cleaning_wrap($pdf,(string)$value,$width-18,10);
        $height=max($height,24+count($lines)*12);$prepared[]=[$width,$label,$lines];
    }
    $x=32;
    foreach($prepared as[$width,$label,$lines]){
        cleaning_box($pdf,$x,$y,$width,$height);cleaning_text($pdf,$x+9,$y+6,$label,8.2);
        foreach($lines as$i=>$line)cleaning_text($pdf,$x+9,$y+21+$i*12,$line,10);
        $x+=$width+8;
    }
    return $y+$height+8;
}
function cleaning_table_header(GshopServiceDocumentPdf $pdf,float $y,string $currency): float {
    $widths=[27,123,176,39,73,93.2756];$labels=['Nr.','Articol / dimensiuni',"Serviciu și\nsuprafețe incluse",'Cant.','Preț unitar','Total ('.$currency.')'];
    $x=32;
    foreach($widths as$i=>$width){
        $pdf->SetFillColor(242,244,245);$pdf->SetDrawColor(...CLEANING_LINE);$pdf->Rect($x,$y,$width,33,'DF');
        $lines=explode("\n",$labels[$i]);foreach($lines as$j=>$label){cleaning_font($pdf,8.1,true);$dx=($width-$pdf->GetStringWidth($label))/2;cleaning_text($pdf,$x+$dx,$y+(count($lines)===1?10:5)+$j*10.5,$label,8.1,true,CLEANING_INK);}$x+=$width;
    }
    return $y+33;
}
function gshop_cleaning_render(GshopServiceDocumentPdf $pdf,string $type,array $document,array $snapshot,?array $signature): void {
    $details=$snapshot['cleaning'];$client=$snapshot['client'];$sheet=$snapshot['sheet'];$costs=$details['costs'];
    $currency=($costs['currencyCode']??'RON')==='RON'?'lei':$costs['currencyCode'];
    $money=fn($value)=>number_format((float)$value,2,',','.');
    $document['intakeReference']=$snapshot['intake']??null;$pageTop=$type==='EXIT'?153:130;
    cleaning_header($pdf,$type,$document);cleaning_section($pdf,$pageTop,'01','DATE COMANDĂ ȘI CLIENT');
    $y=cleaning_fields($pdf,$pageTop+34,[[141,'Nr. comandă / intervenție',$sheet['number']??''],[109,'Data intervenției',cleaning_date($details['interventionAt'])],[79,$type==='INTAKE'?'Ora sosirii':'Ora finalizării',cleaning_date($details['interventionAt'],'H:i')],[178.2756,'Tehnician / echipă',$details['technicianName']]]);
    $y=cleaning_fields($pdf,$y,[[225,'Client / persoană de contact',trim(($client['firstName']??'').' '.($client['lastName']??''))],[116,'Telefon',$client['phone']??''],[174.2756,'E-mail (opțional)',$client['email']??'']]);
    $y=cleaning_fields($pdf,$y,[[CLEANING_WIDTH,'Adresa prestării (localitate, stradă, nr., bloc, etaj, ap.)',$details['serviceAddress']]]);
    $y+=9;cleaning_section($pdf,$y,'02',$type==='INTAKE'?'ARTICOLE ȘI SERVICII COMANDATE':'ARTICOLE ȘI SERVICII EFECTUATE');$y+=35;
    $y=cleaning_table_header($pdf,$y,$currency);
    $widths=[27,123,176,39,73,93.2756];
    foreach($details['items'] as$i=>$item){
        $values=[str_pad((string)($i+1),2,'0',STR_PAD_LEFT),$item['article'],$item['service'],rtrim(rtrim(number_format($item['quantity'],2,',',''),'0'),','),$money($item['unitPrice']),$money($item['totalPrice'])];
        $lines=[];$height=30;
        foreach($values as$j=>$value){$lines[$j]=cleaning_wrap($pdf,$value,$widths[$j]-12,9.5);$height=max($height,count($lines[$j])*12+12);}
        if($y+$height>755){cleaning_header($pdf,$type,$document);cleaning_section($pdf,$pageTop,'02','ARTICOLE ȘI SERVICII - CONTINUARE');$y=cleaning_table_header($pdf,$pageTop+35,$currency);}
        // A single very long description may occupy multiple rows/pages; no text is truncated.
        $offset=0;$maxLines=max(array_map('count',$lines));
        while($offset<$maxLines){
            $available=max(1,(int)floor((755-$y-12)/12));$take=min($available,$maxLines-$offset);$rowHeight=max(30,$take*12+12);$x=32;
            foreach($widths as$j=>$width){$pdf->SetFillColor(...($i%2?[251,252,252]:[255,255,255]));$pdf->SetDrawColor(...CLEANING_LINE);$pdf->SetLineWidth(.5);$pdf->Rect($x,$y,$width,$rowHeight,'DF');foreach(array_slice($lines[$j],$offset,$take)as$k=>$line)cleaning_text($pdf,$x+6,$y+6+$k*12,$line,9.5);$x+=$width;}
            $y+=$rowHeight;$offset+=$take;
            if($offset<$maxLines){cleaning_header($pdf,$type,$document);cleaning_section($pdf,$pageTop,'02','ARTICOLE ȘI SERVICII - CONTINUARE');$y=cleaning_table_header($pdf,$pageTop+35,$currency);}
        }
    }
    $notes=(string)($details['notes']??'');
    if($notes!=='' || $type==='EXIT'){
        $noteLines=cleaning_wrap($pdf,$notes,CLEANING_WIDTH-18,9.5);
        $offset=0;
        do{
            if($y+65>790){cleaning_header($pdf,$type,$document);$y=$pageTop;}
            $take=min(count($noteLines)-$offset,max(1,(int)floor((780-$y-30)/12)));$height=max(43,24+$take*12);
            cleaning_box($pdf,32,$y+8,CLEANING_WIDTH,$height);cleaning_text($pdf,41,$y+14,'Observații / recomandări de uscare și întreținere',8.7);
            foreach(array_slice($noteLines,$offset,$take)as$i=>$note)cleaning_text($pdf,41,$y+29+$i*12,$note,9.5);
            $offset+=$take;$y+=$height+8;
        }while($offset<count($noteLines));
    }
    $first='Orice modificare de servicii sau preț apărută în timpul intervenției necesită acceptarea clientului înainte de executare.';
    $second='Clientul confirmă că a verificat articolele și suprafețele incluse, constatările inițiale și prețul de mai sus și solicită începerea lucrării. Eliminarea integrală a petelor nu este garantată, în funcție de material și starea acestuia.';
    $confirmation='Clientul confirmă verificarea serviciilor efectuate și luarea la cunoștință a observațiilor și recomandărilor de mai sus. Eventualele observații ale clientului se consemnează în câmpul de mai sus.';
    $textHeight=$type==='INTAKE'?(count(cleaning_wrap($pdf,$first,CLEANING_WIDTH,9.1,true))+count(cleaning_wrap($pdf,$second,CLEANING_WIDTH,9.1)))*12.1+5:count(cleaning_wrap($pdf,$confirmation,CLEANING_WIDTH,9.1))*12.1;
    $closingHeight=16+34+44+($type==='EXIT'?52:0)+11+$textHeight+18+60;
    if($y+$closingHeight>808){cleaning_header($pdf,$type,$document);$y=$pageTop-16;}
    $y+=16;cleaning_section($pdf,$y,'03',$type==='INTAKE'?'VALOARE ȘI ACORD DE ÎNCEPERE':'VALOARE FINALĂ ȘI CONFIRMARE');$y+=34;
    $small=(CLEANING_WIDTH-165-24)/3;
    foreach([['Servicii',$costs['laborCost']],['Deplasare',$costs['diagnosticFee']],['Reducere',$costs['discountAmount']],[$type==='INTAKE'?'TOTAL ACCEPTAT':'TOTAL FINAL',$costs['totalDue']]]as$i=>[$label,$amount]){
        $x=$i===3?398.2756:32+$i*($small+8);$width=$i===3?165:$small;
        cleaning_box($pdf,$x,$y,$width,44,$i===3?[255,240,232]:[242,244,245]);cleaning_text($pdf,$x+10,$y+5,$label,9,$i===3,$i===3?CLEANING_ORANGE:CLEANING_TEXT);
        cleaning_text($pdf,$x+10,$y+23,$money($amount).' '.$currency,10,$i===3,$i===3?CLEANING_ORANGE:CLEANING_TEXT);
    }
    $y+=44;
    if($type==='EXIT')$y=cleaning_fields($pdf,$y+8,[[152,'Achitat ('.$currency.')',$money($costs['receivedAmount'])],[152,'Rest de plată ('.$currency.')',$money($costs['remainingDue'])],[211.2756,'Modalitate de plată',$details['paymentMethod']]]);
    $y+=11;
    if($type==='INTAKE'){$y=cleaning_paragraph($pdf,32,$y,$first,CLEANING_WIDTH,9.1,true);$y=cleaning_paragraph($pdf,32,$y+5,$second,CLEANING_WIDTH);}else $y=cleaning_paragraph($pdf,32,$y,$confirmation,CLEANING_WIDTH);
    $y+=18;cleaning_text($pdf,32,$y,'Client',10,true,CLEANING_INK);cleaning_text($pdf,32,$y+14,$type==='INTAKE'?'Acceptare înainte de intervenție':'Confirmare la finalizarea lucrării',8.5,false,CLEANING_MUTED);
    cleaning_text($pdf,309.6378,$y,$type==='INTAKE'?'Data și ora acceptării':'Data și ora confirmării',10,true,CLEANING_INK);
    if($signature && is_file($signature['path'])){
        $scale=min(235/max(1,$signature['width']),25/max(1,$signature['height']));
        $pdf->Image($signature['path'],38,$y+26,$signature['width']*$scale,$signature['height']*$scale);
    }
    cleaning_text($pdf,315,$y+30,cleaning_date($document['agreementAt']??null,'d.m.Y, H:i'),10);
    cleaning_line($pdf,32,$y+52,285.6378,CLEANING_TEXT);cleaning_line($pdf,309.6378,$y+52,563.2756,CLEANING_TEXT);
    cleaning_text($pdf,239,$y+55,'Semnătură',7.8,false,CLEANING_MUTED);cleaning_text($pdf,520,$y+55,'Data / ora',7.8,false,CLEANING_MUTED);
}
