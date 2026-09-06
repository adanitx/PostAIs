param(
  [string]$TargetExe = "portable/PostAIs/PostAIS.exe",
  [string]$TimestampUrl = "http://timestamp.digicert.com",
  [string]$CertPath = $env:POSTAIS_SIGN_CERT_PATH,
  [string]$CertPassword = $env:POSTAIS_SIGN_CERT_PASSWORD,
  [string]$CertThumbprint = $env:POSTAIS_SIGN_THUMBPRINT,
  [string]$CertStore = "My",
  [ValidateSet("CurrentUser", "LocalMachine")]
  [string]$CertStoreLocation = "CurrentUser"
)

$ErrorActionPreference = "Stop"

function Resolve-SignToolPath {
  $fromPath = Get-Command signtool -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $kitsRoot = "C:\Program Files (x86)\Windows Kits\10\bin"
  if (-not (Test-Path $kitsRoot)) {
    throw "No se encontro Windows SDK en '$kitsRoot'. Instala 'Windows SDK Signing Tools'."
  }

  $candidate = Get-ChildItem -Path $kitsRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if (-not $candidate) {
    $candidate = Get-ChildItem -Path $kitsRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
  }

  if (-not $candidate) {
    throw "No se pudo localizar signtool.exe."
  }

  return $candidate.FullName
}

$targetPath = Resolve-Path $TargetExe -ErrorAction SilentlyContinue
if (-not $targetPath) {
  throw "No existe el ejecutable a firmar: $TargetExe"
}

$signtool = Resolve-SignToolPath
Write-Host "Usando signtool: $signtool"
Write-Host "Firmando: $($targetPath.Path)"

$args = @(
  "sign",
  "/fd", "SHA256",
  "/td", "SHA256",
  "/tr", $TimestampUrl,
  "/v"
)

if ($CertPath) {
  if (-not (Test-Path $CertPath)) {
    throw "No existe el certificado PFX: $CertPath"
  }

  $args += @("/f", (Resolve-Path $CertPath).Path)
  if ($CertPassword) {
    $args += @("/p", $CertPassword)
  }
}
elseif ($CertThumbprint) {
  $args += @("/sha1", $CertThumbprint, "/s", $CertStore, "/sm")

  if ($CertStoreLocation -eq "CurrentUser") {
    # /sm points to LocalMachine store; for CurrentUser do not include /sm.
    $args = $args | Where-Object { $_ -ne "/sm" }
  }
}
else {
  throw "Debes indicar un certificado via POSTAIS_SIGN_CERT_PATH (PFX) o POSTAIS_SIGN_THUMBPRINT."
}

$args += $targetPath.Path

& $signtool @args
if ($LASTEXITCODE -ne 0) {
  throw "signtool finalizo con codigo $LASTEXITCODE"
}

Write-Host "Firma completada correctamente."
