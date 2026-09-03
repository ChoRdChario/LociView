[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$artifactRoot = Join-Path $repositoryRoot '.artifacts\heic-decoder-poc'
$sourceRoot = Join-Path $artifactRoot 'sources'
$buildRoot = Join-Path $artifactRoot 'build'
$installRoot = Join-Path $artifactRoot 'install'
$siteRoot = Join-Path $artifactRoot 'site'
$emsdkRoot = Join-Path $artifactRoot 'emsdk'
$pinsPath = Join-Path $PSScriptRoot 'upstream-sources.json'
$pins = Get-Content -Raw -LiteralPath $pinsPath | ConvertFrom-Json

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

function Assert-ArchiveDigest {
  param(
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [string] $ExpectedSha256
  )

  $path = Join-Path $artifactRoot "downloads\$Name"
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing verified source archive: $path. Run prepare.ps1 first."
  }
  $actualSha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
    throw "SHA-256 mismatch for $Name. Expected $ExpectedSha256; found $actualSha256"
  }
}

function Reset-ArtifactDirectory {
  param(
    [Parameter(Mandatory)] [string] $Path
  )

  $artifactBoundary = [IO.Path]::GetFullPath($artifactRoot).TrimEnd('\')
  $target = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  $requiredPrefix = "$artifactBoundary\"
  if (-not $target.StartsWith($requiredPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to reset a path outside the HEIC PoC artifact root: $target"
  }
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  New-Item -ItemType Directory -Path $target -Force | Out-Null
}

Assert-ArchiveDigest "libheif-$($pins.libheif.version).tar.gz" $pins.libheif.archiveSha256
Assert-ArchiveDigest "libde265-$($pins.libde265.version).tar.gz" $pins.libde265.archiveSha256
Assert-ArchiveDigest `
  "emscripten-$($pins.emscripten.emscriptenSourceCommit).tar.gz" `
  $pins.emscripten.sourceArchiveSha256

# A verified archive is the source authority for every build. Re-extract both
# trees and clear all CMake/install/output state so an edited or stale ignored
# source tree cannot be compiled while the manifest claims no modifications.
foreach ($path in @($sourceRoot, $buildRoot, $installRoot, $siteRoot)) {
  Reset-ArtifactDirectory $path
}
$libheifArchivePath = Join-Path $artifactRoot "downloads\libheif-$($pins.libheif.version).tar.gz"
$libde265ArchivePath = Join-Path $artifactRoot "downloads\libde265-$($pins.libde265.version).tar.gz"
Invoke-Checked 'tar.exe' @('-xf', $libheifArchivePath, '-C', $sourceRoot)
Invoke-Checked 'tar.exe' @('-xf', $libde265ArchivePath, '-C', $sourceRoot)

$libheifSource = Join-Path $sourceRoot "libheif-$($pins.libheif.version)"
$libde265Source = Join-Path $sourceRoot "libde265-$($pins.libde265.version)"
if (-not (Test-Path -LiteralPath (Join-Path $libheifSource 'CMakeLists.txt')) -or
    -not (Test-Path -LiteralPath (Join-Path $libde265Source 'CMakeLists.txt'))) {
  throw 'Verified source trees are missing. Run prepare.ps1 first.'
}

$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
  throw 'Visual Studio discovery tool is unavailable.'
}
$visualStudioRoot = (& $vswhere -latest -products * -property installationPath).Trim()
$cmake = Join-Path $visualStudioRoot 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
$ninja = Join-Path $visualStudioRoot 'Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe'
if (-not (Test-Path -LiteralPath $cmake) -or -not (Test-Path -LiteralPath $ninja)) {
  throw 'The pinned build recipe requires the Visual Studio CMake and Ninja tools.'
}

$env:PATH = "$(Split-Path -Parent $cmake);$(Split-Path -Parent $ninja);$env:PATH"
$env:EMSDK_QUIET = '1'
$emsdkEnvironment = Join-Path $emsdkRoot 'emsdk_env.ps1'
if (-not (Test-Path -LiteralPath $emsdkEnvironment)) {
  throw 'Exact emsdk installation is missing. Run prepare.ps1 first.'
}
. $emsdkEnvironment

$emcmake = Join-Path $emsdkRoot 'upstream\emscripten\emcmake.bat'
$emxx = Join-Path $emsdkRoot 'upstream\emscripten\em++.bat'
$emcc = Join-Path $emsdkRoot 'upstream\emscripten\emcc.bat'
$emccVersion = (& $emcc '--version' | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or $emccVersion -notmatch [regex]::Escape($pins.emscripten.version)) {
  throw "Unexpected Emscripten compiler: $emccVersion"
}
$emsdkHead = (& git.exe -C $emsdkRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $emsdkHead -ne $pins.emscripten.emsdkCommit) {
  throw "Unexpected emsdk commit: $emsdkHead"
}

$libde265Build = Join-Path $buildRoot 'libde265'
$libde265Install = Join-Path $installRoot 'libde265'
New-Item -ItemType Directory -Path $libde265Build -Force | Out-Null
New-Item -ItemType Directory -Path $libde265Install -Force | Out-Null
$libde265Configure = @(
  $cmake,
  '-S', $libde265Source,
  '-B', $libde265Build,
  '-G', 'Ninja',
  "-DCMAKE_MAKE_PROGRAM=$ninja",
  '-DCMAKE_BUILD_TYPE=Release',
  "-DCMAKE_INSTALL_PREFIX=$libde265Install",
  '-DBUILD_SHARED_LIBS=OFF',
  '-DBUILD_FRAMEWORK=OFF',
  '-DENABLE_DECODER=OFF',
  '-DENABLE_ENCODER=OFF',
  '-DENABLE_SHERLOCK265=OFF',
  '-DENABLE_INTERNAL_DEVELOPMENT_TOOLS=OFF',
  '-DWITH_FUZZERS=OFF',
  '-DENABLE_SDL=OFF',
  '-DENABLE_SIMD=OFF',
  '-DENABLE_AVX2=OFF',
  '-DENABLE_AVX512=OFF',
  '-DDE265_LOG_LEVEL=none',
  '-DFORCE_FULL_VISIBILITY=OFF',
  '-DUSE_IWYU=OFF'
)
Invoke-Checked $emcmake $libde265Configure
Invoke-Checked $cmake @('--build', $libde265Build, '--target', 'install', '--parallel')

$libde265Archive = Join-Path $libde265Install 'lib\libde265.a'
if (-not (Test-Path -LiteralPath $libde265Archive)) {
  throw "libde265 static archive was not produced at $libde265Archive"
}

$libheifBuild = Join-Path $buildRoot 'libheif'
$libheifInstall = Join-Path $installRoot 'libheif'
New-Item -ItemType Directory -Path $libheifBuild -Force | Out-Null
New-Item -ItemType Directory -Path $libheifInstall -Force | Out-Null
$libheifConfigure = @(
  $cmake,
  '-S', $libheifSource,
  '-B', $libheifBuild,
  '-G', 'Ninja',
  "-DCMAKE_MAKE_PROGRAM=$ninja",
  '-DCMAKE_BUILD_TYPE=Release',
  "-DCMAKE_INSTALL_PREFIX=$libheifInstall",
  '-DCMAKE_C_FLAGS=-D__EMSCRIPTEN_STANDALONE_WASM__=1',
  '-DCMAKE_CXX_FLAGS=-D__EMSCRIPTEN_STANDALONE_WASM__=1',
  '-DCMAKE_DISABLE_FIND_PACKAGE_PkgConfig=TRUE',
  '-DBUILD_SHARED_LIBS=OFF',
  '-DENABLE_PLUGIN_LOADING=OFF',
  '-DWITH_LIBDE265=ON',
  '-DWITH_LIBDE265_PLUGIN=OFF',
  "-DLIBDE265_INCLUDE_DIR=$libde265Install\include",
  "-DLIBDE265_LIBRARY=$libde265Archive",
  '-DWITH_X265=OFF',
  '-DWITH_KVAZAAR=OFF',
  '-DWITH_UVG266=OFF',
  '-DWITH_VVDEC=OFF',
  '-DWITH_VVENC=OFF',
  '-DWITH_X264=OFF',
  '-DWITH_OpenH264_DECODER=OFF',
  '-DWITH_DAV1D=OFF',
  '-DWITH_AOM_DECODER=OFF',
  '-DWITH_AOM_ENCODER=OFF',
  '-DWITH_SvtEnc=OFF',
  '-DWITH_RAV1E=OFF',
  '-DWITH_JPEG_DECODER=OFF',
  '-DWITH_JPEG_ENCODER=OFF',
  '-DWITH_OpenJPEG_ENCODER=OFF',
  '-DWITH_OpenJPEG_DECODER=OFF',
  '-DWITH_FFMPEG_DECODER=OFF',
  '-DWITH_OPENJPH_ENCODER=OFF',
  '-DWITH_WEBCODECS=OFF',
  '-DWITH_UNCOMPRESSED_CODEC=OFF',
  '-DWITH_HEADER_COMPRESSION=OFF',
  '-DWITH_LIBSHARPYUV=OFF',
  '-DWITH_LIBSHARPYUV_INTERNAL=OFF',
  '-DWITH_EXAMPLES=OFF',
  '-DWITH_EXAMPLE_HEIF_THUMB=OFF',
  '-DWITH_EXAMPLE_HEIF_VIEW=OFF',
  '-DWITH_GDK_PIXBUF=OFF',
  '-DBUILD_DEVELOPMENT_TOOLS=OFF',
  '-DBUILD_DOCUMENTATION=OFF',
  '-DBUILD_TESTING=OFF',
  '-DENABLE_EXPERIMENTAL_FEATURES=OFF',
  '-DENABLE_MULTITHREADING_SUPPORT=OFF',
  '-DENABLE_PARALLEL_TILE_DECODING=OFF',
  '-DWITH_REDUCED_VISIBILITY=ON'
)
Invoke-Checked $emcmake $libheifConfigure
Invoke-Checked $cmake @('--build', $libheifBuild, '--target', 'install', '--parallel')

$libheifArchive = Join-Path $libheifInstall 'lib\libheif.a'
if (-not (Test-Path -LiteralPath $libheifArchive)) {
  throw "libheif static archive was not produced at $libheifArchive"
}

$siteFiles = Join-Path $PSScriptRoot 'web\*'
Copy-Item -Path $siteFiles -Destination $siteRoot -Force
$bridge = Join-Path $PSScriptRoot 'src\heic_decoder_bridge.cpp'
$outputModule = Join-Path $siteRoot 'heic-decoder.mjs'
$linkMap = Join-Path $artifactRoot 'heic-decoder-link.map'
$exports = '["_lv_heic_init","_lv_heic_alloc_input","_lv_heic_decode","_lv_heic_release","_lv_heic_shutdown"]'
$incomingApi = '["locateFile","print","printErr"]'
$linkArguments = @(
  $bridge,
  $libheifArchive,
  $libde265Archive,
  "-I$libheifInstall\include",
  "-I$libde265Install\include",
  '-std=c++17',
  '-O3',
  '-DNDEBUG',
  '--no-entry',
  '-sSTRICT=1',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sEXPORT_NAME=createLociViewHeicDecoder',
  '-sENVIRONMENT=worker',
  '-sDYNAMIC_EXECUTION=0',
  '-sFILESYSTEM=0',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sINITIAL_MEMORY=67108864',
  '-sMAXIMUM_MEMORY=536870912',
  '-sSTACK_SIZE=5242880',
  "-sEXPORTED_FUNCTIONS=$exports",
  '-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]',
  "-sINCOMING_MODULE_JS_API=$incomingApi",
  '-sEMIT_EMSCRIPTEN_LICENSE=1',
  '-sASSERTIONS=1',
  '-sERROR_ON_UNDEFINED_SYMBOLS=1',
  "-Wl,-Map=$linkMap",
  '-o', $outputModule
)
Invoke-Checked $emxx $linkArguments

$outputWasm = Join-Path $siteRoot 'heic-decoder.wasm'
if (-not (Test-Path -LiteralPath $outputModule) -or -not (Test-Path -LiteralPath $outputWasm)) {
  throw 'Emscripten did not emit separate JavaScript and Wasm assets.'
}
if (Select-String -LiteralPath $outputModule -Pattern '\beval\s*\(|new\s+Function\s*\(' -Quiet) {
  throw 'Generated module contains a dynamic-execution primitive.'
}

$node = Join-Path $emsdkRoot 'node\18.20.3_64bit\bin\node.exe'
foreach ($script in @('heic-decoder.worker.mjs', 'heic-decoder-client.mjs', 'main.mjs')) {
  Invoke-Checked $node @('--check', (Join-Path $siteRoot $script))
}

$jsFile = Get-Item -LiteralPath $outputModule
$wasmFile = Get-Item -LiteralPath $outputWasm
$manifest = [ordered]@{
  status = 'poc-only-not-approved-for-public-distribution'
  createdUtc = [DateTime]::UtcNow.ToString('o')
  libheif = $pins.libheif
  libde265 = $pins.libde265
  emscripten = [ordered]@{
    version = $pins.emscripten.version
    emsdkCommit = $emsdkHead
    emscriptenSourceCommit = $pins.emscripten.emscriptenSourceCommit
    sourceArchiveUrl = $pins.emscripten.sourceArchiveUrl
    sourceArchiveSha256 = $pins.emscripten.sourceArchiveSha256
    releaseCompilerRevision = $pins.emscripten.releaseCompilerRevision
    license = $pins.emscripten.license
    observedVersion = $emccVersion
  }
  buildTools = [ordered]@{
    cmake = (& $cmake '--version' | Select-Object -First 1)
    ninja = (& $ninja '--version' | Select-Object -First 1)
  }
  sourceModifications = @()
  budgets = [ordered]@{
    maxInputBytes = 32 * 1024 * 1024
    maxDimension = 16384
    maxPixels = 50000000
    maxOutputBytes = 200 * 1024 * 1024
    maxTotalMemory = 384 * 1024 * 1024
    maxItems = 1024
    maxTiles = 256
    maximumWasmMemory = 512 * 1024 * 1024
    timeoutMilliseconds = 20000
  }
  output = [ordered]@{
    javascript = [ordered]@{
      bytes = $jsFile.Length
      sha256 = (Get-FileHash -LiteralPath $outputModule -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    wasm = [ordered]@{
      bytes = $wasmFile.Length
      sha256 = (Get-FileHash -LiteralPath $outputWasm -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
}
$manifestPath = Join-Path $artifactRoot 'build-manifest.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM

Write-Output "HEIC decoder PoC build complete: $manifestPath"
Write-Output "JS bytes=$($jsFile.Length) SHA-256=$($manifest.output.javascript.sha256)"
Write-Output "WASM bytes=$($wasmFile.Length) SHA-256=$($manifest.output.wasm.sha256)"
