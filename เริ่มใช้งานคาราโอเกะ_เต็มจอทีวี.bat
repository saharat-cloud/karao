@echo off
chcp 65001 >nul
title Premium Karaoke TV - Standalone TV App
echo ========================================================
echo   กำลังเปิด Premium Karaoke TV เต็มจอทีวี 100%% ไร้ขอบ...
echo ========================================================
echo.

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk "http://localhost/karaoke/" --edge-kiosk-type=fullscreen --no-first-run --user-data-dir="%TEMP%\karaoke_tv_profile"
    exit
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "http://localhost/karaoke/" --no-first-run --user-data-dir="%TEMP%\karaoke_tv_profile"
    exit
)

if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --kiosk "http://localhost/karaoke/" --edge-kiosk-type=fullscreen --no-first-run --user-data-dir="%TEMP%\karaoke_tv_profile"
    exit
)

start "" http://localhost/karaoke/
exit

