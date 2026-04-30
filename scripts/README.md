# Diagrams (D2)

Blog diagrams are authored in [D2](https://d2lang.com) as `.d2` files alongside
post content, then pre-rendered to `.svg` at build time. SVGs are committed to
the repo so GitHub Pages never needs D2 installed.

## Where to put them

- Co-located with a post (recommended):
  ```
  content/posts/my-post/
    index.md
    architecture.d2        ← source (edit this)
    architecture.svg       ← generated (commit this)
  ```

- Shared site-wide:
  ```
  static/img/diagrams/
    arch.d2
    arch.svg
  ```

## Authoring workflow

1. Write or edit a `.d2` file.
2. Run `make diagrams` to regenerate SVGs (only rebuilds what changed).
3. Commit **both** the `.d2` source and the `.svg` output.
4. Reference the SVG in your post:

   ```markdown
   {{ d2(src="architecture.svg", caption="High-level architecture") }}
   ```

   Or, from a static path:

   ```markdown
   {{ d2(src="/img/diagrams/arch.svg", caption="Request flow") }}
   ```

## Make targets

| Target | What it does |
|---|---|
| `make diagrams` | Incremental build — rebuilds SVGs whose `.d2` source is newer. |
| `make diagrams-force` | Rebuild every SVG, regardless of mtime. |
| `make diagrams-check` | Exit non-zero if any SVG is stale. Used by CI. |
| `make build` / `make serve` | Run `make diagrams` first, then Zola. |

## How it runs

- **Locally (macOS):** the script uses Finch by default to run
  `terrastruct/d2:v0.7.0`. Falls back to Docker on Linux.
- **In CI (GitHub Actions):** the workflow installs `d2` natively via
  `d2lang.com/install.sh` and runs `./scripts/build-diagrams.sh --native`.
  Then a `git diff` check fails the build if committed SVGs are stale.

## Customization

Environment variables understood by `scripts/build-diagrams.sh`:

| Var | Default | Notes |
|---|---|---|
| `D2_IMAGE` | `terrastruct/d2:v0.7.0` | Container image when not using `--native` |
| `D2_THEME` | `0` | Light mode theme ID |
| `D2_DARK_THEME` | `200` | Dark mode theme ID |
| `D2_LAYOUT` | `dagre` | Layout engine: `dagre` or `elk` |
| `D2_SKETCH` | `false` | Set `true` for hand-drawn style |
| `CONTAINER_RUNTIME` | auto | Force `finch` or `docker` |

Example: render all diagrams in sketch mode for a single build:

```
D2_SKETCH=true make diagrams-force
```
