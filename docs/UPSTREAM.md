# Investigación del upstream

Fecha de investigación: 2026-11-12.

## Fuente oficial

- Repositorio: https://github.com/deepseek-ai/deepseek-harness
- Licencia: MIT.
- Release estudiada: `dsh-v0.2.2-rc.2` (prerelease, sin assets binarios en la release consultada).
- Commit del clon shallow de estudio: `ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c`.
- Paquete npm fijado: `@deepseek-ai/dsh@0.2.2-rc.2`.
- Node requerido por el motor: `>=24.9.0`. DSH_F incluye `node-linux-x64@24.22.3` para no depender del Node del sistema.

## Hallazgos relevantes

1. El monorepo contiene `apps/cli`, `apps/desktop`, `apps/desktop-host`, `apps/web`, `packages/`, `native/` y `docs/`.
2. El escritorio upstream (`apps/desktop` + `apps/desktop-host`) usa un protocolo shell↔host y empaquetado orientado a macOS/Windows; no publica target Linux en la release estudiada.
3. El perfil `web` del CLI publicado arranca el servidor loopback y la UI oficial sin necesidad del monorepo:
   `dsh web --no-open --host 127.0.0.1 --port 0`.
4. La URL de arranque imprime un token de un solo uso (`?token=…`, 43 caracteres). El servidor responde 303 y fija cookie `dsh-auth-<sha256(authority)>` con `HttpOnly` y `SameSite=Strict`.
5. La API RPC usa `POST /api/<namespace>/<method>` con envelope
   `{ type: 'client-request', rpcId, method, payload: { args } }` y respuesta
   `{ type: 'server-response', result: { ok, value | error } }`.
6. El servidor valida `Host` loopback/bind/trustedHosts y `Origin` same-origin. No envía `X-Frame-Options` ni `frame-ancestors`, por lo que DSH_F puede integrar la UI en un iframe autenticado mediante un puente propio.
7. Los ajustes persistentes se exponen por `settings/update { ns, patch, expectedRevision? }`. Namespaces usados: `locale` (`preference`) y `ui-theme` (`preference`). En la release estudiada `locale.preference` admite `zh`/`en`; DSH_F mantiene la shell en español y sincroniza el motor con `en` hasta que upstream publique `es`.
8. Workspaces: `workspace/create { request: { path } }`. Sesiones: `session/create { request: { workspaceId | cwd, sessionId?, agentPreset? } }` y `session/list { _request: {} }`.
9. `DSH_HOME` y `DSH_AGENTS_HOME` permiten aislar credenciales, storages y sesiones por instalación.
10. `DSH_PERMISSION_MODE` admite `workspace-write` (default), `read-only` y `danger-full-access`. DSH_F fuerza el modo inicial `workspace-write`.

## Decisión de arquitectura

DSH_F no reescribe ni parchea el motor oficial. Lo ejecuta como proceso hijo aislado con su propio runtime Node, conserva sus perfiles/plugins y añade:

- ventana Electron sandboxed para Fedora/KDE;
- puente loopback autenticado que oculta el token upstream;
- shell premium en español con proyectos recientes, ajustes y diagnóstico;
- empaquetado RPM y CI Fedora.

Esto mantiene la compatibilidad con el ecosistema Harness y reduce el riesgo de divergencia frente al upstream.

## Versiones y Overrides de seguridad

El árbol del motor se fija en `runtime/package-lock.json`. Se aplican overrides mínimos para advisories publicados:

- `undici` → `8.12.4`
- `fflate` → `0.8.3`
- `@modelcontextprotocol/client` → `2.3.1`

`npm audit --omit=dev` queda en 0 vulnerabilidades en la raíz y en el runtime tras los overrides. Las pruebas de integración arrancan el motor real con estos overrides.
