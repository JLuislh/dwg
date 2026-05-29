# Despliegue en producción

La PC servidor es una máquina Windows con acceso al NAS. No es un servidor dedicado: probablemente la misma de un usuario.

## Requisitos mínimos

- Windows 10/11 con acceso a `\\nas\Compartida Produccion` (probar abriendo en Explorador).
- Node.js LTS instalado.
- Permisos de lectura sobre las dos carpetas raíz.
- Puerto 3000 libre, o cambiar `PORT` en `server.js`.

## Primera instalación

```powershell
cd C:\
git clone <repo> visor-pn       # o copiar la carpeta
cd visor-pn
npm install
npm start
```

Verificar que abra `http://localhost:3000` y reindexar la primera vez.

## Acceso desde la red

1. **Saber la IP de la PC servidor:**
   ```powershell
   ipconfig | findstr IPv4
   ```
2. **Abrir el puerto en el firewall:**
   ```powershell
   New-NetFirewallRule -DisplayName "Visor PN" -Direction Inbound `
     -Protocol TCP -LocalPort 3000 -Action Allow
   ```
   (Requiere PowerShell como Administrador.)
3. Desde otra PC: `http://<IP-servidor>:3000`.

**Recomendación:** que la PC servidor tenga IP fija (en el router o configurada en Windows), para que el URL no cambie.

## Dejarlo corriendo siempre

### Opción A: PM2 (más simple, requiere sesión iniciada)

```powershell
npm install -g pm2
pm2 start server.js --name visor-pn
pm2 save
pm2 startup
```

Limitación: si nadie abre sesión en Windows después de un reinicio, PM2 no arranca.

### Opción B: NSSM (servicio real, sobrevive reinicios sin login)

Descargar NSSM desde nssm.cc, copiar `nssm.exe` a `C:\Windows\System32`.

```powershell
nssm install VisorPN "C:\Program Files\nodejs\node.exe"
nssm set VisorPN AppDirectory C:\visor-pn
nssm set VisorPN AppParameters server.js
nssm set VisorPN AppStdout C:\visor-pn\logs\stdout.log
nssm set VisorPN AppStderr C:\visor-pn\logs\stderr.log
nssm set VisorPN Start SERVICE_AUTO_START
nssm start VisorPN
```

Si se necesita modificar: `nssm edit VisorPN`. Para quitarlo: `nssm remove VisorPN`.

**Atención:** el servicio corre como `LocalSystem` por defecto, que normalmente NO tiene acceso a recursos UNC mapeados por el usuario. Hay dos formas de resolver:

1. Configurar el servicio para correr con una cuenta de usuario con acceso al NAS:
   ```powershell
   nssm set VisorPN ObjectName ".\NombreUsuario" "contraseña"
   ```
2. O dar permisos a la cuenta de máquina (`NOMBRE-PC$`) en el NAS.

La (1) es más fácil de explicar.

## Actualizar el código

Cuando se cambie `server.js` o `public/index.html`:

```powershell
cd C:\visor-pn
# (copiar archivos nuevos o git pull)
# Si se cambió la forma del índice, borrar el caché:
del index-cache.json
# Reiniciar:
pm2 restart visor-pn      # o nssm restart VisorPN
```

El frontend (`public/index.html`) se recarga con F5 en el navegador, no necesita reiniciar el server.

## Diagnóstico cuando no arranca

Orden de chequeo:

1. ¿El usuario está en la carpeta correcta? (`dir` debe mostrar `package.json`).
2. ¿`npm install` corrió sin error? Si dio error de red, probar `npm config set registry https://registry.npmjs.org/`.
3. ¿Las rutas UNC son correctas y tienen permisos? Abrir `\\nas\Compartida Produccion\DRAWINGS` en el Explorador con la misma cuenta.
4. ¿El puerto 3000 está libre? `netstat -ano | findstr :3000`.
5. ¿Otro firewall (antivirus) bloquea? Probar deshabilitar temporalmente.

## Backup

Hay un solo archivo que se regenera y no es crítico (`index-cache.json`). Todo lo demás (`server.js`, `public/`, `package.json`) cabe en git o un zip. No hay datos del usuario que respaldar.
