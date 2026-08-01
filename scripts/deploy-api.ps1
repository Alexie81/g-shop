param(
  [Parameter(Mandatory = $true)][string]$FtpHost,
  [Parameter(Mandatory = $true)][string]$FtpUser,
  [Parameter(Mandatory = $true)][string]$FtpPassword,
  [string]$RemotePath = 'public_html/app-api'
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $workspace 'api'
if (-not (Test-Path -LiteralPath $apiRoot)) { throw 'Dosarul api nu există.' }

$files = Get-ChildItem -LiteralPath $apiRoot -File -Recurse | Where-Object { $_.Name -ne '.env' -and $_.Name -ne '.installed' }
foreach ($file in $files) {
  $relative = $file.FullName.Substring($apiRoot.Length).TrimStart('\').Replace('\', '/')
  $target = "ftp://$FtpHost/$RemotePath/$relative"
  & curl.exe --silent --show-error --fail --ssl-reqd --ftp-create-dirs --user "${FtpUser}:${FtpPassword}" --upload-file $file.FullName $target
  if ($LASTEXITCODE -ne 0) { throw "Publicarea a eșuat pentru $relative" }
  Write-Host "Publicat: $relative"
}
