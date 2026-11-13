# Pruebas

## Pirámide

| Capa | Comando | Qué verifica |
|---|---|---|
| Tipos | `npm run typecheck` | TypeScript estricto en main, preload, renderer, tests y configs. |
| Unitarias | `npm run test` | Contratos Zod, fence de seguridad, cookies, tickets, proxy HTTP/WS, fuentes del tema, persistencia atómica, logs/redacción, ciclo de vida del runtime, autostart XDG, paridad CSS shell/agente, contraste WCAG, actualizaciones, notificaciones, SBOM/licencias, plantillas, disponibilidad de rutas y backup de preferencias. |
| Cobertura | `npm run test:coverage` | Umbrales: 80% líneas/funciones/statements y 70% branches en la capa main crítica. |
| Integración | `npm run test:integration` | Arranca el motor oficial real con el Node incluido; sincroniza ajustes; sirve la UI decorada; crea workspace/sesión; reinicia y conserva estado; libera puertos al parar. |
| E2E navegador | `npm run test:e2e` | Playwright + axe-core: matriz axe de 6 escenarios en claro/oscuro, teclado/foco/sistema/movimiento, portada, paleta, tema/idioma, proyectos, iframe Harness, paridad shell/agente, diagnóstico/exportación, stop/restart, productividad (favoritos/alias/plantillas/preferencias), responsive y enlaces externos. |
| Smoke Electron | `npm run test:electron` | Ventana nativa, IPC, motor real, reinicio y cierre limpio. Requiere binario Electron y display (CI usa `xvfb-run`). |
| Auditoría | `npm run audit:dependencies` | `npm audit --omit=dev` en raíz y runtime. |
| Rendimiento | `npm run measure:performance` | Línea base repetible de arranque/memoria con motor real; exige WebSocket y no aplica optimizaciones. |
| Completa | `npm run check` | Typecheck + cobertura + build + integración + E2E. |
| Cualificación de release | `npm run qualify:runtime` | Auditoría + `check`; escribe `.packaging/qualification.json` ligado al manifiesto, lockfile, `upstream.json` y CSS de tema. Obligatorio antes de `package:fedora`. |

## Accesibilidad

La matriz y los límites están en [ACCESIBILIDAD.md](ACCESIBILIDAD.md). `tests/e2e/accessibility.spec.ts` audita la shell y los diálogos propios en claro/oscuro excluyendo solo el iframe upstream; no desactiva `color-contrast`. `tests/unit/theme-contrast.test.ts` comprueba pares token/fondo, fondos suaves, botones/hover y extremos/puntos de gradiente con umbral exacto 4.5:1. La revisión con lector de pantalla, zoom, alto contraste y Plasma real sigue pendiente.

## Ejecutar en Fedora KDE

```bash
sudo dnf install -y nodejs npm git rpm-build \
  nss nspr atk at-spi2-atk cups-libs libdrm mesa-libgbm alsa-lib gtk3 \
  libXScrnSaver libnotify libxkbcommon libXcomposite libXdamage libXrandr \
  libXfixes libXext libX11 libxcb expat glib2 dbus-libs pango cairo \
  mesa-libEGL libglvnd-opengl libuuid xorg-x11-server-Xvfb xorg-x11-xauth

npm ci
npm --prefix runtime ci
npx playwright install chromium
npm run qualify:runtime
xvfb-run -a npm run test:electron
npm run package:fedora
sudo dnf install -y release/dsh-fedora-0.1.0-x86_64.rpm
```

## Entorno de desarrollo sin KDE

La vista previa (`npm run preview`) usa el mismo runtime, puente y renderer, pero sustituye Electron por un servidor HTTP y un adaptador de navegador. Sirve para validar UI, integración y E2E en cualquier Linux. No sustituye al smoke nativo Electron ni a la instalación RPM en Fedora/Plasma.

## CI

`.github/workflows/ci.yml` ejecuta `qualify:runtime` (auditoría + `check`), smoke Electron con Xvfb, empaquetado RPM, checksums SHA-256, SBOM, licencias `--strict`, validación de metadatos RPM e instalación del RPM en un contenedor `fedora:latest`. Las releases `v*` publican RPM, `SHA256SUMS`, `sbom.json` y `LICENSES.json`; la firma criptográfica sigue bloqueada.
