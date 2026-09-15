param(
  [Parameter(Mandatory = $true)][string]$FtpHost,
  [Parameter(Mandatory = $true)][string]$FtpUser,
  [Parameter(Mandatory = $true)][string]$FtpPassword,
  [string]$SourcePath = 'public_html/app-api',
  [string]$TargetPath = 'gshop-trotinete.ro/app-api',
  [switch]$SkipCertificateCheck
)

$ErrorActionPreference = 'Stop'
$credential = "${FtpUser}:${FtpPassword}"
$common = @('--silent', '--show-error', '--fail', '--ssl-reqd', '--ftp-create-dirs', '--user', $credential)
if ($SkipCertificateCheck) { $common = @('--insecure') + $common }

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('gshop-trotinete-api-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
  foreach ($configurationFile in @('.env', '.installed')) {
    $localFile = Join-Path $temporaryRoot $configurationFile
    & curl.exe @common "ftp://$FtpHost/$SourcePath/$configurationFile" --output $localFile
    if ($LASTEXITCODE -ne 0) { throw "Configurația $configurationFile nu a putut fi citită." }
    & curl.exe @common --upload-file $localFile "ftp://$FtpHost/$TargetPath/$configurationFile"
    if ($LASTEXITCODE -ne 0) { throw "Configurația $configurationFile nu a putut fi copiată." }
  }

  $stampSource = "ftp://$FtpHost/$SourcePath/uploads/stamps/"
  $stampNames = & curl.exe @common --list-only $stampSource 2>$null
  if ($LASTEXITCODE -eq 0) {
    foreach ($stampName in @($stampNames)) {
      $safeName = [System.IO.Path]::GetFileName(([string]$stampName).Trim())
      if ([string]::IsNullOrWhiteSpace($safeName) -or $safeName -in @('.', '..') -or $safeName -ne ([string]$stampName).Trim()) { continue }
      $localStamp = Join-Path $temporaryRoot $safeName
      & curl.exe @common ($stampSource + [uri]::EscapeDataString($safeName)) --output $localStamp
      if ($LASTEXITCODE -ne 0) { throw "Ștampila $safeName nu a putut fi citită." }
      & curl.exe @common --upload-file $localStamp "ftp://$FtpHost/$TargetPath/uploads/stamps/$([uri]::EscapeDataString($safeName))"
      if ($LASTEXITCODE -ne 0) { throw "Ștampila $safeName nu a putut fi copiată." }
    }
  }

  $deployArguments = @{
    FtpHost = $FtpHost
    FtpUser = $FtpUser
    FtpPassword = $FtpPassword
    RemotePath = $TargetPath
  }
  if ($SkipCertificateCheck) { $deployArguments.SkipCertificateCheck = $true }
  & (Join-Path $PSScriptRoot 'deploy-api.ps1') @deployArguments
  if ($LASTEXITCODE -ne 0) { throw 'Publicarea API-ului G-Shop Trotinete a eșuat.' }

  Write-Host 'API-ul G-Shop Trotinete este pregătit în domeniul dedicat. Datele de autentificare rămân comune, iar fișierele noi se scriu local pe gshop-trotinete.ro.'
} finally {
  $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
  $systemTemporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
  if ([System.IO.Path]::GetDirectoryName($resolvedTemporaryRoot) -eq $systemTemporaryRoot -and (Test-Path -LiteralPath $resolvedTemporaryRoot)) {
    Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
  }
}
