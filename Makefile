UID := $(shell id -u)
GID := $(shell id -g)
CURCWD := $(shell pwd)
ZOLA_CONTAINER_IMAGE := ghcr.io/getzola/zola:v0.17.1
ZOLA_CMD := docker run -it --rm -u $(UID):$(GID) -v $(CURCWD):/app --workdir /app -p 8080:8080 $(ZOLA_CONTAINER_IMAGE)

serve:
	$(ZOLA_CMD) serve --interface 0.0.0.0 --port 8080 --base-url localhost


build:
	$(ZOLA_CMD) build
