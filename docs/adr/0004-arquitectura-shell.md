# ADR 0004 — Shell Electron + motor oficial hijo + puente autenticado

Estado: aceptado.

## Contexto

DSH_F quiere una aplicación de escritorio Fedora/KDE alrededor de DeepSeek Harness sin reescribir el motor de agentes ni mantener un fork profundo. La UI oficial debe conservar sesiones, workspaces, plugins y credenciales locales.

## Alternativas

1. **Fork profundo / reescritura del motor.** Rechazado: coste alto, divergencia upstream, riesgo de romper credenciales/plugins y actualizaciones.
2. **Solo wrapper web sin proceso propio.** Rechazado: peor integración de bandeja/autostart/tema, ciclo de vida y aislamiento del motor.
3. **Shell Electron + motor oficial como proceso hijo + puente loopback autenticado.** Elegido: mantiene el paquete oficial sin parchear y añade capa Fedora verificable.

## Decisión

- Electron main owns window, tray, XDG autostart, settings and diagnostics.
- HarnessRuntime lanza el Node incluido y el paquete oficial `@deepseek-ai/dsh` con `DSH_HOME` propio y `DSH_PERMISSION_MODE=workspace-write`.
- HarnessBridge sirve la UI oficial por loopback con cookie/tickets de un solo uso; el token upstream no llega al renderer.
- La shell se comunica por IPC Zod estricto; el iframe recibe CSS de tema sin modificar el paquete upstream.
- Actualizaciones del motor son manuales y cualificadas; no auto-update silencioso.

## Consecuencias

- Tests de integración arranque/sesión/restart/parada y E2E de paridad shell/agente.
- Superficie de seguridad reducida: orígenes permitidos, descargas solo del puente, ventanas emergentes denegadas salvo destinos HTTPS permitidos.
- Cualquier cambio de contrato upstream requiere ADR/actualización de docs y cualificación completa.
- Fedora/Plasma real y firma de artefactos siguen siendo validaciones externas separadas.
