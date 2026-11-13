# Checklist de release

Una persona debe poder publicar siguiendo solo el repo. No publicar si CI no está verde o falta revisión humana. La firma criptográfica sigue bloqueada hasta claves fuera del repo y proceso de rotación/revocación.

## 0. Preconditions

- [ ] Cambio revisado por humano; PR pequeño y aprobado.
- [ ] CI verde en el commit exacto que se va a etiquetar.
- [ ] Versión en `package.json` coincide con el tag `vX.Y.Z`.
- [ ] Motor upstream fijado en `runtime/upstream.json` y cualificado; no hay actualización upstream mezclada con UI/refactor.
- [ ] Bloqueos externos conocidos documentados: Fedora/Plasma real, upgrade RPM, firma, COPR.
- [ ] Sin secretos en Git, issues, notas ni artefactos.

## 1. Cualificación local

```bash
npm ci
npm --prefix runtime ci
npm run qualify:runtime
xvfb-run -a npm run test:electron
npm run package:fedora
cd release
sha256sum *.rpm > SHA256SUMS
sha256sum -c SHA256SUMS
cd ..
npm run sbom
npm run licenses -- --strict
rpm -qpiv release/*.rpm
rpm -qpR release/*.rpm
```

- [ ] `qualify:runtime` vigente para los CSS/lockfiles/upstream actuales.
- [ ] Auditoría 0 vulnerabilidades o riesgo aceptado por escrito.
- [ ] Smoke Electron OK.
- [ ] RPM generado; `SHA256SUMS` verificado.
- [ ] `sbom.json` y `LICENSES.json` generados; licencias desconocidas = 0 o revisión legal escrita.
- [ ] Metadatos/dependencias RPM revisados.

## 2. CI obligatorio

El workflow `.github/workflows/ci.yml` debe pasar:

- [ ] `verify`: qualify, smoke Electron, RPM, checksums, SBOM, licencias estrictas, metadatos RPM.
- [ ] `fedora-install`: instalación en `fedora:latest`, `desktop-file-validate`, ejecutable y `ldd` sin `not found`.
- [ ] Artefacto `dsh-fedora-rpm` contiene RPM, `SHA256SUMS`, `sbom.json`, `LICENSES.json`.

## 3. Notas de release

Incluye:

- Versión DSH_F y versión upstream Harness.
- Cambios por fase/subfase del ROADMAP.
- Auditoría/cualificación: comandos y resultado.
- Checksums SHA-256 y enlace a `SHA256SUMS`.
- SBOM y reporte de licencias.
- Bloqueos conocidos: firma, Fedora/Plasma real, upgrade RPM, COPR.
- Instrucciones de instalación/upgrade/rollback de [FEDORA.md](FEDORA.md).
- Aviso de edición comunitaria no afiliada a DeepSeek.

## 4. Publicación

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

- [ ] El job `release` solo corre si `verify` y `fedora-install` pasaron.
- [ ] Assets publicados: RPM, `SHA256SUMS`, `sbom.json`, `LICENSES.json`.
- [ ] No se publica manualmente si CI no está verde.
- [ ] No se afirma firma criptográfica mientras siga bloqueada.

## 5. Post-release

- [ ] Instalar RPM en Fedora/Plasma real y completar [FEDORA-MATRIX.md](FEDORA-MATRIX.md).
- [ ] Probar upgrade/rollback según [FEDORA.md](FEDORA.md).
- [ ] Registrar incidencias upstream sin parchear el paquete oficial.
- [ ] Actualizar ROADMAP y [TRIAGE.md](TRIAGE.md).
- [ ] Si aparece vulnerabilidad, seguir [SECURITY.md](SECURITY.md) y aviso privado.

## Rollback rápido

```bash
sudo dnf downgrade dsh-fedora
# o reinstalar el RPM anterior conservado
sudo dnf install -y ./dsh-fedora-VERSION_ANTERIOR-x86_64.rpm
```

Las sesiones/proyectos del usuario no deben borrarse. Si el motor no arranca, exportar diagnóstico y revisar `docs/ONBOARDING.md`/`docs/SECURITY.md`.
