param([Parameter(Mandatory=$true)][string]$LatestApk,[switch]$Apply)
$ErrorActionPreference='Stop'
$workspace=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$keep=(Resolve-Path -LiteralPath $LatestApk).Path
if (-not $keep.StartsWith($workspace+'\',[System.StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetExtension($keep) -ne '.apk') { throw 'Latest APK must be inside this workspace.' }
$obsoleteNames=@('export-android-1.1.3','export-android-1.1.4','export-android-final','export-android-final2','export-android-intake-timeline','export-web-final','export-web-final2','export-web-gshop-trotinete','export-web-intake-timeline','export-web-scan-actions','sales-delete-android-export','sdk57','sdk57-android','sdk57-android-final','sdk57-android-no-notifications','sdk57-web','sdk57-web-debug')
$tempRoot=[System.IO.Path]::GetFullPath((Join-Path $workspace 'tmp'))
$bytes=0L
$removed=0
foreach($name in $obsoleteNames) {
  $candidate=Join-Path $tempRoot $name
  if (-not (Test-Path -LiteralPath $candidate)) { continue }
  $resolved=(Resolve-Path -LiteralPath $candidate).Path
  if ([System.IO.Path]::GetDirectoryName($resolved) -ne $tempRoot -or (Get-Item -LiteralPath $resolved).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe obsolete build path.' }
  $files=Get-ChildItem -LiteralPath $resolved -File -Recurse
  $bytes+=($files | Measure-Object -Property Length -Sum).Sum
  if ($Apply) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  $removed++
}
[PSCustomObject]@{Mode=$(if($Apply){'apply'}else{'dry-run'});Folders=$removed;Bytes=$bytes;Kept=$keep} | ConvertTo-Json
