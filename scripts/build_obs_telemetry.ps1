param(
    [string[]]$MinecraftVersions
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ModDir = Join-Path $ProjectRoot "obs-telemetry-mod"

if (-not $MinecraftVersions) {
    $PropertiesPath = Join-Path $ModDir "gradle.properties"
    $Properties = ConvertFrom-StringData (Get-Content $PropertiesPath -Raw)
    $MinecraftVersions = $Properties.supported_minecraft_versions -split "," |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ }
}

if (-not $MinecraftVersions) {
    throw "No supported Minecraft versions are configured"
}

Push-Location $ModDir
try {
    foreach ($Version in $MinecraftVersions) {
        Write-Host "Building OBS telemetry mod for Minecraft $Version"
        & .\gradlew.bat clean build "-Pminecraft_version=$Version"
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed for Minecraft $Version"
        }
    }
}
finally {
    Pop-Location
}