@echo off
rem Quita los enlaces visorpn: del usuario actual y su permiso en Chrome y Edge.
rem El permiso pide autorizacion de Windows porque aplica a toda la PC.
setlocal
set "BAT=%~f0"
set "CHROME=HKLM\SOFTWARE\Policies\Google\Chrome"
set "EDGE=HKLM\SOFTWARE\Policies\Microsoft\Edge"

if /i "%~1"=="/politica" goto politica

reg delete "HKCU\Software\Classes\visorpn" /f >nul 2>&1
if exist "%LOCALAPPDATA%\VisorPN" rmdir /s /q "%LOCALAPPDATA%\VisorPN"

set "HAY="
reg query "%CHROME%" /v AutoLaunchProtocolsFromOrigins 2>nul | findstr /c:"visorpn" >nul && set "HAY=1"
reg query "%EDGE%" /v AutoLaunchProtocolsFromOrigins 2>nul | findstr /c:"visorpn" >nul && set "HAY=1"
if not defined HAY goto fin

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath $env:BAT -ArgumentList '/politica' -Verb RunAs -Wait -ErrorAction Stop } catch { exit 1 }"
if errorlevel 1 echo No se autorizo: el permiso del navegador sigue instalado en esta PC.

:fin
echo.
echo Listo. Se quito el boton Abrir de esta PC.
echo.
pause
exit /b 0

rem Parte que corre con permisos de administrador
:politica
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:BAT); $a=$t.IndexOf('#--'+'-POLITICA---'); Invoke-Expression $t.Substring($a)"
echo.
pause
exit /b 0

#---POLITICA---
# Quita solo visorpn de AutoLaunchProtocolsFromOrigins y conserva los demas protocolos (sgc, etc.).
$nombre = 'AutoLaunchProtocolsFromOrigins'
foreach ($clave in 'HKLM:\SOFTWARE\Policies\Google\Chrome', 'HKLM:\SOFTWARE\Policies\Microsoft\Edge') {
  try {
    $actual = (Get-ItemProperty -LiteralPath $clave -Name $nombre -ErrorAction SilentlyContinue).$nombre
    if (-not $actual) { continue }
    $datos = ConvertFrom-Json $actual
    $partes = @()
    foreach ($e in @($datos | ForEach-Object { $_ })) {
      if ($e.protocol -ne 'visorpn') { $partes += ($e | ConvertTo-Json -Compress -Depth 5) }
    }
    if ($partes.Count) {
      Set-ItemProperty -LiteralPath $clave -Name $nombre -Value ('[' + ($partes -join ',') + ']') -Type String -ErrorAction Stop
    } else {
      Remove-ItemProperty -LiteralPath $clave -Name $nombre -ErrorAction Stop
    }
    Write-Host "$clave : listo."
  } catch {
    Write-Host "$clave : no se modifico. $($_.Exception.Message)"
  }
}
