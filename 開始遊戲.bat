@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Double-click to start the game: runs a local server for the dist folder and opens the browser.
where py >nul 2>nul && (py -3 scripts\serve.py & goto :eof)
where python >nul 2>nul && (python scripts\serve.py & goto :eof)
echo.
echo 找不到 Python。請到 https://www.python.org/downloads/ 安裝（安裝時勾選 Add python.exe to PATH），再重新雙擊這個檔案。
echo Python was not found. Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH") and run this again.
echo.
pause
