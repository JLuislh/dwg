@echo off
rem Registra los enlaces visorpn: solo para el usuario actual (no requiere administrador).
setlocal
set "BAT=%~f0"
set "DEST=%LOCALAPPDATA%\VisorPN"
if not exist "%DEST%" mkdir "%DEST%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:BAT); $m='#--'+'-SCRIPT---'; $i=$t.IndexOf($m); [IO.File]::WriteAllText((Join-Path $env:DEST 'abrir.ps1'), $t.Substring($i+$m.Length).TrimStart())"
if errorlevel 1 goto error
if not exist "%DEST%\abrir.ps1" goto error

reg add "HKCU\Software\Classes\visorpn" /ve /d "URL:Visor PN" /f >nul || goto error
reg add "HKCU\Software\Classes\visorpn" /v "URL Protocol" /d "" /f >nul || goto error
reg add "HKCU\Software\Classes\visorpn\shell\open\command" /ve /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%DEST%\abrir.ps1\" \"%%1\"" /f >nul || goto error

echo.
echo Listo. Ya puedes usar el boton Abrir del Visor P/N.
echo.
pause
exit /b 0

:error
echo.
echo No se pudo instalar. Puedes seguir usando el boton Copiar.
echo.
pause
exit /b 1

#---SCRIPT---
# Abre en el Explorador una carpeta del NAS a partir de un enlace visorpn:
# Cualquier pagina web puede generar estos enlaces, asi que solo se aceptan
# carpetas dentro de estas raices y nunca se ejecuta un archivo.
$raices = @(
  '\\nas\Compartida Produccion\DRAWINGS',
  '\\nas\Compartida Produccion\FOTO DE PIEZAS (desde 2019)'
)

if ($args.Count -ne 1) { exit 1 }
$url = [string]$args[0]
$prefijo = 'visorpn:'
if (-not $url.StartsWith($prefijo, [StringComparison]::OrdinalIgnoreCase)) { exit 1 }

$ruta = [Uri]::UnescapeDataString($url.Substring($prefijo.Length).TrimEnd('/')).TrimEnd('\')

# Caracteres no validos en una carpeta, o que permitirian salir de la raiz
if ($ruta -match '[/"<>|?*:\x00-\x1f]') { exit 1 }
if ($ruta -match '\\[. ]+(\\|$)') { exit 1 }

$permitida = $false
foreach ($raiz in $raices) {
  if ($ruta -ieq $raiz -or $ruta.StartsWith("$raiz\", [StringComparison]::OrdinalIgnoreCase)) { $permitida = $true }
}
if (-not $permitida) { exit 1 }

if (-not (Test-Path -LiteralPath $ruta -PathType Container)) {
  (New-Object -ComObject WScript.Shell).Popup("No se pudo abrir la carpeta:`n$ruta", 0, 'Visor P/N', 48) | Out-Null
  exit 1
}

Start-Process explorer.exe -ArgumentList "`"$ruta`""
