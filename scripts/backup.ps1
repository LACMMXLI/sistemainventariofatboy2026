param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [string]$Destination = ".\backups",
  [int]$RetentionDays = 14
)

$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $resolvedDestination | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$output = Join-Path $resolvedDestination "fatboy-inventory-$timestamp.dump"

& pg_dump --format=custom --file=$output $DatabaseUrl
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump no pudo crear el respaldo"
}

Get-ChildItem -LiteralPath $resolvedDestination -Filter "fatboy-inventory-*.dump" -File |
  Where-Object LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) |
  Remove-Item -Force

Write-Output $output
