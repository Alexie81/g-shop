param(
  [Parameter(Mandatory = $true)][string]$FtpHost,
  [Parameter(Mandatory = $true)][string]$FtpUser,
  [Parameter(Mandatory = $true)][string]$FtpPassword,
  [string]$SourcePath = 'public_html/app-api',
  [string]$TargetPath = 'calculatoareprofesionale.ro/app-api',
  [switch]$SkipCertificateCheck
)

$ErrorActionPreference = 'Stop'
$credential = "${FtpUser}:${FtpPassword}"
$common = @('--silent', '--show-error', '--ssl-reqd', '--user', $credential)
if ($SkipCertificateCheck) { $common = @('--insecure') + $common }

function Receive-FtpFile {
  param([string]$RemoteFile, [string]$LocalFile)
  & curl.exe @common --fail "ftp://$FtpHost/$RemoteFile" --output $LocalFile
  if ($LASTEXITCODE -ne 0) { throw "Fișierul $RemoteFile nu a putut fi descărcat." }
}

function Send-FtpFile {
  param([string]$LocalFile, [string]$RemoteFile)
  & curl.exe @common --fail --ftp-create-dirs --upload-file $LocalFile "ftp://$FtpHost/$RemoteFile"
  if ($LASTEXITCODE -ne 0) { throw "Fișierul $RemoteFile nu a putut fi încărcat." }
}

function Get-FtpFileNames {
  param([string]$RemoteDirectory)
  $entries = & curl.exe @common --fail --list-only "ftp://$FtpHost/$RemoteDirectory/" 2>$null
  if ($LASTEXITCODE -ne 0) { return @() }
  return @($entries | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -and $_ -notin @('.', '..') -and $_ -notmatch '[\\/]' })
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('gshop-api-migration-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
  foreach ($configurationFile in @('.env', '.installed')) {
    $localFile = Join-Path $temporaryRoot $configurationFile
    Receive-FtpFile -RemoteFile "$SourcePath/$configurationFile" -LocalFile $localFile
    Send-FtpFile -LocalFile $localFile -RemoteFile "$TargetPath/$configurationFile"
  }
  Write-Host 'Configurația comună a API-ului a fost copiată.'

  foreach ($directory in @('stamps', 'sales-signatures', 'sales-sheets')) {
    $sourceDirectory = "$SourcePath/uploads/$directory"
    $targetDirectory = "$TargetPath/uploads/$directory"
    $files = @(Get-FtpFileNames -RemoteDirectory $sourceDirectory)
    foreach ($file in $files) {
      $localFile = Join-Path $temporaryRoot ([guid]::NewGuid().ToString('N'))
      Receive-FtpFile -RemoteFile "$sourceDirectory/$file" -LocalFile $localFile
      Send-FtpFile -LocalFile $localFile -RemoteFile "$targetDirectory/$file"
      Remove-Item -LiteralPath $localFile -Force
    }
    Write-Host "Migrat $directory`: $($files.Count) fișiere."
  }
} finally {
  $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
  $systemTemporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
  if ([System.IO.Path]::GetDirectoryName($resolvedTemporaryRoot) -eq $systemTemporaryRoot -and (Test-Path -LiteralPath $resolvedTemporaryRoot)) {
    Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
  }
}
