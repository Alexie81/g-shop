param(
  [Parameter(Mandatory = $true)][string]$FtpHost,
  [Parameter(Mandatory = $true)][string]$FtpUser,
  [Parameter(Mandatory = $true)][string]$FtpPassword,
  [string]$RemotePath = 'public_html/app-api',
  [switch]$SkipCertificateCheck
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $workspace 'api'
if (-not (Test-Path -LiteralPath $apiRoot)) { throw 'Dosarul api nu există.' }

function Send-FtpFile {
  param([System.IO.FileInfo]$File, [string]$Target)

  $common = @('--silent', '--show-error', '--fail', '--ssl-reqd', '--ftp-create-dirs', '--user', "${FtpUser}:${FtpPassword}")
  if ($SkipCertificateCheck) { $common = @('--insecure') + $common }
  $requiresChunking = $File.Length -gt 12000 -and @('.php', '.sql') -contains $File.Extension.ToLowerInvariant()
  if (-not $requiresChunking) {
    & curl.exe @common --upload-file $File.FullName $Target
    if ($LASTEXITCODE -ne 0) { throw "Transferul a eșuat pentru $($File.Name)" }
    return
  }

  # Unele configurații LiteSpeed refuză transferurile PHP/SQL mari cu FTP 451.
  # Fișierele binare (PDF, fonturi, imagini) sunt transferate integral; fragmentarea
  # lor în mii de cereri este inutilă și încetinește sever publicarea.
  # Segmentele sunt reasamblate cu APPE, apoi dimensiunea este verificată de server.
  $bytes = [System.IO.File]::ReadAllBytes($File.FullName)
  $temporary = [System.IO.Path]::GetTempFileName()
  try {
    for ($offset = 0; $offset -lt $bytes.Length; $offset += 4096) {
      $length = [Math]::Min(4096, $bytes.Length - $offset)
      $chunk = New-Object byte[] $length
      [Array]::Copy($bytes, $offset, $chunk, 0, $length)
      [System.IO.File]::WriteAllBytes($temporary, $chunk)
      $arguments = $common
      if ($offset -gt 0) { $arguments += '--append' }
      & curl.exe @arguments --upload-file $temporary $Target
      if ($LASTEXITCODE -ne 0) { throw "Transferul segmentului de la offset $offset a eșuat pentru $($File.Name)" }
    }
  } finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath($temporary)
    if ([System.IO.Path]::GetDirectoryName($resolvedTemp) -eq [System.IO.Path]::GetTempPath().TrimEnd('\') -and (Test-Path -LiteralPath $resolvedTemp)) {
      Remove-Item -LiteralPath $resolvedTemp -Force
    }
  }
}

$uploadsRoot = Join-Path $apiRoot 'uploads'
$documentStorageRoot = Join-Path $apiRoot 'storage\service-documents'
$files = Get-ChildItem -LiteralPath $apiRoot -File -Recurse | Where-Object {
  $_.Name -ne '.env' -and
  $_.Name -ne '.installed' -and
  -not $_.FullName.StartsWith($uploadsRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -and
  -not $_.FullName.StartsWith($documentStorageRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}
foreach ($file in $files) {
  $relative = $file.FullName.Substring($apiRoot.Length).TrimStart('\').Replace('\', '/')
  $target = "ftp://$FtpHost/$RemotePath/$relative"
  Send-FtpFile -File $file -Target $target
  Write-Host "Publicat: $relative"
}
