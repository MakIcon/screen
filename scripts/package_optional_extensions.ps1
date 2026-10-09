param(
    [string]$OutputDirectory = "dist-extensions"
)

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot "extensions\mineflayer-bot"
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $OutputDirectory))
$stageDirectory = Join-Path $outputRoot "mineflayer-bot"
$archivePath = Join-Path $outputRoot "screenlauncher-mineflayer-bot.zip"

$workspacePrefix = [System.IO.Path]::GetFullPath($workspaceRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if (!$outputRoot.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Extension output directory must be inside the workspace: $outputRoot"
}
$outputPrefix = $outputRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if (![System.IO.Path]::GetFullPath($stageDirectory).StartsWith($outputPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Extension staging directory must be inside the output directory: $stageDirectory"
}

pnpm --dir $sourceDirectory build:pathfinder
if ($LASTEXITCODE -ne 0) { throw "Pathfinder build failed" }

if (Test-Path -LiteralPath $stageDirectory) {
    Remove-Item -LiteralPath $stageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $sourceDirectory "worker.cjs") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $sourceDirectory "combat.cjs") -Destination $stageDirectory
foreach ($file in @("pearls.cjs", "crystals.cjs", "bow-defense.cjs", "combat-inventory.cjs")) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory $file) -Destination $stageDirectory
}
Copy-Item -LiteralPath (Join-Path $sourceDirectory "combat-defaults.json") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $sourceDirectory "COMBAT.md") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $sourceDirectory "pathfinder.cjs") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $sourceDirectory "extension.json") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $sourceDirectory "package.json") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $sourceDirectory "package-lock.json") -Destination $stageDirectory
foreach ($file in @("COPYING", "THIRD-PARTY-NOTICES.md", "restore-pathfinder-source.cjs", "pathfinder-source.json")) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory $file) -Destination $stageDirectory
}

Push-Location $stageDirectory
try {
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Mineflayer dependency installation failed" }
} finally {
    Pop-Location
}

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
Compress-Archive -Path (Join-Path $stageDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output $archivePath
