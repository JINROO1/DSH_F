# Productividad diaria

Fase 6 del [roadmap](ROADMAP.md). Reduce fricción de la shell Fedora sin convertirse en otro motor de agentes ni parchear Harness.

## Paleta de comandos

`Ctrl+K` / `Cmd+K` abre la paleta. Añade acciones existentes:

- Tema claro/oscuro/sistema.
- Abrir proyecto, crear desde plantilla, ver proyectos.
- Ver diagnóstico y exportar diagnóstico.
- Reiniciar motor.

Todas pasan por la API actual; no hay `shell exec` arbitrario. Navegación completa con teclado: búsqueda, flechas, Enter, Escape.

## Proyectos recientes

- **Favoritos**: se ordenan primero en portada, barra lateral y lista; persisten en `desktop.json`.
- **Alias**: nombre visible opcional; vacío vuelve al nombre de carpeta. No renombra archivos.
- **Rutas inexistentes**: botón explícito “Comprobar rutas”. Solo lectura (`stat`); errores de permiso no se tratan como rotos.
- **Limpiar rutas inexistentes**: solo quita entradas de recientes cuya ruta ya no es carpeta. No borra archivos ni sesiones del usuario.
- Migración compatible: `favorite` tiene default `false`; `alias` es opcional. Preferencias antiguas siguen cargando.

## Plantillas locales

Cinco plantillas mínimas: vacía, Node, Python, documentación y scripts.

- Destino explícito: diálogo nativo de carpeta; en vista previa, campo limitado a `.preview/workspaces`.
- Crea una carpeta nueva con `mkdir` no recursivo: si ya existe, falla y no sobrescribe.
- No ejecuta instalaciones, no crea entornos virtuales, no corre scripts.
- Si falla la escritura, elimina solo la carpeta recién creada.
- Tras crear, registra el proyecto en Harness y en recientes; no abre una sesión de agente automáticamente.

## Backup de preferencias

- Exporta solo `settings` no sensible: tema, idioma, bandeja, confirmación, autostart, movimiento, onboarding y notificaciones.
- Excluye credenciales, tokens, cookies, `DSH_HOME` y proyectos recientes.
- Esquema Zod estricto `schemaVersion: 1`; claves desconocidas como `apiKey` se rechazan.
- Importación en dos pasos: revisar cambios (`current → new`) y aplicar. Sin preview no se aplica.
- Aplicar reutiliza el flujo de ajustes nativo (tema/runtime/autostart) y conserva copia previa `.bak`.
- Nativo: diálogo de guardado con modo `0600`. Vista previa: descarga JSON local.

## Idiomas y textos

- Claves es/en sincronizadas por test unitario.
- E2E verifica textos nuevos en inglés, botones sin desbordamiento a 960 px y axe del diálogo de plantilla.
- Los mensajes de error del sistema pueden conservar códigos técnicos (p. ej. `EEXIST`); la UI los muestra como alerta, no como éxito.

## Rendimiento

Línea base repetible en [PERFORMANCE.md](PERFORMANCE.md). No se optimizó iframe/runtime en esta fase; cualquier mejora futura debe compararse contra la evidencia y conservar WebSocket/sesión.

## Pruebas

- Unitarias: plantillas, disponibilidad de rutas, favoritos/alias/prune, export/import de preferencias, contratos Zod.
- E2E: `tests/e2e/productivity.spec.ts` cubre paleta, proyectos, plantillas, limpieza, preferencias e inglés/axe.
- La matriz axe existente sigue auditando portada/proyectos/ajustes/diagnóstico con los nuevos controles.
