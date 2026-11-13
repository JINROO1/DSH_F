# ADR 0003 — Llavero del sistema: no migrar credenciales todavía

Estado: investigación cerrada; integración bloqueada hasta soporte/contrato upstream o prototipo separado revisado.

## Contexto

KDE Wallet/libsecret podría proteger secretos, pero las credenciales actuales viven en el flujo oficial de Harness (`DSH_HOME`/storages upstream). Migrarlas desde la shell Fedora arriesga duplicación, pérdida o exposición.

## Opciones

1. No integrar: mantener credenciales en Harness. Coste bajo, riesgo bajo.
2. Prototipo libsecret/KDE Wallet solo para secretos nuevos de la shell. Coste medio; requiere contrato y revisión.
3. Migrar credenciales upstream al llavero. Coste alto; requiere soporte upstream y plan de rollback.

## Decisión

- Opción 1 por ahora: la shell no pide ni almacena API keys.
- No parchear el paquete oficial para leer/escribir su storage de credenciales.
- Un prototipo futuro debe ser separado, sin migración automática, con pruebas de fallo del llavero y revisión humana.

## Consecuencias

- Onboarding enlaza el flujo oficial de cuenta/API key dentro de Harness.
- Si upstream publica soporte de llavero, se reevalúa con ADR nuevo.
