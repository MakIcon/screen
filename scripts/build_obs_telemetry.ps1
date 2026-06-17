$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ModDir = Join-Path $ProjectRoot "obs-telemetry-mod"
$Versions = @("1.21", "1.21.1", "1.21.4")

foreach ($Version in $Versions) {
    Write-Host "Building OBS telemetry mod for Minecraft $Version"
    Push-Location $ModDir
    try {
        & .\gradlew.bat clean build "-Pminecraft_version=$Version"
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed for Minecraft $Version"
        }
    }
    finally {
        Pop-Location
    }
}
