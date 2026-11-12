# Onboarding y diagnóstico amigable

Fase 2 del [roadmap](ROADMAP.md). Objetivo: que una persona nueva entienda el primer uso y pueda recuperarse de errores sin leer código.

## Guía de primera ejecución

- Tarjeta no modal en Inicio: motor local, proyecto, modelo/credenciales y permisos.
- Se puede ocultar y reabrir desde Ajustes. La preferencia persistida es `onboardingDismissed`, validada por Zod y guardada con el resto de preferencias `0600`.
- No bloquea a usuarios existentes: es una tarjeta descartable, no un asistente obligatorio.
- Textos sincronizados es/en; prueba unitaria de paridad de claves.

## Credenciales y permisos

- La shell no pide ni almacena API keys. La guía indica conectar cuenta/API key **dentro de Harness** y abre el agente con un mensaje de ayuda.
- No se inventan endpoints de login ni formularios propios de credenciales.
- El modo inicial sigue siendo `workspace-write` con confirmación. La guía aclara que no es un sandbox completo y que cambiar a acceso completo es una decisión explícita dentro de Harness.

## Estado y recuperación

Diagnóstico muestra una tarjeta de recuperación con:

- Fase del motor.
- Intentos de arranque.
- Último mensaje redactado.
- Acciones de reinicio y exportación.

El reinicio usa la API existente; no borra proyectos ni sesiones. Los errores del runtime ya se redactan antes de llegar al estado/log.

## Logs utilizables

- Filtro por texto y nivel (`info`, `warn`, `error`, todos).
- Copia del registro filtrado al portapapeles; el texto proviene del diagnóstico ya redactado.
- Estado vacío explícito cuando no hay coincidencias.
- El filtro no altera el archivo de log ni la exportación completa.
- Controles con nombre accesible y foco de teclado; la región de logs sigue siendo `role="region"` con nombre.

## Pruebas

- Unitarias: preferencia de onboarding, paridad i18n, contratos y preferencias atómicas.
- E2E: descartar/reabrir guía, texto de credenciales oficiales, tarjeta de recuperación, filtro de logs, copia redactada y exportación descargable.
- La matriz axe de Fase 1 sigue cubriendo Inicio/Diagnóstico en claro y oscuro con los nuevos componentes.

Comandos:

```bash
npm run test
npm run test:e2e
npm run check
```

## Límites

- No se probaron credenciales reales ni proveedores de modelo.
- La recuperación automática del runtime sigue acotada por sus tests unitarios/integración; no se añadió auto-update ni ejecución arbitraria desde la UI.
