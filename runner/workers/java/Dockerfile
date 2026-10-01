# Phase 17B — SmartAssess coding worker: java@1 (Eclipse Temurin OpenJDK 21.0.12.1+1 LTS). Build context: runner/workers.
# The official Temurin JDK is copied from the digest-pinned official eclipse-temurin:21-jdk image onto the same digest-pinned
# official python:3.13-slim base the supervisor runs on (the documented Temurin "COPY --from" pattern). Plain javac / java only — no build tool.
FROM public.ecr.aws/docker/library/eclipse-temurin@sha256:4d06038800655fe1211760cd561de70ef2ed7a47f5d69255e9834414602b7026 AS jdk
FROM public.ecr.aws/docker/library/python@sha256:7c61056e61ac89e852de05f3dc6fa51a6dd2181797bceed46aa725dd7cb2cd3b
LABEL org.opencontainers.image.title="smartassess-coding-java" smartassess.contract="java@1" smartassess.toolchain="Temurin 21.0.12.1+1"
RUN rm -rf /usr/local/lib/python3.13/site-packages/pip /usr/local/lib/python3.13/site-packages/pip-* /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.13 && mkdir -p /opt/runner
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
COPY --chmod=0444 supervisor.py /opt/runner/supervisor.py
COPY --chmod=0444 java/toolchain.json /opt/runner/toolchain.json
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/python3", "-I", "-S", "/opt/runner/supervisor.py"]
