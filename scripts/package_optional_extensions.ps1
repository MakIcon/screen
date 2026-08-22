param(
    [string]$OutputDirectory = "dist-extensions"
)

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot "extensions\mineflayer-bot"
$outputRoot = Join-Path $workspaceRoot $OutputDirectory
$stageDirectory = Join-Path $outputRoot "mineflayer-bot"
$archivePath = Join-Path $outputRoot "screenlauncher-mineflayer-bot.zip"

if (Test-Path -LiteralPath $stageDirectory) {
    Remove-Item -LiteralPath $stageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $sourceDirectory "worker.cjs") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $sourceDirectory "extension.json") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $sourceDirectory "package.json") -Destination $stageDirectory

Push-Location $stageDirectory
try {
    pnpm install --prod --ignore-workspace --frozen-lockfile=false --node-linker=hoisted
} finally {
    Pop-Location
}

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
Compress-Archive -Path (Join-Path $stageDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output $archivePath
