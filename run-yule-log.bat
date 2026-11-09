@echo off
rem Launches the Yule Log desktop fireplace.
rem Make sure LM Studio's server is running (Developer tab, port 1234) so there is a model to burn.

set "EXE=%~dp0src-tauri\target\release\yule-log.exe"

if exist "%EXE%" (
    start "" "%EXE%"
    exit /b 0
)

echo Release build not found, starting dev mode instead (first run compiles, this can take a while)...
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run dev
