# Seguridad

## Modelo de amenazas

DSH_F asume que el contenido de proyectos, plugins y respuestas de modelo puede ser hostil. La capa de escritorio no confía en el renderer ni en la UI de Harness para acceder a APIs nativas.

## Fronteras

1. **Renderer shell** (`dshf://app`): sandbox, `contextIsolation`, sin `nodeIntegration`, CSP estricta. Solo puede invocar `window.dshDesktop`, un API finito validado con Zod en el proceso main.
2. **Preload**: expone un único canal IPC (`dshf:command`). El main rechaza cualquier sender que no sea la ventana principal con origen `dshf://app`.
3. **Motor Harness**: proceso hijo con `DSH_HOME`/`DSH_AGENTS_HOME` propios, `DSH_PERMISSION_MODE=workspace-write`, entorno limpiado de `NODE_OPTIONS`, variables Electron y overrides DSH heredados.
4. **Puente loopback**: servidor HTTP/WS en `127.0.0.1` con cookie propia `dshf_bridge` (`HttpOnly`, `SameSite=None`, `Secure`) y ticket bootstrap de un solo uso caducado a 60 s. El token upstream nunca llega al renderer ni a URLs del shell.
5. **Navegación**: el frame principal solo puede navegar dentro de `dshf://app`; el iframe de Harness solo dentro del origen actual del puente. `window.open` se deniega y, si el destino es HTTPS de confianza, se abre con `shell.openExternal`.
6. **Permisos**: cámara, micrófono, geolocalización, USB, serie, etc. se deniegan. Solo clipboard read/write para el shell y el origen actual del puente.
7. **Descargas**: se cancelan salvo que provengan del origen actual del puente.
8. **Archivos**: preferencias y logs con modo `0600`, directorios `0700`, escrituras atómicas con backup. Rutas de workspace canonicalizadas; la vista previa solo admite carpetas bajo `.preview/workspaces`.

## Secretos y Diagnóstico

- El token de arranque se intercambia por cookie en el main y no se persiste.
- `DiagnosticLog` redacta en ingestión: tokens de URL, `Authorization`, `Cookie`, `Set-Cookie`, `api_key`, `secret`, `password`, `access_token` y claves `sk-…`.
- El diagnóstico exportado elimina `bridgeUrl` y limita el registro a 64 KB.
- El registro rota a 512 KB; fallos del logger nunca detienen el motor.

## Ciclo de vida Del proceso

- Un solo grupo de procesos por instancia (`detached` en Linux).
- Guarda de ciclo de vida precargada en el Node del motor: si el proceso padre muere abruptamente, el canal IPC se desconecta y la guarda termina todo el grupo huérfano. Las paradas normales envían un mensaje de liberación antes de `SIGTERM` para conservar el cierre graceful.
- Parada: `SIGTERM` al grupo; escalada a `SIGKILL` tras 8 s.
- Auto-restart acotado a 3 intentos con backoff exponencial.
- `single-instance-lock`; cierre a bandeja opcional y confirmación de salida.

## Overrides de dependencias

`runtime/package.json` fija overrides para advisories conocidos del árbol upstream. Cualquier actualización del motor debe re-ejecutar:

```bash
npm run upstream:prepare -- --version <x.y.z> --commit <sha>
npm --prefix runtime ci
npm run qualify:runtime
```

`qualify:runtime` incluye auditoría de raíz/runtime y pruebas de integración con el motor real. `package:runtime` rechaza empaquetar si la cualificación no coincide con el manifiesto, lockfile, `upstream.json` o los CSS de tema actuales.

## Reportar problemas

Abre un issue en https://github.com/JINROO1/DSH_F/issues sin incluir tokens, cookies ni claves. Para vulnerabilidades del motor oficial, reporta también al upstream DeepSeek Harness.
