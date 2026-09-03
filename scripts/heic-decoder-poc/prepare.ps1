[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$artifactRoot = Join-Path $repositoryRoot '.artifacts\heic-decoder-poc'
$downloadRoot = Join-Path $artifactRoot 'downloads'
$sourceRoot = Join-Path $artifactRoot 'sources'
$emsdkRoot = Join-Path $artifactRoot 'emsdk'
$pins = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'upstream-sources.json') | ConvertFrom-Json

foreach ($path in @($artifactRoot, $downloadRoot, $sourceRoot)) {
  New-Item -ItemType Directory -Path $path -Force | Out-Null
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory)] [string] $Command,
    [Parameter(Mandatory)] [string[]] $Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
  }
}

function Get-VerifiedArchive {
  param(
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [string] $Url,
    [Parameter(Mandatory)] [string] $ExpectedSha256
  )

  $archivePath = Join-Path $downloadRoot $Name
  if (-not (Test-Path -LiteralPath $archivePath)) {
    Invoke-Checked 'curl.exe' @(
      '--fail', '--location', '--retry', '3',
      '--proto', '=https', '--tlsv1.2',
      '--output', $archivePath,
      $Url
    )
  }

  $actualSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
    throw "SHA-256 mismatch for $Name. Expected $ExpectedSha256; found $actualSha256"
  }

  Write-Host "verified $Name $actualSha256"
  return $archivePath
}

$libheifArchive = Get-VerifiedArchive `
  -Name "libheif-$($pins.libheif.version).tar.gz" `
  -Url $pins.libheif.archiveUrl `
  -ExpectedSha256 $pins.libheif.archiveSha256
$libde265Archive = Get-VerifiedArchive `
  -Name "libde265-$($pins.libde265.version).tar.gz" `
  -Url $pins.libde265.archiveUrl `
  -ExpectedSha256 $pins.libde265.archiveSha256
$emscriptenSourceArchive = Get-VerifiedArchive `
  -Name "emscripten-$($pins.emscripten.emscriptenSourceCommit).tar.gz" `
  -Url $pins.emscripten.sourceArchiveUrl `
  -ExpectedSha256 $pins.emscripten.sourceArchiveSha256

$libheifSource = Join-Path $sourceRoot "libheif-$($pins.libheif.version)"
$libde265Source = Join-Path $sourceRoot "libde265-$($pins.libde265.version)"
if (-not (Test-Path -LiteralPath $libheifSource)) {
  Invoke-Checked 'tar.exe' @('-xf', $libheifArchive, '-C', $sourceRoot)
}
if (-not (Test-Path -LiteralPath $libde265Source)) {
  Invoke-Checked 'tar.exe' @('-xf', $libde265Archive, '-C', $sourceRoot)
}

if (-not (Test-Path -LiteralPath (Join-Path $libheifSource 'COPYING'))) {
  throw 'Verified libheif archive did not produce the expected source tree.'
}
if (-not (Test-Path -LiteralPath (Join-Path $libde265Source 'COPYING'))) {
  throw 'Verified libde265 archive did not produce the expected source tree.'
}
if (-not (Test-Path -LiteralPath $emscriptenSourceArchive)) {
  throw 'Verified Emscripten source archive is missing.'
}

if (-not (Test-Path -LiteralPath (Join-Path $emsdkRoot '.git'))) {
  Invoke-Checked 'git.exe' @(
    'clone', '--depth', '1', '--branch', $pins.emscripten.emsdkTag,
    $pins.emscripten.repositoryUrl, $emsdkRoot
  )
}

$emsdkHead = (& git.exe -C $emsdkRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $emsdkHead -ne $pins.emscripten.emsdkCommit) {
  throw "Unexpected emsdk commit. Expected $($pins.emscripten.emsdkCommit); found $emsdkHead"
}

$emcc = Join-Path $emsdkRoot 'upstream\emscripten\emcc.bat'
if (-not (Test-Path -LiteralPath $emcc)) {
  Invoke-Checked (Join-Path $emsdkRoot 'emsdk.bat') @('install', $pins.emscripten.version)
}
Invoke-Checked (Join-Path $emsdkRoot 'emsdk.bat') @('activate', $pins.emscripten.version)

$emccVersion = (& $emcc '--version' | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or $emccVersion -notmatch [regex]::Escape($pins.emscripten.version)) {
  throw "Unexpected Emscripten compiler: $emccVersion"
}

Write-Output "emsdk commit $emsdkHead"
Write-Output $emccVersion
Write-Output 'HEIC decoder PoC inputs are prepared in the ignored artifact directory.'
