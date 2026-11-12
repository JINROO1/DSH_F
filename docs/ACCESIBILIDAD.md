# Accesibilidad de la shell Fedora

Estado: **Fase 1 automatizada completa; revisión manual externa pendiente**.

Fecha de la evidencia: 2026-11-12. Motor oficial: `0.2.2-rc.2`. Herramientas: Playwright `1.56.1`, `@axe-core/playwright`/axe-core `4.14.0`, Chromium headless y Vitest `3.2.4`.

Este documento registra la línea base, los cambios y los límites de la Fase 1 del [roadmap](ROADMAP.md). No es una declaración de conformidad WCAG completa.

## Alcance

Incluido:

- Shell DSH_F: portada, proyectos, ajustes, diagnóstico y avisos.
- Diálogos propios: paleta de comandos y apertura de carpeta de demostración.
- Tokens de tema compartidos con el agente oficial.
- Teclado, foco visible, preferencia de sistema y movimiento reducido.
- Carga de fuentes locales y paridad visual shell/agente.

Excluido de la matriz axe:

- El contenido interno del iframe de DeepSeek Harness. Es una superficie upstream separada; no se parchea su paquete ni se desactivan reglas para ocultar hallazgos. La paridad de tokens/fuentes sí se prueba con el iframe real.
- Lector de pantalla, zoom 200 %, alto contraste forzado y Fedora/KDE Plasma real. Eso corresponde a la subfase 1.8 y sigue bloqueado hasta disponer de ese entorno.

No se desactivó `color-contrast` ni ninguna otra regla axe. La matriz excluye únicamente el selector `iframe`.

## Línea base antes de cambiar colores

Auditoría real sobre la vista previa, con motor listo, fuentes cargadas, animaciones finitas terminadas y ratón fuera de los elementos auditados. Resultado bruto conservado en [accessibility/baseline-2026-11-12.json](accessibility/baseline-2026-11-12.json).

| Escenario | Claro: violaciones | Oscuro: violaciones |
|---|---:|---:|
| Inicio | 6 | 0 |
| Proyectos | 6 | 0 |
| Ajustes | 6 | 0 |
| Diagnóstico | 6 | 0 |
| Paleta de comandos | 1 | 0 |
| Diálogo de proyecto | 0 | 0 |

Hallazgos claros repetidos:

| Elemento | Ratio observado | Esperado |
|---|---:|---:|
| `.edition`, `.sidebar-section`, `.sidebar-version` | 4.39:1 | 4.5:1 |
| Navegación activa sobre fondo suave | 3.85:1 | 4.5:1 |
| Aviso de vista previa | 4.08:1 | 4.5:1 |
| Opción activa de la paleta | 4.31:1 | 4.5:1 |

Además, axe marcó como incompletos:

- Contraste sobre gradientes: tarjeta local, avatar, titular de portada y tarjetas de acción.
- Contraste de `kbd` en la paleta.
- `aria-prohibited-attr` en el `pre` desplazable de Diagnóstico, en ambos temas.

Los gradientes y `kbd` no se ignoraron: se añadieron comprobaciones numéricas de extremos y puntos intermedios. El `pre` recibió un rol válido con nombre accesible.

## Cambios aplicados

### Paleta clara

Se ajustaron texto secundario, acento, semánticos y fondos suaves en `src/renderer/styles.css`, incluyendo la variante `prefers-color-scheme: light`. Los mismos valores se espejaron en `src/renderer/harness-theme.css` para el agente oficial.

Tokens nuevos de shell para evitar colores hardcodeados divergentes:

- `--accent-hover`
- `--on-accent`
- `--danger-soft`
- `--hero-accent-mid`

El tema oscuro conservó sus colores anteriores. Solo se nombraron tokens que antes estaban hardcodeados y se normalizó `#ffffff` a `#fff` para mantener paridad textual exacta.

Comprobación unitaria: todos los pares de tokens de texto/superficie usan el umbral exacto `>= 4.5`, sin redondear a dos decimales.

| Medición | Claro | Oscuro |
|---|---:|---:|
| Mínimo texto/superficie entre tokens comprobados | 4.61:1 | 4.59:1 |
| Texto tenue sobre barra lateral | 5.04:1 | 6.28:1 |
| Navegación activa clara / opción de paleta | 5.08:1 / 5.72:1 | 7.22:1 / 6.32:1 |
| Texto sobre botón primario | 6.64:1 | 4.70:1 |
| Texto sobre hover primario | 7.49:1 | 4.53:1 |

Los gradientes se muestrean en cada segmento en `0`, `0.25`, `0.5`, `0.75` y `1`. La tarjeta local compone el extremo transparente sobre la barra lateral; el titular claro ya no usa un azul claro de bajo contraste como parada intermedia.

### Teclado y semántica

- El skip link enfoca `#main-content` sin navegar fuera de la vista previa.
- La paleta usa `combobox` + `listbox`, `aria-activedescendant` y opciones no tabulables; las flechas mantienen el foco en el campo.
- Escape cierra paleta/diálogo y devuelve el foco al control que los abrió.
- El registro de Diagnóstico es `pre role="region"` con nombre accesible y `tabIndex=0`.
- Se mantienen foco visible, `prefers-reduced-motion` y el interruptor de movimiento reducido.
- La preferencia `system` se prueba en claro y oscuro; la paleta clara de sistema debe ser idéntica a la explícita.

## Matriz automatizada después del cambio

`tests/e2e/accessibility.spec.ts` ejecuta 12 auditorías axe: 6 escenarios × 2 temas. Cada una exige `violations = []` y ausencia de `aria-prohibited-attr` en los resultados incompletos. Las reglas de contraste incompletas por gradientes/`kbd` se cubren en `tests/unit/theme-contrast.test.ts`.

| Escenario | Claro | Oscuro |
|---|---:|---:|
| Inicio | 0 violaciones | 0 violaciones |
| Proyectos | 0 violaciones | 0 violaciones |
| Ajustes | 0 violaciones | 0 violaciones |
| Diagnóstico | 0 violaciones | 0 violaciones |
| Paleta de comandos | 0 violaciones | 0 violaciones |
| Diálogo de proyecto | 0 violaciones | 0 violaciones |

Pruebas adicionales:

- 20 pruebas unitarias de contraste WCAG.
- Paridad shell/agente ampliada a hover primario y texto sobre color.
- Paridad entre selector claro explícito y preferencia de sistema.
- E2E de skip link, foco visible, flechas/Escape en paleta, retorno de foco en diálogo, sistema claro/oscuro, movimiento reducido y región de logs.

## Evidencia visual

Capturas reales recapturadas por ruta UI, sin modal de primera ejecución ni toast de preferencias:

- [Inicio claro](screenshots/home-light.png)
- [Agente claro](screenshots/agent-light.png)
- [Agente oscuro](screenshots/agent.png)

Originales en `capturas/06-inicio-claro.png`, `capturas/07-agente-claro.png` y `capturas/03-agente-harness.png`.

## Cualificación

`npm run qualify:runtime` terminó correctamente el 2026-11-12 a las 23:07:59 UTC con los CSS nuevos:

- Auditoría raíz/runtime: 0 vulnerabilidades y 0 vulnerabilidades.
- Typecheck: correcto.
- Unitarias: 90/90.
- Cobertura: statements 98.36 %, branches 86.47 %, functions 98.30 %, lines 98.36 %.
- Build: correcto.
- Integración motor real: 3/3.
- E2E: 22/22, incluidas las 12 auditorías axe claro/oscuro.

El artefacto local vigente es `.packaging/qualification.json`. Es local/ignorado por Git; esta página y el CI son la evidencia durable. Si cambian `styles.css` o `harness-theme.css`, hay que repetir la cualificación antes de empaquetar.

## Reproducir

```bash
npm run setup
npm run build
npm run test:e2e
npm run qualify:runtime
```

Para una auditoría manual puntual, abrir la vista previa, esperar `Motor listo`, cambiar el tema desde Ajustes, cerrar el toast, mover el ratón fuera del contenido y ejecutar axe sobre la shell excluyendo solo `iframe`. No ocultar elementos con CSS para obtener un resultado verde.

## Checklist manual pendiente (1.8)

- [ ] Lector de pantalla en Fedora/KDE: nombres, orden de lectura, diálogos y cambios de estado.
- [ ] Zoom 200 % sin pérdida de contenido ni solapamientos bloqueantes.
- [ ] Alto contraste forzado del sistema.
- [ ] Wayland y X11 en Plasma real.
- [ ] Revisión visual de gradientes, foco y estados hover/pressed.
- [ ] Registrar incidencias upstream por separado, sin parchear el paquete oficial.

Mientras esos puntos no estén firmados, no afirmar conformidad WCAG total ni accesibilidad completa del agente upstream.
