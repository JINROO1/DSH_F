# Architecture Decision Records

Cada ADR registra contexto, alternativas, decisión y consecuencias. No sustituye al [ROADMAP](../ROADMAP.md); explica por qué se tomó una decisión estructural.

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-distribucion-rpm.md) | Distribución RPM verificable | Aceptado; COPR posterior, firma bloqueada |
| [0002](0002-permisos-proyecto.md) | Permisos por proyecto: workspace-write inicial | Aceptado |
| [0003](0003-llavero-sistema.md) | Llavero del sistema: no migrar credenciales todavía | Investigación cerrada; integración aplazada |
| [0004](0004-arquitectura-shell.md) | Shell Electron + motor oficial hijo + puente autenticado | Aceptado |

## Añadir un ADR

1. Copia el formato: contexto, alternativas, decisión, consecuencias.
2. Numera correlativamente y enlázalo aquí.
3. Si cambia seguridad/distribución, exige revisión humana y actualización de ROADMAP/release checklist.
