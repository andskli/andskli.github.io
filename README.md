# andskli.github.io

Personal blog of Andreas Lindh — built with [Zola](https://www.getzola.org/) (theme: `serene`), deployed to GitHub Pages.

## Quick links

- **Live site:** https://andskli.github.io
- **📊 Analytics dashboard (GoatCounter):** https://andskli.goatcounter.com — *login required, private*

## Analytics

Page views are tracked with [GoatCounter](https://www.goatcounter.com/). The tracking snippet lives in `templates/_head_extend.html` (the `serene` theme has no built-in analytics). The standalone MongoDB in Motion app includes the same page-view snippet in `apps/mongodb-in-motion/index.html`, because files copied from `static/` do not use Zola templates. Its visits appear under `/mongodb-in-motion/` in the same dashboard; lesson clicks are not tracked as separate events. The dashboard is private/login-gated; only the `/count` endpoint embedded in each page is public.

## Local development

Zola runs containerized via Finch or Docker (`ghcr.io/getzola/zola:v0.22.1`) — no local install needed. To use a local `zola` binary instead: `ZOLA_CMD=zola make serve`.

| Command | What it does |
|---|---|
| `make serve` | Build diagrams and apps, then serve at http://localhost:8080 (drafts included) |
| `make build` | Full production build (diagrams + social cards + apps + Zola) into `public/` |
| `make apps` | Build all registered standalone apps, including their checks |
| `make mongodb-in-motion` | Install locked npm dependencies, test, and build only MongoDB in Motion |
| `make diagrams` | Regenerate D2 diagrams → SVG (incremental) |
| `make social-cards` | Generate OG social cards via `scripts/generate-social-cards.py` |
| `make init` | Initialize the theme git submodule |

## Layout

- Posts: `content/posts/` (Markdown). Site config: `config.toml`.
- Diagrams: authored in [D2](https://d2lang.com), pre-rendered to committed SVGs — see `scripts/README.md`.
- Apps: source under `apps/<name>/`, with generated output under `static/<name>/`.

## Standalone apps

`make apps` is the shared entry point for all app builds. Both `make build` and `make serve`, as well as both GitHub Actions jobs, call it before Zola. Individual targets such as `make mongodb-in-motion` remain available for working on one app.

To add an app, put its source in `apps/<name>/`, define a Make target that runs its checks and builds into `static/<name>/`, and add that target to the `apps` prerequisites. Ignore generated output and local dependencies in Git. Each app owns its build tooling; add any required toolchain setup to CI. The existing npm cache covers `apps/*/package-lock.json`.

## MongoDB in Motion

[MongoDB in Motion](https://andskli.github.io/mongodb-in-motion/) is a standalone React/Three.js app whose source lives in `apps/mongodb-in-motion/`. Building it requires Node.js 24+ and npm in addition to the existing Zola tooling.

`make mongodb-in-motion` installs dependencies with `npm ci`, checks formatting, runs the model tests, and generates `static/mongodb-in-motion/`. It is included in `make apps`. If you invoke Zola directly, run `make apps` first.

Zola copies the generated directory unchanged into `public/mongodb-in-motion/`. Generated bundles and `node_modules/` are ignored by Git; commit changes to the app source and lockfile. Both GitHub Actions jobs build the app before running Zola, so a push to `main` publishes the current source at `/mongodb-in-motion/`.

For app-only development:

```sh
cd apps/mongodb-in-motion
npm ci
npm run dev
```

Open http://127.0.0.1:5173/mongodb-in-motion/. Vite is configured with the `/mongodb-in-motion/` base path, including production assets. Lessons use in-page state, so no SPA redirect or custom 404 page is needed. See the app's [README](apps/mongodb-in-motion/README.md) for its lessons and fidelity boundaries.

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/publish.yaml`) builds and deploys to the `gh-pages` branch. No manual deploy step.
