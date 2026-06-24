@echo off
cd /d "%~dp0"
echo [Liquid Watch] Running one-time scrape...
node scraper.mjs
if %errorlevel% equ 0 (
  echo Done. Open index.html to view results.
  start "" "%~dp0index.html"
) else (
  echo Scraper failed. Check network connection.
  pause
)