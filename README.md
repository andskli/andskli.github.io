# andskli.github.io

Personal blog of Andreas Lindh — built with [Zola](https://www.getzola.org/) (theme: `serene`), deployed to GitHub Pages.

## Quick links

- **Live site:** https://andskli.github.io
- **📊 Analytics dashboard (GoatCounter):** https://andskli.goatcounter.com — *login required, private*

## Analytics

Page views are tracked with [GoatCounter](https://www.goatcounter.com/). The tracking snippet lives in `templates/_head_extend.html` (the `serene` theme has no built-in analytics). The standalone MongoDB Unpacked app includes the same page-view snippet in `apps/mongodb-unpacked/index.html`, because files copied from `static/` do not use Zola templates. Its visits appear under `/mongodb-unpacked/` in the same dashboard; lesson clicks are not tracked as separate events. The dashboard is private/login-gated; only the `/count` endpoint embedded in each page is public.

## Local development

Zola runs containerized via Finch or Docker (`ghcr.io/getzola/zola:v0.22.1`) — no local install needed. To use a local `zola` binary instead: `ZOLA_CMD=zola make serve`.

| Command | What it does |
|---|---|
| `make serve` | Build diagrams and MongoDB Unpacked, then serve at http://localhost:8080 (drafts included) |
| `make build` | Full production build (diagrams + social cards + MongoDB Unpacked + Zola) into `public/` |
| `make mongodb-unpacked` | Install locked npm dependencies, test, and build the interactive app |
| `make diagrams` | Regenerate D2 diagrams → SVG (incremental) |
| `make social-cards` | Generate OG social cards via `scripts/generate-social-cards.py` |
| `make init` | Initialize the theme git submodule |

## Layout

- Posts: `content/posts/` (Markdown). Site config: `config.toml`.
- Diagrams: authored in [D2](https://d2lang.com), pre-rendered to committed SVGs — see `scripts/README.md`.

## MongoDB Unpacked

[MongoDB Unpacked](https://andskli.github.io/mongodb-unpacked/) is a standalone React/Three.js app whose source lives in `apps/mongodb-unpacked/`. Building it requires Node.js 24+ and npm in addition to the existing Zola tooling.

`make mongodb-unpacked` installs dependencies with `npm ci`, runs the model tests, and generates `static/mongodb-unpacked/`. Both `make build` and `make serve` run this step automatically. If you invoke Zola directly, run `make mongodb-unpacked` first.

Zola copies the generated directory unchanged into `public/mongodb-unpacked/`. Generated bundles and `node_modules/` are ignored by Git; commit changes to the app source and lockfile. Both GitHub Actions jobs build the app before running Zola, so a push to `main` publishes the current source at `/mongodb-unpacked/`.

For app-only development:

```sh
cd apps/mongodb-unpacked
npm ci
npm run dev
```

Open http://127.0.0.1:5173/mongodb-unpacked/. Vite is configured with the `/mongodb-unpacked/` base path, including production assets. Lessons use in-page state, so no SPA redirect or custom 404 page is needed. See the app's [README](apps/mongodb-unpacked/README.md) for its lessons and fidelity boundaries.

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/publish.yaml`) builds and deploys to the `gh-pages` branch. No manual deploy step.
