# ADR 0001 — Distribución RPM: GitHub Releases primero, COPR después

Estado: aceptado para la fase actual; publicación en repositorio de paquetes pendiente de decisión/cuentas del mantenedor.

## Contexto

DSH_F construye un RPM x64 en CI y lo instala en `fedora:latest`. Se necesita una vía actualizable y verificable sin publicar un repositorio experimental como estable.

## Opciones

1. **GitHub Releases + RPM/SHA256SUMS**
   - Coste: bajo; ya existe CI y release por tag.
   - Firma: checksums ahora; firma GPG/sigstore pendiente de claves y revisión humana.
   - Mantenimiento: manual; el usuario descarga/instala o usa `dnf install ./rpm`.
   - Riesgo: sin repositorio yum/dnf automático; mitigado con checksums y guía de upgrade/rollback.

2. **COPR**
   - Coste: cuenta Fedora/COPR, builds y revisión de políticas.
   - Firma: COPR firma repositorios; requiere gestionar proyecto y claves de maintainer.
   - Mantenimiento: mejor experiencia `dnf install/update`, pero obliga a soportar versiones Fedora y ciclo de builds.
   - Riesgo: publicar paquetes experimentales como estables; no hacerlo hasta cualificación y revisión.

3. **Repositorio propio**
   - Coste: hosting, metadatos `repomd`, firma, rotación/revocación, monitorización.
   - Mantenimiento: alto; no justificado para la fase inicial.

## Decisión

- Distribución inicial: **GitHub Releases** con RPM y `SHA256SUMS` generados/verificados en CI.
- No publicar repositorio yum/dnf propio ni COPR estable todavía.
- COPR es el siguiente candidato cuando el mantenedor tenga cuenta Fedora, proceso de firma y matriz Fedora real verde.
- Ninguna publicación se hace si `qualify:runtime`, smoke Electron, instalación Fedora CI o revisión humana fallan.

## Consecuencias

- La app no promete auto-update; Fase 3 solo comprueba versiones manualmente.
- Upgrade/rollback se documenta en `docs/FEDORA.md` y se valida en la matriz real.
- Firma criptográfica de artefactos sigue bloqueada hasta que existan claves fuera del repo y proceso de rotación/revocación.
