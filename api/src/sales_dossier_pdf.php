<?php
declare(strict_types=1);

require_once __DIR__ . '/sales_sheet_pdf.php';
require_once __DIR__ . '/sales_document_pdf.php';

/**
 * Resolves a generated Shop file only when it remains inside the expected
 * uploads directory. The returned real path is safe to pass to FPDI.
 */
function gshop_sales_dossier_source_path(?string $relativePath, string $allowedDirectory): ?string {
    $relativePath = trim((string)($relativePath ?? ''));
    if ($relativePath === '') return null;

    $root = realpath(__DIR__ . '/../' . trim($allowedDirectory, '/\\'));
    $candidate = realpath(__DIR__ . '/../' . ltrim($relativePath, '/\\'));
    if ($root === false || $candidate === false || !is_file($candidate)) return null;

    $prefix = rtrim($root, '/\\') . DIRECTORY_SEPARATOR;
    return str_starts_with($candidate, $prefix) ? $candidate : null;
}

/** @return array{path:string,label:string,type:string}[] */
function gshop_sales_dossier_sources(string $sheetId, array $sheetRow): array {
    $sources = [];

    $salesSheetPath = gshop_sales_dossier_source_path(
        $sheetRow['file_path'] ?? null,
        'uploads/sales-sheets'
    );
    if ($salesSheetPath === null) {
        fail(
            'Generează mai întâi PDF-ul fișei de vânzare.',
            409,
            ['code'=>'SALES_DOSSIER_EMPTY','missing'=>[['type'=>'SALES_SHEET','label'=>'Fișa de vânzare']]]
        );
    }
    $sources[] = ['type'=>'SALES_SHEET','label'=>'Fișa de vânzare','path'=>$salesSheetPath];

    // Include the emitted documents as an ordered prefix. The supported
    // combinations are sheet; sheet + estimate; sheet + estimate + warranty.
    $estimateAvailable = false;
    foreach (['FINAL_ESTIMATE', 'WARRANTY'] as $type) {
        if ($type === 'WARRANTY' && !$estimateAvailable) break;
        $definition = sales_document_definitions()[$type];
        $row = sales_document_existing_row($sheetId, $type);
        $path = $row && ($row['status'] ?? '') === 'PUBLISHED' && sales_document_pdf_is_current($row)
            ? sales_document_absolute_path($row['file_path'] ?? null)
            : null;

        if ($path === null) break;
        $sources[] = ['type'=>$type,'label'=>$definition['label'],'path'=>$path];
        if ($type === 'FINAL_ESTIMATE') $estimateAvailable = true;
    }

    return $sources;
}

/**
 * Builds one client-facing PDF in the fixed order:
 * sales sheet, final estimate, warranty certificate.
 *
 * @return array{url:string,fileName:string,generatedAt:string,sha256:string,documentCount:int}
 */
function generate_sales_dossier_pdf(string $sheetId): array {
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $sheetId)) {
        throw new InvalidArgumentException('Identificatorul fișei de vânzare nu este valid.');
    }

    $sheetRow = sales_sheet_row($sheetId);
    $sheet = map_sales_sheet($sheetRow, true);
    $sources = gshop_sales_dossier_sources($sheetId, $sheetRow);

    $baseDirectory = __DIR__ . '/../uploads/sales-dossiers/v2';
    $directory = $baseDirectory . '/' . strtolower($sheetId);
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('Directorul dosarului Shop nu poate fi creat.');
    }

    $fileName = gshop_sales_pdf_file_name($sheet);
    $relativePath = 'uploads/sales-dossiers/v2/' . strtolower($sheetId) . '/' . $fileName;
    $output = __DIR__ . '/../' . $relativePath;
    $temporary = $output . '.tmp-' . bin2hex(random_bytes(6));

    $pdf = new GshopServiceDocumentPdf('P', 'pt', 'A4');
    $pdf->SetAutoPageBreak(false);
    $pdf->SetTitle('Dosar ' . (string)($sheet['number'] ?? ''));
    $pdf->SetAuthor('Calculatoare Profesionale | G-Shop');

    try {
        foreach ($sources as $source) {
            try {
                $pageCount = $pdf->setSourceFile($source['path']);
                if ($pageCount < 1) throw new RuntimeException('PDF fără pagini.');
                for ($page = 1; $page <= $pageCount; $page++) {
                    $templateId = $pdf->importPage($page);
                    $size = $pdf->getTemplateSize($templateId);
                    $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
                    $pdf->useTemplate($templateId, 0, 0, $size['width'], $size['height'], true);
                }
            } catch (Throwable $error) {
                throw new RuntimeException($source['label'].' nu a putut fi inclusă în dosar.', 0, $error);
            }
        }

        $pdf->Output('F', $temporary);
        $header = is_file($temporary) ? file_get_contents($temporary, false, null, 0, 5) : false;
        if ($header !== '%PDF-' || (filesize($temporary) ?: 0) < 100) {
            throw new RuntimeException('Dosarul Shop generat nu este un PDF valid.');
        }
        $sha256 = hash_file('sha256', $temporary);
        if (!is_string($sha256) || $sha256 === '') {
            throw new RuntimeException('Semnătura de integritate a dosarului nu a putut fi calculată.');
        }
        if (!@rename($temporary, $output)) {
            throw new RuntimeException('Dosarul Shop nu a putut fi publicat.');
        }
        @chmod($output, 0644);
    } finally {
        if (is_file($temporary)) @unlink($temporary);
    }

    $generatedAt = gmdate('c');
    return [
        'url'=>public_base_url().'/'.$relativePath.'?v='.rawurlencode($sha256),
        'fileName'=>$fileName,
        'generatedAt'=>$generatedAt,
        'sha256'=>$sha256,
        'documentCount'=>count($sources),
    ];
}
