$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$appAsarPath = Join-Path $root 'resources\app.asar'
$distPath = Join-Path $root 'dist'
$tmpAppPath = Join-Path $root '.packtmp\app'
$releaseAsarPath = Join-Path $root 'release\win-unpacked\resources\app.asar'
$rootExePath = Join-Path $root 'PostAIS.exe'
$rceditPath = Join-Path $root 'node_modules\rcedit\bin\rcedit-x64.exe'
$portableExeTargets = @(
  (Join-Path $root 'portable\PostAIS\PostAIS.exe'),
  (Join-Path $root 'portable\PostAIs\PostAIs.exe')
)

function Set-ExeMetadata {
  param(
    [Parameter(Mandatory = $true)]
    [string]$exePath
  )

  if (-not (Test-Path $exePath)) {
    return
  }

  if (-not (Test-Path $rceditPath)) {
    return
  }

  & $rceditPath $exePath --set-version-string FileDescription PostAIS --set-version-string ProductName PostAIS --set-version-string OriginalFilename PostAIS.exe --set-version-string InternalName PostAIS
}

if (-not (Test-Path $appAsarPath)) {
  throw "No existe app.asar en $appAsarPath"
}

if (-not (Test-Path (Join-Path $distPath 'index.html'))) {
  throw "No existe dist/index.html. Ejecuta primero npm run build."
}

Get-Process -Name 'PostAIs' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'PostAIS' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Remove-Item $tmpAppPath -Recurse -Force -ErrorAction SilentlyContinue
New-Item $tmpAppPath -ItemType Directory -Force | Out-Null

$npxExe = 'npx'
if (Test-Path 'C:\Program Files\nodejs\npx.cmd') {
  $npxExe = 'C:\Program Files\nodejs\npx.cmd'
}

& $npxExe --yes asar extract $appAsarPath $tmpAppPath
if ($LASTEXITCODE -ne 0) {
  throw 'No se pudo extraer app.asar.'
}

Remove-Item (Join-Path $tmpAppPath 'dist') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $distPath (Join-Path $tmpAppPath 'dist') -Recurse -Force
Copy-Item (Join-Path $root 'electron\main.cjs') (Join-Path $tmpAppPath 'electron\main.cjs') -Force
Copy-Item (Join-Path $root 'electron\preload.cjs') (Join-Path $tmpAppPath 'electron\preload.cjs') -Force
Copy-Item (Join-Path $root 'package.json') (Join-Path $tmpAppPath 'package.json') -Force

& $npxExe --yes asar pack $tmpAppPath $appAsarPath
if ($LASTEXITCODE -ne 0) {
  throw 'No se pudo empaquetar app.asar.'
}

if (Test-Path $releaseAsarPath) {
  Copy-Item $appAsarPath $releaseAsarPath -Force
}

$releaseExePath = $null
$releaseExeCandidates = @(
  (Join-Path $root 'release\win-unpacked\PostAIS.exe'),
  (Join-Path $root 'release\win-unpacked\PostAIs.exe')
)

foreach ($candidate in $releaseExeCandidates) {
  if (Test-Path $candidate) {
    $releaseExePath = $candidate
    break
  }
}

if ($releaseExePath) {
  Set-ExeMetadata -exePath $releaseExePath
  Copy-Item $releaseExePath $rootExePath -Force
  Set-ExeMetadata -exePath $rootExePath
  (Get-Item $rootExePath).LastWriteTime = Get-Date

  foreach ($portableExeTarget in $portableExeTargets) {
    $portableExeDir = Split-Path -Parent $portableExeTarget
    if (Test-Path $portableExeDir) {
      Copy-Item $releaseExePath $portableExeTarget -Force
      Set-ExeMetadata -exePath $portableExeTarget
      (Get-Item $portableExeTarget).LastWriteTime = Get-Date
    }
  }
}

Write-Output 'app.asar sincronizado con los ultimos cambios y PostAIS.exe listo para ejecutar.'
