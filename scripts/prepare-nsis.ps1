param(
    [string]$ToolsDirectory = (Join-Path $env:LOCALAPPDATA 'tauri')
)

$ErrorActionPreference = 'Stop'
$nsisDirectory = Join-Path $ToolsDirectory 'NSIS'
$pluginPath = Join-Path $nsisDirectory 'Plugins/x86-unicode/additional/nsis_tauri_utils.dll'
$pluginHash = '75197FEE3C6A814FE035788D1C34EAD39349B860'

# Match the tools and hashes used by the locked Tauri CLI 2.11.1.
# https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.1/crates/tauri-bundler/src/bundle/windows/nsis/mod.rs
function Get-VerifiedTool([string]$Url, [string]$Path, [string]$Sha1) {
    $downloadUrl = $Url + '?download=1&request=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    & curl.exe --fail --location --retry 4 --retry-all-errors --retry-delay 5 --connect-timeout 20 --max-time 90 --output $Path $downloadUrl
    if ($LASTEXITCODE -ne 0) { throw "Unable to download $Url" }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA1).Hash -ne $Sha1) {
        throw "Downloaded tool hash does not match Tauri's expected hash: $Url"
    }
}

if (!(Test-Path -LiteralPath (Join-Path $nsisDirectory 'makensis.exe'))) {
    $temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('kcap-nsis-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Force -Path $temporaryDirectory | Out-Null
    $archive = Join-Path $temporaryDirectory 'nsis-3.11.zip'
    Get-VerifiedTool 'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip' $archive 'EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D'
    Expand-Archive -LiteralPath $archive -DestinationPath $temporaryDirectory
    New-Item -ItemType Directory -Force -Path $nsisDirectory | Out-Null
    Copy-Item -Path (Join-Path $temporaryDirectory 'nsis-3.11/*') -Destination $nsisDirectory -Recurse -Force
}

if (!(Test-Path -LiteralPath $pluginPath) -or (Get-FileHash -LiteralPath $pluginPath -Algorithm SHA1).Hash -ne $pluginHash) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pluginPath) | Out-Null
    Get-VerifiedTool 'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll' $pluginPath $pluginHash
}

Write-Output "NSIS tools ready: $nsisDirectory"
