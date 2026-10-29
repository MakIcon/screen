param(
    # Set only after publishing assets to an immutable commit/release URL.
    [string]$DownloadBaseUrl = ""
)

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$properties = ConvertFrom-StringData (Get-Content (Join-Path $workspaceRoot "obs-telemetry-mod/gradle.properties") -Raw)
$versions = @($properties.supported_minecraft_versions -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$manifestPath = Join-Path $workspaceRoot "extensions/obs-telemetry/extension.json"
$previous = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$names = @("Monocraft-OFL-1.1.txt", "Monocraft.ttf") + @($versions | ForEach-Object { "obs-telemetry-$($properties.mod_version)+mc$_.jar" })
$files = foreach ($name in $names) {
    $source = Join-Path $workspaceRoot "src-tauri/resources/obs-telemetry/$name"
    if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Build missing OBS asset first: $name" }
    $url = ""
    if ($DownloadBaseUrl) { $url = $DownloadBaseUrl.TrimEnd('/') + '/' + [Uri]::EscapeDataString($name) }
    elseif ($name -notlike '*.jar') { $url = ($previous.files | Where-Object name -eq $name).url }
    [ordered]@{
        name = $name
        url = $url
        sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        size = (Get-Item -LiteralPath $source).Length
    }
}
$manifest = [ordered]@{
    id = "obs-telemetry"
    name = "OBS Telemetry"
    version = $properties.mod_version
    minimumLauncherVersion = "0.2.5"
    supportedMinecraftVersions = $versions
    files = @($files)
}
$json = ($manifest | ConvertTo-Json -Depth 5) + [Environment]::NewLine
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Output "OBS Telemetry $($properties.mod_version): $($versions.Count) Minecraft versions."
if (!$DownloadBaseUrl) { Write-Output 'Local ZIP catalog ready. JAR download URLs remain empty until assets are published.' }
