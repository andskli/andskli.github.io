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

# Add each standalone app's build target here so local and CI builds include it.
apps: mongodb-in-motion

mongodb-in-motion:
	./scripts/build-mongodb-in-motion.sh

serve: diagrams apps
	$(ZOLA_CMD) serve --interface 0.0.0.0 --port 8080 --base-url localhost --drafts

build: diagrams social-cards apps
	$(ZOLA_CMD) build

social-cards:
	python3 scripts/generate-social-cards.py

social-cards-force:
	python3 scripts/generate-social-cards.py --force

.PHONY: init apps mongodb-in-motion diagrams diagrams-force diagrams-check serve build social-cards social-cards-force
