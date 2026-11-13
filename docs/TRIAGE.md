# Triaje mensual

Rutina para que el proyecto no dependa del mantenedor original ni de una conversación. Frecuencia: mensual o antes de una release.

## Checklist

1. **Roadmap:** revisar [ROADMAP.md](ROADMAP.md); actualizar estados Hecho/En curso/Bloqueado/Aplazado. Lo aplazado debe tener razón escrita.
2. **Advisories:** `npm run audit:dependencies`. Si hay vulnerabilidades, abrir issue/aviso y decidir override/actualización con ADR si cambia arquitectura.
3. **Upstream:** `npm run updates:check` (solo lectura). Si hay versión exacta nueva, seguir [UPSTREAM.md](UPSTREAM.md)/[UPDATES.md](UPDATES.md); no mezclar con UI.
4. **Bloqueos externos:** Fedora/Plasma real, upgrade RPM, firma criptográfica, COPR, llavero upstream. Confirmar si siguen bloqueados o hay nuevo evidence.
5. **Issues/PRs:** etiquetar bug/mejora/upstream/seguridad; cerrar duplicados; pedir versión/entorno/pasos/evidencia redactada.
6. **Cualificación:** si cambió runtime/CSS/lockfiles, `npm run qualify:runtime` antes de empaquetar.
7. **Registro:** añadir fila abajo y actualizar ROADMAP. Commitear/pushear la rama activa.

## Registro

| Fecha | Hallazgos | Acción | Evidencia |
|---|---|---|---|
| 2026-11-13 | Fases 0–6 completas en lo automatizable; Fase 7 comunidad establecida. Auditoría 0+0. Upstream npm: alpha=0.2.2-alpha.3, next=0.2.2-rc.2, latest=0.2.2-rc.1; GitHub releases no alcanzable desde sandbox (`fetch failed`), sin actualización marcada. | Mantener pin 0.2.2-rc.2. Bloqueos externos siguen abiertos. Cualificación refrescada tras Fase 6. | `qualify:runtime` 2026-11-13T01:00:01.572Z: 110/110 unitarias, 3/3 integración, 30/30 E2E; `updates:check` 2026-11-13T00:56:44.349Z |
| 2026-11-13 | CI GitHub Actions fallaba en cadena: Chromium/Ubuntu 26, puerta de cualificación opaca, rutas de vista previa absolutas, smoke Electron al cerrar, publicación implícita y maintainer RPM ausente. | `ubuntu-24.04` + `--with-deps`; pasos separados y `--record-only` solo en CI; rutas `.preview` relativas; cierre smoke asíncrono; `--publish never`; maintainer Linux noreply. | CI run 43470309423 verde: verify 6m37s, fedora-install 53s; commits `7625bef`…`eac2aa5` |

## Bloqueos vigentes

- **1.8 / 4.1 / 4.4:** Fedora/Plasma real, matriz hardware, upgrade/rollback RPM. Razón: requiere hardware/usuario externo.
- **5.3:** firma criptográfica de artefactos. Razón: claves fuera del repo, decisión de distribución y rotación/revocación.
- **COPR:** descartado por ahora; requiere cuenta Fedora, firma y matriz real. Razón: ADR 0001.
- **Llavero del sistema:** integración aplazada. Razón: ADR 0003; no migrar credenciales upstream a ciegas.
- **UI de permisos avanzada:** aplazada. Razón: ADR 0002; confirmar contrato upstream antes de exponer read-only/full-access.
- **Optimización iframe/runtime:** no aplicada. Razón: Fase 6.6 solo establece línea base; cualquier mejora debe demostrarse sin romper WebSocket/sesión.

## Próxima revisión

Mensual desde 2026-11-13, o antes de etiquetar una release. No publicar releases con CI no verde ni sin revisión humana.
