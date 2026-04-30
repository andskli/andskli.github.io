#!/usr/bin/env bash
#
# Build SVG diagrams from all *.d2 source files under content/ and static/.
#
# Local default: run D2 via container runtime (finch on macOS, docker on Linux)
# so contributors don't need a local install. CI uses --native to run the
# d2 binary directly from PATH (faster, no image pull).
#
# - Generates a sibling .svg next to every .d2 source file.
# - Idempotent: only rebuilds when the .d2 source is newer than the .svg.
#
# Usage:
#   scripts/build-diagrams.sh                # build (incremental, container)
#   scripts/build-diagrams.sh --native       # build using d2 from PATH (CI)
#   scripts/build-diagrams.sh --force        # force rebuild all
#   scripts/build-diagrams.sh --check        # fail if any SVG is stale
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

D2_IMAGE="${D2_IMAGE:-terrastruct/d2:v0.7.0}"
D2_THEME="${D2_THEME:-0}"              # 0 = default light
# Intentionally set dark == light. We render diagrams on a white wrapper
# (see figure.d2-diagram img in templates/_head_extend.html) so the SVG
# must stay in light mode regardless of the user's OS preference. A
# different dark theme here would cause d2's embedded
# `@media (prefers-color-scheme: dark)` CSS to swap fills to dark colors
# on our white wrapper.
D2_DARK_THEME="${D2_DARK_THEME:-0}"
D2_LAYOUT="${D2_LAYOUT:-dagre}"        # dagre | elk
D2_SKETCH="${D2_SKETCH:-false}"

FORCE=0
CHECK=0
NATIVE=0
for arg in "$@"; do
  case "$arg" in
    --force)  FORCE=1 ;;
    --check)  CHECK=1 ;;
    --native) NATIVE=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# Resolve runner.
if (( NATIVE )); then
  if ! command -v d2 >/dev/null 2>&1; then
    echo "error: --native requires d2 on PATH" >&2
    exit 1
  fi
  RUN_D2=(d2)
else
  if [[ -n "${CONTAINER_RUNTIME:-}" ]]; then
    RUNTIME="$CONTAINER_RUNTIME"
  elif command -v finch >/dev/null 2>&1 && [[ "$(uname -s)" == "Darwin" ]]; then
    RUNTIME="finch"
  elif command -v docker >/dev/null 2>&1; then
    RUNTIME="docker"
  else
    echo "error: no container runtime found (need finch or docker, or pass --native)" >&2
    exit 1
  fi
  "$RUNTIME" image inspect "$D2_IMAGE" >/dev/null 2>&1 || "$RUNTIME" pull "$D2_IMAGE"
  # terrastruct/d2 image ENTRYPOINT already exec's `d2`, so we pass args directly.
  RUN_D2=("$RUNTIME" run --rm
    -u "$(id -u):$(id -g)"
    -v "$REPO_ROOT:/work"
    -w /work
    "$D2_IMAGE")
fi

stale=0
built=0
skipped=0

while IFS= read -r -d '' d2_file; do
  rel="${d2_file#$REPO_ROOT/}"
  svg_file="${d2_file%.d2}.svg"
  rel_svg="${svg_file#$REPO_ROOT/}"

  needs_build=0
  if (( FORCE )); then
    needs_build=1
  elif [[ ! -f "$svg_file" ]] || [[ "$d2_file" -nt "$svg_file" ]]; then
    needs_build=1
  fi

  if (( CHECK )); then
    if (( needs_build )); then
      echo "stale: $rel_svg (source $rel is newer or missing)" >&2
      stale=1
    fi
    continue
  fi

  if (( needs_build )); then
    echo "→ $rel_svg"
    d2_args=(
      --theme "$D2_THEME"
      --dark-theme "$D2_DARK_THEME"
      --layout "$D2_LAYOUT"
    )
    if [[ "$D2_SKETCH" == "true" ]]; then
      d2_args+=(--sketch)
    fi
    d2_args+=("$rel" "$rel_svg")
    # Redirect stdin from /dev/null: container runtimes (finch/docker) inherit
    # stdin and would consume the NUL-separated find output driving the loop.
    "${RUN_D2[@]}" "${d2_args[@]}" < /dev/null
    # Strip d2's canvas background rect (class="fill-N7") so the SVG is
    # transparent and picks up the page background in both light and dark
    # themes. The rect is always emitted as the first element after the
    # outer <svg>, uniquely identified by `class=" fill-N7"`.
    if [[ -f "$svg_file" ]]; then
      # macOS/BSD sed and GNU sed both support -i with a backup suffix arg;
      # -i '' works on BSD, -i.bak works on both but leaves a .bak file.
      # Use python for portability and to keep the SVG byte-identical otherwise.
      python3 -c "
import re, sys
p = sys.argv[1]
with open(p, 'r', encoding='utf-8') as f:
    s = f.read()
# Drop exactly one canvas rect with class=\" fill-N7\".
s2, n = re.subn(r'<rect [^>]*class=\" fill-N7\"[^/]*/>', '', s, count=1)
if n == 1:
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s2)
" "$svg_file"
    fi
    built=$((built + 1))
  else
    skipped=$((skipped + 1))
  fi
done < <(find content static -name '*.d2' -type f -print0 2>/dev/null)

if (( CHECK )); then
  if (( stale )); then
    echo "" >&2
    echo "One or more diagrams are stale. Run 'make diagrams' and commit the updated SVGs." >&2
    exit 1
  fi
  echo "all diagrams up to date"
  exit 0
fi

echo "diagrams: built=$built skipped=$skipped"
