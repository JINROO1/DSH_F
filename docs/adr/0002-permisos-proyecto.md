# ADR 0002 — Permisos por proyecto: mantener workspace-write inicial

Estado: aceptado. No se añade UI de permisos avanzada hasta verificar contrato upstream.

## Contexto

El motor oficial admite `DSH_PERMISSION_MODE` con `read-only`, `workspace-write` y `danger-full-access`. DSH_F fuerza el modo inicial `workspace-write` y muestra advertencias en onboarding/ajustes.

## Decisión

- Mantener `workspace-write` como modo inicial seguro para la shell Fedora.
- No ofrecer `danger-full-access` desde la shell; cualquier cambio debe ser explícito dentro de Harness y bajo responsabilidad del usuario.
- Investigar `read-only` por proyecto antes de exponerlo: requiere confirmar cómo upstream aplica el modo a sesiones/workspaces y si se puede cambiar sin reiniciar.
- No describir `workspace-write` como sandbox completo: el agente puede ejecutar herramientas con los permisos del proceso y del proyecto.

## Consecuencias

- Onboarding y diagnóstico explican el límite antes de abrir/ejecutar.
- Tests de runtime verifican el entorno inicial y la guarda de ciclo de vida.
- Cualquier futura UI de permisos necesita ADR adicional, contrato Zod y pruebas de abuso.
