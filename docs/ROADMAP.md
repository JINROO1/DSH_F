# Roadmap de implementación

Este documento convierte las mejoras propuestas en trabajo verificable. Es la fuente de verdad del plan; la conversación no sustituye a este archivo.

- Punto de partida: commit `74b48ad` (motor `0.2.2-rc.2`, tema unificado, actualización upstream cualificada y guía de mantenimiento).
- Rama de trabajo de esta sesión: `arena/c1de365d-dsh-f`. En Arena se trabaja sobre la rama activa indicada por la sesión; no se crean ramas alternativas.
- Estado actual: **Fases 0–7 completadas en lo automatizable**; los bloqueos externos siguen documentados en cada subfase.
- No hay fechas comprometidas. El orden expresa dependencias y prioridad, no un calendario de publicación.

## Cómo leer y actualizar este plan

Estados:

- **Pendiente**: no comenzado.
- **En curso**: hay trabajo activo; consultar el registro de avance.
- **Bloqueado**: falta una decisión, hardware, servicio o investigación externa.
- **Hecho**: cumple los criterios de aceptación y tiene evidencia en el repo/CI.
- **Aplazado**: decisión explícita documentada de no hacerlo ahora.

Reglas:

1. Una subfase debe poder revisarse y revertirse con claridad.
2. No mezclar una actualización del motor con cambios de UI, seguridad o empaquetado.
3. No marcar Hecho sin pruebas/documentación. Si requiere Fedora real, indicarlo como bloqueo externo.
4. Toda mejora debe mantener el motor oficial sin parchear y sin telemetría obligatoria de esta capa.
5. Los cambios de seguridad/distribución requieren revisión humana aunque el CI esté verde.
6. Al terminar una subfase: actualizar estado/evidencia aquí, ejecutar la validación indicada y commitear/pushear la rama activa.

Tamaños orientativos: **S** = cambio localizado, **M** = varios archivos/pruebas, **L** = investigación o infraestructura. No son horas ni fechas.

## Resumen de fases

| Fase | Objetivo | Prioridad | Estado | Depende de |
|---|---|---|---|---|
| 0 | Plan, mantenimiento y trazabilidad | Alta | Hecho | — |
| 1 | Accesibilidad y confianza visual | Alta | En curso: automatización completa, 1.8 manual bloqueada | 0 |
| 2 | Onboarding y diagnóstico amigable | Alta | Hecho | 1 |
| 3 | Actualizaciones manuales asistidas | Alta | Hecho | 1; flujo upstream existente |
| 4 | Fedora/KDE y distribución profesional | Media/alta | En curso: automatizable hecho; hardware/firma bloqueados | 1–3; hardware Fedora |
| 5 | Seguridad y cadena de suministro | Media/alta | En curso: automatizable hecho; firma bloqueada | 3–4 para distribución firmada |
| 6 | Productividad diaria | Media | Hecho | 2 |
| 7 | Comunidad y sostenibilidad | Continua | Hecho: proceso establecido; triaje mensual recurrente | 0 |

## Fase 0 — Plan y mantenimiento

Objetivo: que una persona principiante o una sesión futura pueda continuar sin depender de memoria de chat.

| ID | Subfase | Trabajo | Criterios de aceptación | Estado |
|---|---|---|---|---|
| 0.1 | Inventario inicial | Confirmar commits, scripts, pruebas y límites actuales | Punto de partida y limitaciones documentados | Hecho |
| 0.2 | Roadmap por fases | Crear este documento con dependencias, riesgos y aceptación | Todas las mejoras propuestas tienen ID y siguiente paso | Hecho |
| 0.3 | Guía del mantenedor | Enlazar roadmap y corregir flujo de ramas para Arena | Guía explica qué hacer si se borra la sesión | Hecho |
| 0.4 | Registro de evidencia | Guardar resultados y decisiones en docs, no solo en terminal | Fase 1 tiene matriz, resultados y límites explícitos | Hecho |

Archivos: `docs/ROADMAP.md`, `docs/MANTENIMIENTO.md`, `README.md`, `docs/ACCESIBILIDAD.md`, `docs/accessibility/baseline-2026-11-12.json`.

## Fase 1 — Accesibilidad y confianza visual

Objetivo: que la shell sea legible y utilizable por teclado en claro, oscuro y sistema, manteniendo la paridad con el agente oficial.

Alcance automatizado: shell DSH_F, diálogos propios, tokens de tema compartidos y carga de fuentes del iframe. La accesibilidad interna completa de la UI upstream se investiga por separado; no se parchea su paquete para silenciar auditorías.

| ID | Subfase | Trabajo | Criterios de aceptación | Validación | Estado |
|---|---|---|---|---|---|
| 1.1 | Línea base axe | Auditar portada, proyectos, ajustes, diagnóstico, paleta y diálogo en claro/oscuro | Hallazgos registrados antes de cambiar colores; sin excluir reglas de contraste | Navegador real + axe | Hecho |
| 1.2 | Paleta accesible | Ajustar texto secundario, acento, semánticos y gradiente claro; conservar oscuro si ya cumple | Pares de texto/fondo ≥ 4.5:1; botones primarios y hover legibles; paridad shell/agente intacta | 20 tests de contraste + paridad; ver [ACCESIBILIDAD](ACCESIBILIDAD.md) | Hecho |
| 1.3 | Matriz axe clara/oscura | Auditar las vistas y diálogos propios en ambos temas | Cero violaciones axe en la matriz; sin desactivar color-contrast | 12/12 auditorías en `npm run test:e2e` | Hecho |
| 1.4 | Teclado, foco y sistema | Cubrir skip link, paleta, Escape, foco visible, movimiento reducido y preferencia sistema | Navegación sin ratón; sistema resuelve claro/oscuro correctamente | E2E de foco, combobox/listbox, sistema y movimiento | Hecho |
| 1.5 | Semántica del registro | Corregir nombre accesible del panel de logs desplazable | La región desplazable tiene rol/nombre válidos; axe no reporta atributo prohibido | E2E diagnóstico + matriz axe | Hecho |
| 1.6 | Evidencia visual | Recapturar agente claro/oscuro y portada clara tras el cambio | Capturas reales limpias, sin diálogos de primera ejecución ni toasts tapando contenido | Inspección visual + capturas/docs enlazadas en [ACCESIBILIDAD](ACCESIBILIDAD.md) | Hecho |
| 1.7 | Cualificación completa | Repetir la puerta de release con los CSS nuevos | Auditoría 0; typecheck/cobertura/build/integración/E2E verdes; cualificación vigente | `qualify:runtime` 2026-11-12 23:07:59 UTC; 90 unit, 3 integración, 22 E2E | Hecho |
| 1.8 | Validación manual externa | Lector de pantalla, zoom 200%, alto contraste y Plasma real | Checklist firmado en Fedora/KDE; incidencias upstream registradas | Hardware/usuario Fedora | Bloqueado: requiere Fedora/Plasma real |

Archivos probables: `src/renderer/styles.css`, `src/renderer/harness-theme.css`, `src/renderer/App.tsx`, `tests/unit/theme-parity.test.ts`, `tests/e2e/`, `docs/ACCESIBILIDAD.md`, capturas.

Riesgos y mitigación:

- Cambiar colores puede romper paridad: mantener test de tokens y E2E de colores computados.
- axe no calcula todos los gradientes: añadir comprobación unitaria de extremos/puntos de gradiente y revisión visual.
- Un iframe upstream puede tener problemas propios: no ocultarlos ni atribuirlos a la shell; documentar alcance.
- Verde en Chromium no equivale a conformidad WCAG completa: mantener 1.8 pendiente hasta revisión manual.

## Fase 2 — Onboarding y diagnóstico amigable

Objetivo: que un usuario nuevo entienda el primer uso y pueda recuperarse de errores sin leer código.

| ID | Subfase | Trabajo | Criterios de aceptación | Tamaño | Estado |
|---|---|---|---|---|---|
| 2.1 | Primera ejecución | Tarjeta/guía descartable: motor, proyecto, modelo y permisos | Se puede descartar y reabrir; no bloquea usuarios existentes; preferencia persistida | M | Hecho |
| 2.2 | Credenciales oficiales | Explicar y enlazar el flujo oficial de cuenta/API key | La shell no pide ni almacena API keys; no se inventan endpoints de login | S | Hecho |
| 2.3 | Permisos comprensibles | Explicar workspace-write y límites antes de abrir/ejecutar | Texto claro es/en; no promete aislamiento que el motor no ofrece | S | Hecho |
| 2.4 | Estado y errores del motor | Mostrar fase, último error, attempts y acciones de recuperación | Mensajes accionables; reinicio no pierde datos; errores no contienen secretos | M | Hecho |
| 2.5 | Logs utilizables | Filtro por texto/nivel, copia segura y vacío/explicación de errores | Copia/exportación siguen redactadas; filtro no altera el archivo; teclado accesible | M | Hecho |
| 2.6 | Pruebas de recuperación | Simular motor ausente, fallo de arranque, reinicio y exportación | Tests unitarios/E2E cubren éxito/error; no se requieren credenciales reales | M | Hecho |

Dependencias: Fase 1 para que los nuevos componentes nazcan accesibles. No depende de una actualización upstream.

 Fuera de alcance: pedir claves en formularios propios, telemetría obligatoria o exponer APIs nativas nuevas sin contrato Zod.

## Fase 3 — Actualizaciones manuales asistidas

Objetivo: descubrir versiones nuevas sin instalar nada automáticamente.

| ID | Subfase | Trabajo | Criterios de aceptación | Tamaño | Estado |
|---|---|---|---|---|---|
| 3.1 | Contrato de comprobación | Diseñar respuesta tipada para versión actual/disponible/error/fecha | Sin tokens; timeout; fallos de red no rompen la app; sin ejecución de comandos desde renderer | M | Hecho |
| 3.2 | Comprobación manual CLI | Script que consulte release de DSH_F y versión/tag oficial del motor | Solo lectura; distingue app/motor; no usa latest a ciegas; salida comprensible | S | Hecho |
| 3.3 | Aviso en la app | Botón “Comprobar actualizaciones” y resultado no modal | No descarga/instala; enlace HTTPS verificado; ofrece comandos/documentación | M | Hecho |
| 3.4 | Privacidad y frecuencia | Sin comprobación en segundo plano por defecto | La acción es explícita; documentar qué hosts se consultan; sin identificadores de usuario | S | Hecho |
| 3.5 | Pruebas offline/errores | Simular respuesta válida, 404, timeout, JSON inválido y versión menor | E2E/unitarios verdes; nunca se modifica el pin desde la UI | M | Hecho |
| 3.6 | Guía de actualización | Conectar aviso con upstream:prepare → ci → qualify → package | Documentación coincide con scripts reales; no promete auto-update | S | Hecho |

Dependencias: flujo `runtime/upstream.json` y `qualify:runtime` ya existentes. La UI nunca debe saltarse la puerta de empaquetado.

## Fase 4 — Fedora/KDE y distribución profesional

Objetivo: pasar de “RPM construido” a “RPM actualizable y verificable en Fedora real”.

| ID | Subfase | Trabajo | Criterios de aceptación | Tamaño | Estado |
|---|---|---|---|---|---|
| 4.1 | Matriz Fedora real | Probar Fedora vigente en Wayland/X11 y Plasma | Resultados con versión, sesión gráfica, hardware y fallos conocidos | L | Bloqueado: hardware Fedora/Plasma real; plantilla en `docs/FEDORA-MATRIX.md` |
| 4.2 | Bandeja y ciclo de vida | Validar StatusNotifier, cerrar a bandeja, autostart y suspensión | Sin procesos huérfanos; preferencias respetadas; degradación si no hay bandeja | M | En curso: código/tests automáticos hechos; validación Plasma/suspensión en 4.1 |
| 4.3 | Notificaciones nativas | Motor listo/error y avisos opcionales | Se pueden silenciar; no filtran rutas/secretos; funcionan sin telemetry | M | Hecho: preferencia, avisos genéricos y tests; validación nativa en 4.1 |
| 4.4 | Actualización RPM | Instalar versión anterior, crear datos, instalar nueva | Conserva userData/DSH_HOME/proyectos; rollback documentado | M | Bloqueado: requiere RPM previo/Fedora real; checklist en `docs/FEDORA.md` |
| 4.5 | Repositorio de paquetes | Investigar COPR vs repo propio | ADR con costes, firmas, mantenimiento y decisión; no publicar repo experimental como estable | L | Hecho: ADR 0001; publicación/COPR pendiente de cuentas y firma |
| 4.6 | Publicación verificable | Checksums, instrucciones de verificación y proceso de firma | Release reproducible en CI; claves fuera del repo; documentación de rotación/revocación | L | En curso: SHA256SUMS en CI y verificación documentada; firma bloqueada |

Bloqueo externo: hardware Fedora/Plasma y decisiones/cuentas de distribución. No marcar Hecho solo porque un contenedor Fedora instaló el RPM.

## Fase 5 — Seguridad y cadena de suministro

Objetivo: hacer verificable qué se distribuye y reducir exposición de credenciales/permisos.

| ID | Subfase | Trabajo | Criterios de aceptación | Tamaño | Estado |
|---|---|---|---|---|---|
| 5.1 | SBOM | Generar inventario de dependencias del runtime/app en CI | Artefacto por release; versiones coinciden con lockfiles; herramienta fijada | M | Hecho |
| 5.2 | Licencias | Revisar avisos de terceros y generar reporte | Licencias compatibles conservadas; faltantes bloquean revisión de release | M | Hecho: reporte `--strict` con 0 faltantes objetivo; revisión legal humana pendiente |
| 5.3 | Firma y procedencia | Firmar artefactos/metadatos según decisión 4.5 | Verificación documentada; secretos solo en almacén CI; sin claves en Git | L | Bloqueado: checksums hechos; firma requiere claves/decisión externa |
| 5.4 | Permisos por proyecto | Investigar contrato upstream read-only/workspace-write | ADR antes de UI; no falsa sensación de sandbox; pruebas de contrato | L | Hecho: ADR 0002; sin UI de permisos avanzada |
| 5.5 | Llavero del sistema | Investigar KDE Wallet/libsecret sin parchear motor | Prototipo separado; decidir si upstream lo soporta; no migrar credenciales a ciegas | L | Hecho: ADR 0003; integración aplazada hasta soporte upstream |
| 5.6 | Revisión de fronteras | Repasar IPC, cookies, navegación, descargas y fuentes locales | Tests de abuso; modelo de amenazas actualizado; auditoría 0 o riesgo aceptado por escrito | M | Hecho |

No hacer todavía: fork profundo del motor, marketplace de plugins no oficiales ni acceso completo por defecto.

## Fase 6 — Productividad diaria

Objetivo: reducir fricción sin convertir la shell en otro motor de agentes.

| ID | Subfase | Trabajo | Criterios de aceptación | Tamaño | Estado |
|---|---|---|---|---|---|
| 6.1 | Paleta de comandos | Añadir acciones existentes: tema, proyecto, diagnóstico, reinicio | Teclado completo; acciones pasan por API actual; sin shell exec arbitrario | S | Hecho |
| 6.2 | Proyectos recientes | Favoritos, alias, detectar rutas inexistentes y limpiar rotos | No borra archivos del usuario; migración de preferencias compatible | M | Hecho |
| 6.3 | Plantillas locales | Crear carpetas mínimas vacía/Node/Python/docs/scripts | Selección explícita de destino; no sobrescribe archivos; no ejecuta instalaciones | M | Hecho |
| 6.4 | Backup de preferencias | Exportar/importar solo configuración no sensible | Excluye credenciales/tokens; valida esquema; preview antes de aplicar; backup previo | M | Hecho |
| 6.5 | Idiomas y textos | Revisión es/en y mensajes truncados | Claves sincronizadas; E2E de idioma; sin strings hardcodeados nuevos | S | Hecho |
| 6.6 | Rendimiento de recursos | Medir arranque/memoria antes de optimizar iframe/runtime | Métricas repetibles; no romper sesión WebSocket; mejora demostrada | M | Hecho: línea base repetible; sin optimización aplicada todavía |

## Fase 7 — Comunidad y sostenibilidad

Objetivo: que otra persona pueda contribuir sin depender del mantenedor original.

| ID | Subfase | Trabajo | Criterios de aceptación | Tamaño | Estado |
|---|---|---|---|---|---|
| 7.1 | CONTRIBUTING | Guía de entorno, pruebas, estilo y PR pequeños | Un colaborador nuevo puede ejecutar check desde cero | S | Hecho |
| 7.2 | Plantillas de issues/PR | Bug, mejora, actualización upstream y seguridad | Piden versión, entorno, pasos y evidencia; sin secretos | S | Hecho |
| 7.3 | ADRs | Registrar decisiones de arquitectura/distribución/seguridad | Cada decisión tiene contexto, alternativas y consecuencias | S | Hecho |
| 7.4 | Checklist de release | Unificar cualificación, CI, RPM, notas y rollback | Una persona puede publicar siguiendo solo el repo | M | Hecho |
| 7.5 | Triaje mensual | Revisar roadmap, advisories, upstream y bloqueos | Estados actualizados; lo aplazado tiene razón escrita | S | Hecho: proceso establecido y triaje inicial registrado |

## Registro de avance

| Fecha | Fase | Cambio | Evidencia |
|---|---|---|---|
| 2026-11-12 | 0 | Plan por fases/subfases y guía enlazada | `docs/ROADMAP.md`, `docs/MANTENIMIENTO.md` |
| 2026-11-12 | 1.1 | Línea base axe en claro/oscuro | `docs/ACCESIBILIDAD.md` y `docs/accessibility/baseline-2026-11-12.json`: 6 violaciones de contraste en vistas claras, 1 en paleta clara; oscuro sin violaciones en la matriz inicial |
| 2026-11-12 | 1.2–1.7 | Paleta clara accesible, semántica/foco, matriz axe, capturas y cualificación | `docs/ACCESIBILIDAD.md`: 12/12 axe, 20 tests de contraste, 90/90 unitarias, 3/3 integración, 22/22 E2E, auditoría 0+0; `qualify:runtime` 23:07:59 UTC |
| 2026-11-12 | 2 | Onboarding descartable, credenciales/permisos, recuperación y logs filtrables | `docs/ONBOARDING.md`; typecheck/cobertura/build/integración verdes, 92/92 unitarias, 24/24 E2E |
| 2026-11-13 | 3 | Comprobación manual de actualizaciones en CLI/app, privacidad y pruebas offline | `docs/UPDATES.md`; `npm run check` verde: 97/97 unitarias, 3/3 integración, 25/25 E2E |
| 2026-11-13 | 4 | Notificaciones opcionales, matriz Fedora, ADR distribución y checksums CI | `docs/FEDORA.md`, `docs/FEDORA-MATRIX.md`, `docs/adr/0001-distribucion-rpm.md`; `npm run check` verde: 99/99 unitarias, 3/3 integración, 26/26 E2E |
| 2026-11-13 | 5 | SBOM, licencias estrictas, ADRs de permisos/llavero y revisión de fronteras | `docs/SUPPLY-CHAIN.md`; 677 componentes objetivo, 0 licencias desconocidas; `npm run check` verde: 101/101 unitarias, 3/3 integración, 26/26 E2E |
| 2026-11-13 | 6 | Paleta ampliada, favoritos/alias/rutas rotas, plantillas, backup de preferencias, es/en y línea base de rendimiento | `docs/PRODUCTIVITY.md`, `docs/PERFORMANCE.md`; `npm run check` verde: 110/110 unitarias, 3/3 integración, 30/30 E2E; baseline 3 runs con WebSocket |
| 2026-11-13 | 7 | CONTRIBUTING, plantillas issue/PR, ADRs, checklist de release y triaje mensual | `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`, `docs/adr/README.md`, `docs/RELEASE-CHECKLIST.md`, `docs/TRIAGE.md`; `qualify:runtime` 2026-11-13T01:00:01.572Z: auditoría 0+0, 110/110 unitarias, 3/3 integración, 30/30 E2E |

## Próximo paso inmediato

Mantenimiento recurrente: seguir `docs/TRIAGE.md` mensualmente o antes de una release; usar `docs/RELEASE-CHECKLIST.md` para publicar. No publicar con CI no verde ni sin revisión humana. Bloqueos externos vigentes: Fedora/Plasma real (1.8, 4.1, 4.4), firma criptográfica (5.3), COPR/llavero/UI de permisos según ADRs. La optimización de iframe/runtime queda aplazada hasta demostrar mejora sobre la línea base sin romper WebSocket/sesión.
