# Auto-detect a container runtime: Finch on macOS, Docker otherwise.
# Override by setting DOCKER explicitly (e.g. DOCKER=docker make build).
DOCKER ?= $(shell command -v finch 2>/dev/null || command -v docker 2>/dev/null || echo docker)
GIT ?= git
UID := $(shell id -u)
GID := $(shell id -g)
CURCWD := $(shell pwd)
ZOLA_CONTAINER_IMAGE := ghcr.io/getzola/zola:v0.22.1

# `serve` is interactive (foreground, user Ctrl-C's to stop) so it gets -it.
# `build` must be non-interactive or it fails when stdin isn't a TTY
# (e.g. in CI or when make is invoked from a non-terminal context).
ZOLA_RUN_INTERACTIVE := $(DOCKER) run -it --rm -u $(UID):$(GID) -v $(CURCWD):/app --workdir /app -p 8080:8080 $(ZOLA_CONTAINER_IMAGE)
ZOLA_RUN_BATCH       := $(DOCKER) run     --rm -u $(UID):$(GID) -v $(CURCWD):/app --workdir /app $(ZOLA_CONTAINER_IMAGE)

init:
	$(GIT) submodule --init --recursive

serve:
	$(ZOLA_RUN_INTERACTIVE) serve --interface 0.0.0.0 --port 8080 --base-url localhost

build:
	$(ZOLA_RUN_BATCH) build

.PHONY: init serve build
