# Override ZOLA_CMD to use a local zola instead of the containerized one:
#   ZOLA_CMD=zola make serve
DOCKER    ?= $(shell command -v finch 2>/dev/null || command -v docker 2>/dev/null || echo docker)
ZOLA_IMAGE ?= ghcr.io/getzola/zola:v0.22.1
ZOLA_CMD  ?= $(DOCKER) run --rm -u $(shell id -u):$(shell id -g) -v $(shell pwd):/app --workdir /app -p 8080:8080 $(ZOLA_IMAGE)
GIT       ?= git

init:
	$(GIT) submodule --init --recursive

diagrams:
	./scripts/build-diagrams.sh

diagrams-force:
	./scripts/build-diagrams.sh --force

diagrams-check:
	./scripts/build-diagrams.sh --check

serve: diagrams
	$(ZOLA_CMD) serve --interface 0.0.0.0 --port 8080 --base-url localhost --drafts

build: diagrams
	$(ZOLA_CMD) build

.PHONY: init diagrams diagrams-force diagrams-check serve build
