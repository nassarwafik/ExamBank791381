# Phase 17B — SmartAssess coding worker: python@1 (CPython 3.13.15). Build context: runner/workers (see runner/scripts/build-images.sh).
# Base: the official Docker "python:3.13-slim" image (Debian 13), pinned by digest (mirror of Docker Official Images on ECR Public).
FROM public.ecr.aws/docker/library/python@sha256:7c61056e61ac89e852de05f3dc6fa51a6dd2181797bceed46aa725dd7cb2cd3b
LABEL org.opencontainers.image.title="smartassess-coding-python" smartassess.contract="python@1" smartassess.toolchain="CPython 3.13.15"
# No package manager is used at build or run time. pip is removed so the image carries only the interpreter and its stdlib.
RUN rm -rf /usr/local/lib/python3.13/site-packages/pip /usr/local/lib/python3.13/site-packages/pip-* /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.13 && mkdir -p /opt/runner
COPY --chmod=0444 supervisor.py /opt/runner/supervisor.py
COPY --chmod=0444 python/toolchain.json /opt/runner/toolchain.json
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/python3", "-I", "-S", "/opt/runner/supervisor.py"]
