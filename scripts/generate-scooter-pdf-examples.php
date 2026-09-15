<?php
declare(strict_types=1);

require __DIR__ . '/../api/src/service_document_pdf.php';

$outputDirectory = __DIR__ . '/../output/pdf';
if (!is_dir($outputDirectory) && !mkdir($outputDirectory, 0755, true) && !is_dir($outputDirectory)) {
    throw new RuntimeException('Directorul output/pdf nu poate fi creat.');
}

$now = '2026-09-15T14:30:00+03:00';
$snapshot = [
    'company' => [
        'propertyName' => 'G-Shop Trotinete',
        'legalName' => 'G-Shop Trotinete',
        'taxId' => '',
        'tradeRegisterNumber' => '',
        'vatPayer' => false,
        'address' => '',
        'city' => 'București',
        'county' => 'București',
        'country' => 'România',
        'phone' => '0735046534',
        'email' => 'contact@gshop-trotinete.ro',
        'website' => 'gshop-trotinete.ro',
        'bankName' => '',
        'iban' => '',
        'representativeName' => '',
        'representativeRole' => '',
    ],
    'client' => [
        'firstName' => 'Andrei',
        'lastName' => 'Exemplu',
        'phone' => '0700000000',
        'email' => 'client.exemplu@example.com',
        'address' => 'Str. Exemplu nr. 10',
        'city' => 'București',
        'county' => 'București',
    ],
    'sheet' => [
        'number' => 'GS-TROT-2026-0001',
        'equipment' => 'Trotinetă electrică',
        'brand' => 'Xiaomi',
        'model' => 'Electric Scooter 4 Pro',
        'serialNumber' => 'EXEMPLU-SN-2026-0001',
        'accessories' => 'Încărcător original',
        'reportedIssue' => 'Trotineta nu mai pornește constant și afișează eroare la accelerare.',
        'technicalAssessment' => 'Conectorul controlerului prezintă oxidare, iar senzorul accelerației transmite valori instabile.',
        'workPerformed' => 'Curățare și refacere conexiuni, înlocuire ansamblu accelerație, actualizare firmware și test rutier.',
        'partsUsed' => 'Ansamblu accelerație compatibil și consumabile electrice',
        'technicianName' => 'Tehnician Service',
        'warranty' => '90 zile',
        'warrantyStartAt' => $now,
        'warrantyEndAt' => '2026-12-14T14:30:00+02:00',
        'warrantyRemediation' => 'maximum 10 zile lucrătoare de la constatare',
        'storageAfter' => '10 RON / zi după 5 zile de la notificare',
        'handoverNotes' => 'Trotineta a fost testată în sarcină și predată funcțională.',
        'identityDocument' => 'CI seria EX nr. 000000',
        'approveDiagnostics' => true,
        'approveRepair' => true,
        'repairRefused' => false,
        'productDelivered' => true,
        'receivedAt' => '2026-09-12T10:15:00+03:00',
        'completedAt' => $now,
        'signedAt' => $now,
        'currencyCode' => 'RON',
        'partsCost' => 185,
        'laborCost' => 160,
        'totalCost' => 345,
        'estimatedRepairDays' => 3,
        'estimatedTotal' => 345,
        'defectCause' => 'oxidare și uzură',
        'finalNotes' => 'Toate funcțiile de siguranță au fost verificate după intervenție.',
        'deliveredAt' => $now,
    ],
    'intake' => ['number' => 'IN-GS-TROT-2026-0001', 'date' => '2026-09-12T10:15:00+03:00'],
    'estimate' => ['number' => 'DV-GS-TROT-2026-0001', 'date' => '2026-09-13T12:00:00+03:00', 'total' => 345, 'remaining' => 245],
    'exit' => ['number' => 'OUT-GS-TROT-2026-0001', 'date' => $now, 'productState' => 'REPAIRED'],
    'warranty' => [
        'number' => 'GAR-GS-TROT-2026-0001',
        'date' => $now,
        'period' => '90 zile',
        'startAt' => $now,
        'endAt' => '2026-12-14T14:30:00+02:00',
        'remediation' => 'maximum 10 zile lucrătoare de la constatare',
        'contact' => '0735046534 · contact@gshop-trotinete.ro',
    ],
    'parts' => [
        ['name' => 'Ansamblu accelerație compatibil', 'quantity' => 1, 'unitPrice' => 165, 'totalPrice' => 165],
        ['name' => 'Consumabile și conectori electrici', 'quantity' => 1, 'unitPrice' => 20, 'totalPrice' => 20],
    ],
    'labor' => [
        ['name' => 'Diagnosticare sistem electric', 'quantity' => 1, 'unitPrice' => 60, 'totalPrice' => 60],
        ['name' => 'Montaj, configurare și test rutier', 'quantity' => 1, 'unitPrice' => 100, 'totalPrice' => 100],
    ],
    'financials' => [
        'currencyCode' => 'RON',
        'workPrice' => 345,
        'diagnosticFee' => 0,
        'advancePaid' => 100,
        'discountPercent' => 0,
        'displayedPartsCost' => 185,
        'displayedLaborCost' => 160,
        'paymentStatus' => 'UNPAID',
    ],
    'summary' => [
        'subtotal' => 345,
        'discountAmount' => 0,
        'totalDue' => 345,
        'receivedAmount' => 100,
        'remainingDue' => 245,
    ],
    'agreement' => ['status' => 'ACCEPTED', 'date' => '2026-09-13T12:00:00+03:00'],
];

$documents = [
    'INTAKE' => ['number' => 'IN-GS-TROT-2026-0001', 'name' => 'G-Shop-Trotinete-Fisa-Intrare-Exemplu.pdf', 'documentAt' => '2026-09-12T10:15:00+03:00', 'agreementAt' => '2026-09-12T10:15:00+03:00'],
    'FINAL_ESTIMATE' => ['number' => 'DV-GS-TROT-2026-0001', 'name' => 'G-Shop-Trotinete-Deviz-Final-Exemplu.pdf', 'documentAt' => '2026-09-13T12:00:00+03:00', 'agreementAt' => '2026-09-13T12:00:00+03:00'],
    'EXIT' => ['number' => 'OUT-GS-TROT-2026-0001', 'name' => 'G-Shop-Trotinete-Fisa-Iesire-Exemplu.pdf', 'documentAt' => $now, 'agreementAt' => $now],
    'WARRANTY' => ['number' => 'GAR-GS-TROT-2026-0001', 'name' => 'G-Shop-Trotinete-Certificat-Garantie-Exemplu.pdf', 'documentAt' => $now, 'agreementAt' => $now],
];

foreach ($documents as $type => $definition) {
    $id = 'example-' . strtolower(str_replace('_', '-', $type));
    $rendered = generate_service_document_pdf($type, [
        'id' => $id,
        'number' => $definition['number'],
        'documentAt' => $definition['documentAt'],
        'agreementAt' => $definition['agreementAt'],
    ], $snapshot, null, null);
    $source = __DIR__ . '/../api/' . $rendered['filePath'];
    $target = $outputDirectory . '/' . $definition['name'];
    if (!copy($source, $target)) throw new RuntimeException('Exemplul PDF nu a putut fi copiat: ' . $definition['name']);
    echo $target . PHP_EOL;
}
