# Cadena de suministro

Fase 5 del [roadmap](ROADMAP.md).

## SBOM

```bash
npm run sbom
```

- Genera `release/sbom.json` desde `package-lock.json` y `runtime/package-lock.json`.
- Objetivo de distribución: `linux-x64-glibc`; excluye paquetes opcionales de otros SO/CPU/libc.
- Incluye nombre, versión, purl, resolved/integrity y hash SHA-256 de los lockfiles.
- No usa red ni instala dependencias; las versiones deben coincidir con los lockfiles fijados.
- CI lo genera después de empaquetar y lo sube como artefacto/release.

## Licencias

```bash
npm run licenses
npm run licenses -- --strict
```

- Genera `release/LICENSES.json` para dependencias de producción del objetivo `linux-x64-glibc`.
- Usa licencia declarada en package.json/lockfile o archivo LICENSE/COPYING instalado.
- `--strict` falla si queda evidencia `DESCONOCIDA`; CI lo ejecuta antes de publicar artefactos.
- En el entorno actual: 677 componentes objetivo, 0 sin evidencia. Esto no sustituye revisión legal humana.

## Firma y procedencia

- CI genera y verifica `SHA256SUMS` del RPM.
- La firma criptográfica (GPG/sigstore) sigue bloqueada: requiere claves fuera del repo, decisión de distribución y proceso de rotación/revocación.
- No se publican releases si `qualify:runtime`, smoke Electron, instalación Fedora CI, licencias estrictas o revisión humana fallan.
- Decisión de repositorio: [ADR 0001](adr/0001-distribucion-rpm.md).

## Permisos y llavero

- [ADR 0002](adr/0002-permisos-proyecto.md): mantener `workspace-write` inicial; no sandbox completo; no full-access desde la shell.
- [ADR 0003](adr/0003-llavero-sistema.md): no migrar credenciales al llavero hasta soporte upstream/prototipo separado.

## Fronteras revisadas

- IPC: comandos Zod estrictos; `updates:check` sin payload/URL arbitraria; orígenes de frame validados.
- Red: puente loopback autenticado; comprobación de actualizaciones solo explícita y con hosts fijos.
- Navegación/descargas: ventanas emergentes denegadas salvo destinos HTTPS permitidos; descargas solo del origen del puente.
- Secretos: token de arranque no persistido; logs/diagnóstico redactados; notificaciones genéricas sin mensajes del motor.
- Preferencias: atómicas `0600`, backup y recuperación; claves desconocidas rechazadas.
- Auditoría: `npm audit --omit=dev` en raíz/runtime dentro de `qualify:runtime`.

## Revisión pendiente

- Firma de artefactos y rotación/revocación de claves.
- Revisión legal de licencias reportadas.
- Matriz Fedora/Plasma real y upgrade RPM.
