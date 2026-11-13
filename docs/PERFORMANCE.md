# Rendimiento de recursos

Fase 6.6 del [roadmap](ROADMAP.md). Medir antes de optimizar.

## Comando

```bash
npm run measure:performance -- --runs 3
```

Opciones: `--runs` (1–10), `--port` (por defecto 3210), `--out`.

El script:

1. Construye la shell.
2. Arranca la vista previa aislada con el motor Harness real.
3. Espera `/__desktop/health` listo.
4. Abre Chromium, carga la shell, entra en Agente y espera el iframe visible.
5. Exige al menos un WebSocket de Harness; no registra URLs/tickets.
6. Mide tiempo de motor listo, iframe visible, DOMContentLoaded, heap JS del renderer y RSS del árbol de procesos vía `/proc`.
7. Cierra navegador y vista previa limpiamente.

No aplica optimizaciones. Sirve como línea base para comparar cambios futuros de iframe/runtime sin romper sesión WebSocket.

## Línea base 2026-11-12

Archivo: [`performance/baseline-2026-11-12.json`](performance/baseline-2026-11-12.json).

| Métrica | Mediana (3 runs) |
|---|---:|
| Motor listo | 4553 ms |
| Iframe visible | 2293 ms |
| DOMContentLoaded shell | 128 ms |
| Heap renderer | 55 720 495 bytes |
| RSS árbol de procesos | 644 456 KiB |
| WebSockets por run | 1 |

Runs individuales:

| Run | Motor listo | Iframe visible | DCL | Heap bytes | RSS KiB | WS |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 4577 ms | 2293 ms | 127 ms | 55 961 993 | 644 456 | 1 |
| 2 | 4297 ms | 2253 ms | 128 ms | 55 474 772 | 643 072 | 1 |
| 3 | 4553 ms | 2311 ms | 133 ms | 55 720 495 | 658 776 | 1 |

## Límites

- Entorno: vista previa Linux x64 glibc + Chromium de Playwright, no RPM nativo en Fedora/Plasma.
- RSS incluye servidor de vista previa, Chromium y árbol del motor; no es memoria solo de la shell.
- La métrica de heap depende de `performance.memory` en Chromium.
- Cualquier optimización debe repetir el mismo comando, adjuntar nuevo JSON y demostrar mejora sin perder WebSocket/sesión/tema.
