# Contribuir a DSH_F

Gracias por ayudar. Esta edición Fedora vive de cambios pequeños, verificables y documentados. No reescribe ni parchea el motor oficial de DeepSeek Harness.

## Reglas de oro

1. **1 idea = 1 rama = 1 PR pequeño.** No mezcles actualización upstream + tema + refactor + packaging.
2. **No parchear el paquete oficial de Harness.** Mejora solo la capa Fedora/Electron.
3. **Sin secretos en issues/PR/logs.** Nunca pegues API keys, tokens, cookies ni rutas privadas sensibles.
4. **Evidencia durable.** Si cambias comportamiento, añade tests y actualiza docs/ROADMAP cuando aplique.
5. **Sin auto-update silencioso, telemetría obligatoria ni shell exec arbitrario.**

## Entorno desde cero

Requisitos: Linux x64, Node ≥ 22.12, npm, Git. Fedora/KDE es el objetivo; la vista previa permite desarrollar sin KDE.

```bash
git clone https://github.com/JINROO1/DSH_F.git
cd DSH_F
npm run setup
npx playwright install chromium
npm run check
```

En Fedora, instala antes las dependencias nativas listadas en [docs/TESTING.md](docs/TESTING.md). Para UI sin Electron:

```bash
npm run preview
```

Abre `http://localhost:3000`. No introduzcas credenciales sensibles en la vista previa.

Smoke nativo (requiere binario Electron y display):

```bash
xvfb-run -a npm run test:electron
```

## Flujo de PR

```bash
git checkout -b fix/descripcion-corta
# cambio pequeño + tests + docs
npm run check
git status && git diff
git commit -m "fix: descripción corta"
git push origin fix/descripcion-corta
```

Si trabajas en una sesión de Arena, usa la rama activa que indique la sesión y no crees ramas alternativas.

Incluye en el PR:

- Qué cambia y por qué.
- Fase/subfase del [ROADMAP](docs/ROADMAP.md) si aplica.
- Comandos de prueba y resultado.
- Capturas si cambia UI.
- Riesgos de seguridad/distribución y revisión humana requerida.

## Estilo

- TypeScript estricto; contratos Zod para IPC/preferencias.
- Textos de shell en `src/renderer/i18n.ts`, español e inglés sincronizados.
- CSS con tokens de tema; no hardcodear colores que rompan claro/oscuro.
- Main/preload/renderer separados; el renderer no recibe Node ni rutas arbitrarias.
- Preferencias atómicas `0600`; logs redactados.
- Commits claros: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Áreas sensibles

- Actualizaciones upstream: [docs/UPSTREAM.md](docs/UPSTREAM.md) y [docs/UPDATES.md](docs/UPDATES.md).
- Seguridad/cadena de suministro: [docs/SECURITY.md](docs/SECURITY.md), [docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md).
- Distribución: [docs/FEDORA.md](docs/FEDORA.md), [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md).
- Decisiones: [docs/adr/README.md](docs/adr/README.md).

## Reportar problemas

Usa las plantillas de issue. Para vulnerabilidades, **no abras issue público**: sigue [SECURITY.md](docs/SECURITY.md) y el aviso privado de GitHub.
