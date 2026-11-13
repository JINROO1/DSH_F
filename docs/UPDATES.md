# Actualizaciones manuales asistidas

Fase 3 del [roadmap](ROADMAP.md). No hay auto-update silencioso del motor ni de la shell.

## Qué hace

- Consulta solo bajo acción explícita: botón **Comprobación manual** en Ajustes o CLI `npm run updates:check`.
- Distingue **DSH_F** (release GitHub) y **motor DeepSeek Harness** (tags npm).
- Respuesta tipada con versión actual, disponible exacta más nueva, fecha, fuente, tags y error controlado.
- No descarga, no instala, no ejecuta comandos desde el renderer y no modifica `runtime/upstream.json`.
- Timeout de 8 segundos por consulta; fallos de red/404/JSON inválido se muestran como error sin romper la app.

## Privacidad y frecuencia

- Sin comprobación en segundo plano por defecto.
- Hosts consultados: `api.github.com` y `registry.npmjs.org`.
- Sin tokens, cookies ni identificadores de usuario; User-Agent genérico `DSH-F-update-check`.
- La vista previa usa el mismo comando Node para evitar exponer red exterior al renderer. En E2E se fuerza `DSH_UPDATE_CHECK_OFFLINE=1` para probar el camino de error sin depender de Internet.

## CLI

```bash
npm run updates:check
npm run updates:check -- --json
```

El script construye la capa local (`dist/`) y luego consulta. No cambia pines ni lockfiles. Si hay una versión nueva, la salida recuerda el flujo manual:

```bash
npm run upstream:prepare -- --version <x.y.z> --commit <sha>
npm --prefix runtime ci
npm run qualify:runtime
npm run package:fedora
```

## Criterio de versión

- Solo versiones exactas `x.y.z[-prerelease]`.
- No se usa `latest` a ciegas: se inspeccionan tags publicados (`latest`, `next`) y solo se propone una versión exacta mayor que la fijada.
- Las prereleases requieren revisión humana del commit/release antes de preparar la actualización.

## Pruebas

- Unitarias: semver/prerelease, tags mayores/menores, 404, JSON inválido, tag inválido y timeout.
- E2E: botón explícito, resultado no modal, tolerancia a falta de red y sin navegación fuera de la app.
- CLI real en este entorno (2026-11-13): npm devolvió `alpha=0.2.2-alpha.3`, `next=0.2.2-rc.2`, `latest=0.2.2-rc.1`; la consulta GitHub falló por red y se reportó como error controlado. No se marcó ninguna actualización ni se cambió el pin.

## Límites

- No se publicó ninguna release ni se firmó ningún artefacto en esta fase.
- La comprobación no sustituye `qualify:runtime`, revisión humana ni CI verde.
