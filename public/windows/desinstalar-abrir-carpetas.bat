@echo off
rem Quita los enlaces visorpn: del usuario actual.
reg delete "HKCU\Software\Classes\visorpn" /f >nul 2>&1
if exist "%LOCALAPPDATA%\VisorPN" rmdir /s /q "%LOCALAPPDATA%\VisorPN"
echo.
echo Listo. Se quito el boton Abrir de esta PC.
echo.
pause
