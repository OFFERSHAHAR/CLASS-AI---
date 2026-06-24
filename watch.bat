@echo off
cd /d "%~dp0"
echo [Liquid Watch] Starting hourly scraper...
echo Press Ctrl+C to stop
echo.
node -e "(async()=>{const m=await import('./scraper.mjs');await m.main();setInterval(async()=>{await m.main()},3600000)})()"