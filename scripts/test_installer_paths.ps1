# Exercise the production NSIS callback against real hidden Win32 text controls.
# No application files are installed and no registry entries are modified.
$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $workspaceRoot ".installer-path-check.local"
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$source = Get-Content -LiteralPath (Join-Path $workspaceRoot "src-tauri\nsis\quiet-start.nsh") -Raw -Encoding UTF8
$callback = [regex]::Match($source, '(?s)Function ScreenOptionsLeave\r?\n.*?FunctionEnd').Value
if (!$callback) { throw "ScreenOptionsLeave callback was not found" }
$harness = @'
Unicode true
!include LogicLib.nsh
!include FileFunc.nsh
!include nsDialogs.nsh
Name "ScreenLauncher directory regression check"
OutFile "path-check.exe"
RequestExecutionLevel user
SilentInstall silent
Var ScreenPath
Var ScreenDesktop
Var ScreenDesktopChoice
Var ExpectedPath
Function CheckPath
  System::Call 'user32::CreateWindowEx(i 0, w "EDIT", w "$ExpectedPath", i 0, i 0, i 0, i 10, i 10, p 0, p 0, p 0, p 0) p .s'
  Pop $ScreenPath
  StrCpy $INSTDIR "uninitialized"
  Call ScreenOptionsLeave
  System::Call 'user32::DestroyWindow(p $ScreenPath)'
  ${If} $INSTDIR != $ExpectedPath
    FileOpen $9 "$EXEDIR\result.txt" w
    FileWrite $9 "FAIL: expected $ExpectedPath, got $INSTDIR"
    FileClose $9
    SetErrorLevel 1
    Quit
  ${EndIf}
FunctionEnd
Function .onInit
  StrCpy $ScreenDesktop 0
  ; An existing folder and a new nested folder with Unicode and spaces.
  StrCpy $ExpectedPath "$EXEDIR"
  Call CheckPath
  StrCpy $ExpectedPath "$EXEDIR\new-$HWNDPARENT\Новая папка\Screen Launcher"
  Call CheckPath
  IfFileExists "$ExpectedPath\*.*" 0 +3
    SetErrorLevel 2
    Quit
  FileOpen $9 "$EXEDIR\result.txt" w
  FileWrite $9 "PASS: existing and missing directories preserve the full installation path"
  FileClose $9
  SetErrorLevel 0
  Quit
FunctionEnd
Section
SectionEnd
'@
$scriptPath = Join-Path $testRoot "path-check.nsi"
Set-Content -LiteralPath $scriptPath -Value ($harness + "`r`n" + $callback) -Encoding UTF8
$compiler = Join-Path $env:LOCALAPPDATA "tauri\NSIS\makensis.exe"
if (!(Test-Path -LiteralPath $compiler)) {
    $compiler = (Get-Command makensis.exe -ErrorAction Stop).Source
}
& $compiler /V2 $scriptPath
if ($LASTEXITCODE -ne 0) { throw "NSIS path test compilation failed" }
$process = Start-Process -FilePath (Join-Path $testRoot "path-check.exe") -WindowStyle Hidden -Wait -PassThru
$result = Get-Content -LiteralPath (Join-Path $testRoot "result.txt") -Raw
if ($process.ExitCode -ne 0 -or !$result.StartsWith('PASS:')) { throw $result }
Write-Output $result

# Exercise the same early guard used by silent /D installations. The guard must
# reject a drive root before creating directories or temporary files there.
$installerSource = Get-Content -LiteralPath (Join-Path $workspaceRoot "src-tauri\nsis\installer.nsi") -Raw -Encoding UTF8
$preflight = [regex]::Match($installerSource, '(?s)Section Install\r?\n.*?SetOutPath \$INSTDIR').Value
if (!$preflight) { throw "Installer directory preflight was not found" }
$preflightHarness = @'
Unicode true
!include LogicLib.nsh
!include FileFunc.nsh
Name "ScreenLauncher silent directory check"
OutFile "preflight.exe"
RequestExecutionLevel user
SilentInstall silent
Function .onInit
  StrCpy $INSTDIR "C:\"
FunctionEnd
'@
$preflightPath = Join-Path $testRoot "preflight.nsi"
Set-Content -LiteralPath $preflightPath -Value ($preflightHarness + "`r`n" + $preflight + "`r`nSectionEnd") -Encoding UTF8
& $compiler /V2 $preflightPath
if ($LASTEXITCODE -ne 0) { throw "NSIS preflight test compilation failed" }
$process = Start-Process -FilePath (Join-Path $testRoot "preflight.exe") -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 2) { throw "Unsafe installation root was not rejected: $($process.ExitCode)" }
Write-Output 'PASS: silent installation into a drive root is rejected before writing files'
