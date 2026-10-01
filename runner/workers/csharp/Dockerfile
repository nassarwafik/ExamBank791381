# Phase 17B — SmartAssess coding worker: csharp@1 (.NET SDK 10.0.401 / runtime 10.0.12 LTS). Build context: runner/workers.
# The official .NET SDK is copied from the digest-pinned official mcr.microsoft.com/dotnet/sdk:10.0 image onto the digest-pinned
# official python:3.13-slim base. Compilation is the SDK's own Roslyn compiler (csc) against the reference assemblies shipped in
# the SDK — fully OFFLINE: no project file, no package restore at build or run time. Globalization-invariant mode (no ICU).
FROM mcr.microsoft.com/dotnet/sdk@sha256:35d40304542c8689331f8cab17c65926cdf48fe711e289321d71924b230a7d29 AS dotnet
FROM public.ecr.aws/docker/library/python@sha256:7c61056e61ac89e852de05f3dc6fa51a6dd2181797bceed46aa725dd7cb2cd3b
LABEL org.opencontainers.image.title="smartassess-coding-csharp" smartassess.contract="csharp@1" smartassess.toolchain=".NET SDK 10.0.401 / runtime 10.0.12"
RUN rm -rf /usr/local/lib/python3.13/site-packages/pip /usr/local/lib/python3.13/site-packages/pip-* /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.13 && mkdir -p /opt/runner
COPY --from=dotnet /usr/share/dotnet /usr/share/dotnet
COPY --chmod=0444 supervisor.py /opt/runner/supervisor.py
COPY --chmod=0444 csharp/toolchain.json /opt/runner/toolchain.json
COPY --chmod=0444 csharp/GlobalUsings.cs /opt/runner/GlobalUsings.cs
COPY --chmod=0444 csharp/Main.runtimeconfig.json /opt/runner/Main.runtimeconfig.json
# A stable path to the SDK's Roslyn compiler and a response file listing the framework reference assemblies (generated offline
# from the files already in the image).
RUN set -eu; sdk="$(ls -d /usr/share/dotnet/sdk/10.0.*/ | head -n 1)"; ln -s "${sdk}Roslyn/bincore" /opt/runner/roslyn; \
    for f in /usr/share/dotnet/packs/Microsoft.NETCore.App.Ref/10.0.*/ref/net10.0/*.dll; do echo "-r:$f"; done > /opt/runner/references.rsp; \
    chmod 0444 /opt/runner/references.rsp; test -s /opt/runner/references.rsp; test -f /opt/runner/roslyn/csc.dll
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/python3", "-I", "-S", "/opt/runner/supervisor.py"]
