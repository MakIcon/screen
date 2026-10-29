param(
    [string]$OutputDirectory = "dist-extensions"
)

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $OutputDirectory))
$workspacePrefix = [System.IO.Path]::GetFullPath($workspaceRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if (!$outputRoot.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Extension output directory must be inside the workspace: $outputRoot"
}
$manifestPath = Join-Path $workspaceRoot "extensions\obs-telemetry\extension.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$stageDirectory = [System.IO.Path]::GetFullPath((Join-Path $outputRoot "obs-telemetry"))
$outputPrefix = $outputRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if (!$stageDirectory.StartsWith($outputPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Extension staging directory must be inside the output directory: $stageDirectory"
}

# Check the catalog before replacing a previously packaged extension.
foreach ($file in $manifest.files) {
    if ($file.name -match '[/\\:]' -or $file.name -in @('', '.', '..')) {
        throw "Invalid OBS package filename: $($file.name)"
    }
    $source = Join-Path $workspaceRoot "src-tauri\resources\obs-telemetry\$($file.name)"
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($source)
    try {
        $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $sha.Dispose()
    }
    if ((Get-Item -LiteralPath $source).Length -ne $file.size -or
        $hash -ne $file.sha256) {
        throw "OBS catalog hashes are stale. Run scripts/update_obs_telemetry_catalog.ps1: $($file.name)"
    }
}
if (Test-Path -LiteralPath $stageDirectory) {
    Remove-Item -LiteralPath $stageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null
Copy-Item -LiteralPath $manifestPath -Destination $stageDirectory
foreach ($file in $manifest.files) {
    Copy-Item -LiteralPath (Join-Path $workspaceRoot "src-tauri\resources\obs-telemetry\$($file.name)") -Destination $stageDirectory
}
$archivePath = Join-Path $outputRoot "screenlauncher-obs-telemetry.zip"
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stageDirectory, $archivePath,
    [System.IO.Compression.CompressionLevel]::Optimal, $false)
Write-Output $archivePath
