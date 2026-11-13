# Fedora KDE Plasma

## Objetivo

DSH_F está diseñado para Fedora Linux con KDE Plasma (Wayland o X11). La ventana usa decoraciones nativas del sistema, icono de bandeja StatusNotifier cuando Plasma lo expone, lanzador `.desktop`, autostart XDG y notificaciones nativas.

## Instalar desde RPM

```bash
sudo dnf install -y ./dsh-fedora-0.1.0-x86_64.rpm
```

El RPM declara dependencias de Electron/Chromium (NSS, GTK3, GBM, ALSA, X11/Wayland libs). Se instala en `/opt` y registra `dsh-fedora.desktop`.

## Construir el RPM en Fedora

```bash
sudo dnf install -y nodejs npm git rpm-build \
  nss nspr atk at-spi2-atk cups-libs libdrm mesa-libgbm alsa-lib gtk3 \
  libXScrnSaver libnotify libxkbcommon libXcomposite libXdamage libXrandr \
  libXfixes libXext libX11 libxcb expat glib2 dbus-libs pango cairo \
  mesa-libEGL libglvnd-opengl libuuid

npm ci
npm --prefix runtime ci
npm run qualify:runtime
npm run package:fedora
```

El artefacto queda en `release/dsh-fedora-0.1.0-x86_64.rpm`.

## Integración Plasma

- **Bandeja**: icono `tray.png` de 24 px. Si el compositor no expone bandeja, la aplicación degrada a ventana normal y lo registra en diagnóstico.
- **Cerrar a bandeja**: preferencia activada por defecto; la ventana se oculta y el motor sigue disponible. Desactivar para cerrar completamente.
- **Autostart**: escribe `~/.config/autostart/io.github.jinroo1.dshfedora.desktop` con `X-KDE-autostart-after=panel`. No usa la API de login items de Electron (macOS/Windows).
- **Tema**: `nativeTheme.themeSource` sigue la preferencia Sistema/Oscuro/Claro y se sincroniza con `ui-theme` de Harness. El iframe recibe `harness-theme.css` con la misma paleta que la shell y las fuentes Inter locales servidas por el puente.
- **Wayland/X11**: Electron selecciona el backend ozone disponible en la sesión. En Plasma Wayland puede usar Wayland nativo o XWayland según la versión y las variables de entorno; no se fuerza un backend desde DSH_F.

## Datos del usuario

- Preferencias y logs: `~/.config/DeepSeek Harness Fedora/` (o `app.getPath('userData')`).
- Motor: `userData/harness` (`DSH_HOME`) y `userData/agents` (`DSH_AGENTS_HOME`).
- Proyectos recientes: solo rutas; abrir un proyecto no copia ni borra archivos.

## Notificaciones y ciclo de vida

- Notificaciones nativas genéricas de motor listo/error, silenciables desde Ajustes (`notificationsEnabled`). No incluyen rutas, mensajes del motor ni secretos.
- Si la bandeja no está disponible, se degrada a ventana normal y se registra un aviso.
- La guarda de ciclo de vida termina el grupo del motor si el padre muere abruptamente; parada normal con `SIGTERM` y escalada `SIGKILL`.
- Autostart XDG y cierre a bandeja siguen siendo preferencias explícitas.

## Publicación verificable

CI genera `SHA256SUMS` junto al RPM y lo verifica antes de subir artefactos/release:

```bash
sha256sum -c SHA256SUMS
sudo dnf install -y ./dsh-fedora-0.1.0-x86_64.rpm
```

La decisión de distribución está en [ADR 0001](adr/0001-distribucion-rpm.md): GitHub Releases primero; COPR/repositorio propio solo después de cuentas, firma y matriz Fedora real. La firma criptográfica de artefactos sigue pendiente de claves fuera del repo y revisión humana.

## Upgrade y rollback

Checklist mínimo antes de marcar una actualización RPM como segura:

1. Instalar la versión anterior y crear datos/proyectos de prueba.
2. Anotar `userData`, `DSH_HOME` y rutas de proyectos.
3. Instalar el RPM nuevo sin borrar `~/.config/DeepSeek Harness Fedora/`.
4. Verificar preferencias, proyectos recientes, sesiones y credenciales oficiales.
5. Si falla, reinstalar la versión anterior y restaurar backup de preferencias si procede.

No se borran proyectos del usuario al quitar/instalar el RPM. La validación real está en [FEDORA-MATRIX.md](FEDORA-MATRIX.md).

## Verificación pendiente en hardware real

Este repositorio se desarrolló en un contenedor Debian sin KDE. Lo verificable aquí (motor real, puente, UI, E2E Chromium, empaquetado CI) está cubierto por tests. La bandeja Plasma, decoraciones Wayland, instalación RPM y comportamiento de suspensión/hibernación deben validarse en una máquina Fedora/Plasma real antes de distribuir a usuarios finales.
