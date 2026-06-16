# andskli.github.io

Personal blog of Andreas Lindh — built with [Zola](https://www.getzola.org/) (theme: `serene`), deployed to GitHub Pages.

## Quick links

- **Live site:** https://andskli.github.io
- **📊 Analytics dashboard (GoatCounter):** https://andskli.goatcounter.com — *login required, private*

## Analytics

Page views are tracked with [GoatCounter](https://www.goatcounter.com/). The tracking snippet lives in `templates/_head_extend.html` (the `serene` theme has no built-in analytics). The dashboard is private/login-gated; only the `/count` endpoint embedded in each page is public.

## Local development

Zola runs containerized via Finch or Docker (`ghcr.io/getzola/zola:v0.22.1`) — no local install needed. To use a local `zola` binary instead: `ZOLA_CMD=zola make serve`.

| Command | What it does |
|---|---|
| `make serve` | Build diagrams, then serve at http://localhost:8080 (drafts included) |
| `make build` | Full production build (diagrams + social cards + Zola) into `public/` |
| `make diagrams` | Regenerate D2 diagrams → SVG (incremental) |
| `make social-cards` | Generate OG social cards via `scripts/generate-social-cards.py` |
| `make init` | Initialize the theme git submodule |

## Layout

- Posts: `content/posts/` (Markdown). Site config: `config.toml`.
- Diagrams: authored in [D2](https://d2lang.com), pre-rendered to committed SVGs — see `scripts/README.md`.

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/publish.yaml`) builds and deploys to the `gh-pages` branch. No manual deploy step.
