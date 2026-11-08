param(
    [string]$Destination = "build/publish/kcap"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$destinationPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Destination))
if ($destinationPath -eq $projectRoot -or !$destinationPath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "The export folder must be a subfolder of this project."
}

$files = @(
    ".gitattributes", ".gitignore", "README.md", "index.html",
    "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
    "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/build.rs", "src-tauri/tauri.conf.json"
)
$folders = @(".github", "docs", "scripts", "src", "src-tauri/src", "src-tauri/capabilities", "src-tauri/icons")
foreach ($folder in $folders) {
    $files += Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -Recurse -File | ForEach-Object {
        $_.FullName.Substring($projectRoot.Length + 1)
    }
}

foreach ($relativePath in $files) {
    $target = Join-Path $destinationPath $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination $target -Force
}
Write-Output "KCap source exported to: $destinationPath"
