@echo off
rem ===========================================================================
rem  DEV ONLY: a local test launcher for working on Yule Log on Windows.
rem
rem  This is not part of the app and never ships. The installers contain only
rem  the compiled yule-log binary and the src\ frontend (tauri.conf.json
rem  "frontendDist"). Nothing in scripts\ is bundled.
rem
rem    scripts\dev-run.bat            dev mode (npm run dev), reloads src\ on save
rem    scripts\dev-run.bat release    compile a release build of the current code
rem                                   (no installer) and launch it
rem
rem  Start LM Studio's server first (Developer tab, port 1234) so there is a
rem  model to burn. To just use Yule Log, install it from the GitHub Releases
rem  page instead.
rem ===========================================================================
setlocal
cd /d "%~dp0.."

if not exist node_modules (
    echo [dev] Installing dev dependencies...
    call npm install || goto failed
)

if /i "%~1"=="release" (
    echo [dev] Compiling a release build of the current code. The first one takes a while...
    call npx tauri build --no-bundle || goto failed
    start "" "src-tauri\target\release\yule-log.exe"
    exit /b 0
)

echo [dev] Starting dev mode. The first run compiles the Rust side, which takes a while...
call npm run dev || goto failed
exit /b 0

:failed
echo.
echo [dev] Something went wrong, see the output above.
pause
exit /b 1
