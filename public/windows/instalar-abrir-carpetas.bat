@echo off
rem Registra los enlaces visorpn: para el usuario actual y permite que Chrome y Edge
rem los abran sin preguntar. Ejecutar con doble clic, no como administrador: el permiso
rem del navegador pide su propia autorizacion y los enlaces quedan en este usuario.
setlocal
set "BAT=%~f0"
set "DEST=%LOCALAPPDATA%\VisorPN"
set "SERVIDOR=drawings.anatekelectronics.local"
set "CHROME=HKLM\SOFTWARE\Policies\Google\Chrome"
set "EDGE=HKLM\SOFTWARE\Policies\Microsoft\Edge"

if /i "%~1"=="/politica" goto politica

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

rem El permiso del navegador solo se pide si falta en alguno de los dos
set "FALTA="
reg query "%CHROME%" /v AutoLaunchProtocolsFromOrigins 2>nul | findstr /c:"visorpn" | findstr /c:"%SERVIDOR%" >nul || set "FALTA=1"
reg query "%EDGE%" /v AutoLaunchProtocolsFromOrigins 2>nul | findstr /c:"visorpn" | findstr /c:"%SERVIDOR%" >nul || set "FALTA=1"
if not defined FALTA goto fin

echo Para que el navegador no pregunte cada vez, Windows pedira autorizacion.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath $env:BAT -ArgumentList '/politica' -Verb RunAs -Wait -ErrorAction Stop } catch { exit 1 }"
if errorlevel 1 (
  echo No se autorizo el permiso: Abrir funciona, pero el navegador seguira preguntando.
) else (
  echo Cierra por completo el navegador y vuelve a abrirlo.
)
echo.

:fin
pause
exit /b 0

:error
echo.
echo No se pudo instalar. Puedes seguir usando el boton Copiar.
echo.
pause
exit /b 1

rem Parte que corre con permisos de administrador
:politica
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:BAT); $a=$t.IndexOf('#--'+'-POLITICA---'); $b=$t.IndexOf('#--'+'-SCRIPT---'); Invoke-Expression $t.Substring($a,$b-$a)"
echo.
pause
exit /b 0

#---POLITICA---
# Agrega visorpn a AutoLaunchProtocolsFromOrigins conservando los demas protocolos (sgc, etc.).
# Cada protocolo debe tener una sola entrada, con todas sus direcciones.
$nombre = 'AutoLaunchProtocolsFromOrigins'
$entrada = '{"allowed_origins":["http://drawings.anatekelectronics.local","http://drawings","http://192.168.0.3:3000"],"protocol":"visorpn"}'
foreach ($clave in 'HKLM:\SOFTWARE\Policies\Google\Chrome', 'HKLM:\SOFTWARE\Policies\Microsoft\Edge') {
  try {
    # New-Item -Force sobre una clave existente borraria sus valores
    if (-not (Test-Path -LiteralPath $clave)) { New-Item -Path $clave -Force -ErrorAction Stop | Out-Null }
    $actual = (Get-ItemProperty -LiteralPath $clave -Name $nombre -ErrorAction SilentlyContinue).$nombre
    $partes = @()
    if ($actual) {
      $datos = ConvertFrom-Json $actual
      foreach ($e in @($datos | ForEach-Object { $_ })) {
        if ($e.protocol -ne 'visorpn') { $partes += ($e | ConvertTo-Json -Compress -Depth 5) }
      }
    }
    $partes += $entrada
    Set-ItemProperty -LiteralPath $clave -Name $nombre -Value ('[' + ($partes -join ',') + ']') -Type String -ErrorAction Stop
    Write-Host "$clave : listo. Permisos: $($partes.Count)"
  } catch {
    Write-Host "$clave : no se modifico. $($_.Exception.Message)"
  }
}

#---SCRIPT---
# Abre en el Explorador una carpeta del NAS a partir de un enlace visorpn:
# Cualquier pagina web puede generar estos enlaces, asi que solo se aceptan
# carpetas dentro de estas raices y nunca se ejecuta un archivo.
$servidores = @('nas', '192.168.0.4')
$raices = @(
  'Compartida Produccion\DRAWINGS',
  'Compartida Produccion\FOTO DE PIEZAS (desde 2019)'
)

if ($args.Count -ne 1) { exit 1 }
$url = [string]$args[0]
$prefijo = 'visorpn:'
if (-not $url.StartsWith($prefijo, [StringComparison]::OrdinalIgnoreCase)) { exit 1 }

$ruta = [Uri]::UnescapeDataString($url.Substring($prefijo.Length).TrimEnd('/')).TrimEnd('\')

# Caracteres no validos en una carpeta, o que permitirian salir de la raiz
if ($ruta -match '[/"<>|?*:\x00-\x1f]') { exit 1 }
if ($ruta -match '\\[. ]+(\\|$)') { exit 1 }

$relativa = $null
foreach ($servidor in $servidores) {
  foreach ($raiz in $raices) {
    $base = "\\$servidor\$raiz"
    if ($ruta -ieq $base -or $ruta.StartsWith("$base\", [StringComparison]::OrdinalIgnoreCase)) {
      $relativa = $ruta.Substring("\\$servidor\".Length)
    }
  }
}
if (-not $relativa) { exit 1 }

# Las PCs fuera del dominio pueden no resolver \\nas: se prueba por nombre y luego por IP
foreach ($servidor in $servidores) {
  $destino = "\\$servidor\$relativa"
  if (Test-Path -LiteralPath $destino -PathType Container) {
    Start-Process explorer.exe -ArgumentList "`"$destino`""
    exit 0
  }
}

(New-Object -ComObject WScript.Shell).Popup("No se pudo abrir la carpeta:`n$ruta", 0, 'Visor P/N', 48) | Out-Null
exit 1
