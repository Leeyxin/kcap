param(
    [string]$OutputDirectory = "build/release"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
$releasePath = Join-Path $projectRoot "src-tauri/target/release"
$executable = Join-Path $releasePath "kcap.exe"
$installers = @(Get-ChildItem -Path (Join-Path $releasePath "bundle/nsis/*-setup.exe") -File)

if (!(Test-Path -LiteralPath $executable) -or $installers.Count -ne 1) {
    throw "Expected kcap.exe and exactly one NSIS installer. Run npm run tauri -- build --bundles nsis -- --locked first."
}

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$setupPath = Join-Path $outputPath "KCap-windows-x64-setup.exe"
$portablePath = Join-Path $outputPath "KCap-windows-x64-portable.zip"
Copy-Item -LiteralPath $installers[0].FullName -Destination $setupPath -Force
Compress-Archive -LiteralPath $executable -DestinationPath $portablePath -Force

$checksums = @($setupPath, $portablePath) | ForEach-Object {
    $hash = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([System.IO.Path]::GetFileName($_))"
}
$checksumPath = Join-Path $outputPath "SHA256SUMS.txt"
[System.IO.File]::WriteAllLines($checksumPath, [string[]]$checksums, [System.Text.UTF8Encoding]::new($false))
Write-Output "Release assets: $outputPath"
