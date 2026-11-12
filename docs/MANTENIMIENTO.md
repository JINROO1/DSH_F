# Mantenimiento para principiantes

Esta guía existe para que el proyecto no dependa de una conversación con una IA.
Si la sesión se borra, el código, las pruebas, la documentación y el historial siguen en GitHub.

Repositorio: https://github.com/JINROO1/DSH_F

Plan vigente: [ROADMAP.md](ROADMAP.md). Evidencia y límites de accesibilidad: [ACCESIBILIDAD.md](ACCESIBILIDAD.md).

## Idea principal

Tú eres el dueño/mantenedor del repositorio. Una IA puede ayudarte por turnos, pero no es un servicio permanente ni guarda el proyecto por su cuenta.

Lo que sí persiste:

- El código en GitHub.
- El historial Git: quién cambió qué y cuándo.
- `README.md` y `docs/`.
- `package.json` y `runtime/upstream.json`.
- Los scripts de actualización y cualificación.
- Las pruebas unitarias, de integración y E2E.
- El CI de GitHub Actions.

Lo que no persiste como fuente de verdad:

- Una conversación concreta.
- Promesas o explicaciones que no estén escritas en el repositorio.
- Cambios locales que no hayas commiteado y pusheado.

Regla de oro: **si algo importante no está en el repo, no existe para el futuro.**

## Primer día en una máquina nueva

```bash
git clone https://github.com/JINROO1/DSH_F.git
cd DSH_F
npm run setup
npm run preview
```

Abre `http://localhost:3000`. Si ves la shell y el motor listo, el entorno funciona.

Para validar todo:

```bash
npm run check
```

Si `npm run check` pasa, tienes una base sana.

## Rutina normal de mantenimiento

1. Crea una rama para el cambio en tu copia local. Si trabajas dentro de una sesión de Arena, usa la rama activa que indique la sesión y no crees ramas alternativas:

   ```bash
   git checkout -b fix/descripcion-corta
   ```

2. Haz el cambio pequeño.
3. Prueba:

   ```bash
   npm run check
   ```

4. Revisa qué cambiaste:

   ```bash
   git status
   git diff
   ```

5. Guarda y sube:

   ```bash
   git add -A
   git commit -m "fix: descripción corta"
   git push origin fix/descripcion-corta
   ```

6. Abre un Pull Request en GitHub y espera a que el CI pase.
7. Mergea el PR cuando esté verde.

Si estás empezando, evita cambios grandes mezclados. Un PR pequeño es más fácil de revisar y revertir.

## Actualizar el motor DeepSeek Harness

No hay auto-update silencioso. La actualización es manual y asistida.

### 1. Averiguar la versión oficial

Puedes mirar las releases/tags de:

```text
https://github.com/deepseek-ai/deepseek-harness
```

O consultar npm:

```bash
npm view @deepseek-ai/dsh dist-tags --json
npm view @deepseek-ai/dsh versions --json
```

No uses `latest` a ciegas. En este proyecto se fija una versión exacta.

### 2. Preparar la actualización

Ejemplo:

```bash
npm run upstream:prepare -- --version 0.2.3 --commit <sha-de-40-caracteres>
```

Si solo quieres mirar sin escribir:

```bash
npm run upstream:prepare -- --version 0.2.3 --dry-run
```

Si la nueva versión exige otro Node:

```bash
npm run upstream:prepare -- --version 0.2.3 --node-version 24.22.3 --commit <sha>
```

El script actualiza el pin, el lockfile y las referencias documentales gestionadas. También audita dependencias.

### 3. Instalar y cualificar

```bash
npm --prefix runtime ci
npm run qualify:runtime
```

`qualify:runtime` ejecuta auditoría, typecheck, cobertura, build, integración con el motor real y E2E.

Si falla, **no empaquetes**. Lee el error, corrige o vuelve al estado anterior.

### 4. Revisión humana antes de publicar

Aunque los tests pasen, revisa:

- ¿Los overrides de `runtime/package.json` siguen siendo necesarios?
- ¿Cambió el contrato de arranque, cookies, RPC o WebSocket?
- ¿Cambió algún token CSS de tema?
- ¿El CI pasó el smoke Electron y la instalación RPM en Fedora?

### 5. Empaquetar

```bash
npm run package:fedora
```

`package:runtime` bloquea el empaquetado si no hay cualificación vigente o si cambiaron archivos críticos después de cualificar.

## Publicar una release

El CI publica RPM cuando se pushea un tag `v*`.

Flujo simple:

1. Asegúrate de que `main` o la rama.release esté verde.
2. Sube la versión de la app en `package.json` si corresponde.
3. Crea y sube un tag:

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

4. Espera a que GitHub Actions termine.
5. Revisa la release y el asset `.rpm`.

No publiques un tag si `npm run qualify:runtime` o el CI están fallando.

## Si algo sale mal

Primero, no entres en pánico. Casi todo se puede revertir.

### Ver qué cambió

```bash
git status
git diff
git log --oneline -5
```

### Volver al último commit sano localmente

Si no has commiteado:

```bash
git restore .
```

Si ya commiteaste pero no pusheado, puedes deshacer el último commit conservando cambios:

```bash
git reset --soft HEAD~1
```

Si ya está pusheado, preferiblemente crea un commit que revierta:

```bash
git revert <sha-del-commit-malo>
git push
```

### Si una actualización upstream rompió todo

Vuelve a la versión anterior fijada:

```bash
npm run upstream:prepare -- --version <version-anterior> --commit <sha-anterior>
npm --prefix runtime ci
npm run qualify:runtime
```

O revierte el commit de actualización con `git revert`.

## Cómo pedir ayuda a otra IA en el futuro

Abre una sesión nueva y dale contexto del repositorio, no de la conversación vieja.

Prompt útil:

```text
Trabajo en https://github.com/JINROO1/DSH_F.
Lee README.md, docs/MANTENIMIENTO.md, docs/ROADMAP.md, docs/ACCESIBILIDAD.md, docs/UPSTREAM.md, docs/TESTING.md y docs/SECURITY.md.
Ejecuta npm run setup y npm run check antes de proponer cambios.
No inventes versiones, commits ni credenciales.
Si algo no está documentado, dímelo y proponga añadirlo al repo.
```

Si la IA propone un cambio importante, pídele que también actualice la documentación y las pruebas.

## Archivos que debes conocer

| Archivo | Para qué sirve |
|---|---|
| `README.md` | Puerta de entrada del proyecto. |
| `docs/MANTENIMIENTO.md` | Esta guía. |
| `docs/ROADMAP.md` | Plan por fases/subfases, estados y próximo paso. |
| `docs/ACCESIBILIDAD.md` | Matriz axe, contraste, teclado, capturas y límites de la Fase 1. |
| `docs/UPSTREAM.md` | Cómo se investigó y actualiza el motor oficial. |
| `docs/TESTING.md` | Qué pruebas existen y cómo ejecutarlas. |
| `docs/SECURITY.md` | Modelo de seguridad y overrides. |
| `docs/FEDORA.md` | Empaquetado e integración Fedora/KDE. |
| `runtime/upstream.json` | Versión exacta del motor, Node incluido y commit. |
| `runtime/package.json` | Pin del motor y overrides de seguridad. |
| `scripts/prepare-upstream.mjs` | Prepara una actualización upstream. |
| `scripts/qualify-runtime.mjs` | Cualifica el runtime con pruebas reales. |
| `scripts/stage-runtime.mjs` | Bloquea empaquetado sin cualificación vigente. |
| `.github/workflows/ci.yml` | CI: pruebas, smoke, RPM e instalación Fedora. |

## Checklist mensual recomendado

- [ ] `git pull` en tu copia local.
- [ ] `npm run setup`.
- [ ] `npm run check`.
- [ ] Revisar releases/tags de DeepSeek Harness.
- [ ] Revisar advisories/overrides si hay actualización.
- [ ] Actualizar estados/evidencia en `docs/ROADMAP.md`; no marcar Hecho sin pruebas.
- [ ] Si actualizas: `upstream:prepare` → `runtime ci` → `qualify:runtime`.
- [ ] Revisar CI en GitHub.
- [ ] Publicar release solo si todo está verde.
- [ ] Documentar cualquier decisión nueva en `docs/`.

## Lo que no debes hacer

- No depender de que una sesión de IA recuerde el proyecto.
- No empaquetar si `qualify:runtime` falló.
- No usar `latest` como pin del motor.
- No inventar un commit de upstream.
- No subir credenciales, tokens ni `.env` reales.
- No mezclar una actualización upstream con muchos cambios de UI en el mismo PR.
- No borrar `runtime/package-lock.json` para “arreglar” errores sin entender la causa.

## Resumen

El proyecto se mantiene solo si está en GitHub, probado y documentado.
La sesión de IA puede desaparecer; el repositorio no.
Tu trabajo como mantenedor principiante es: cambios pequeños, pruebas verdes, commits claros y documentación actualizada.
