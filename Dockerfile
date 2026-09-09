# Stage 1: Download govc for the correct architecture
FROM alpine:3.21 AS govc-builder
ARG GOVC_VERSION=0.52.0
RUN apk add --no-cache curl && \
    ARCH=$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/x86_64/') && \
    curl -fsSL "https://github.com/vmware/govmomi/releases/download/v${GOVC_VERSION}/govc_Linux_${ARCH}.tar.gz" \
    | tar xzf - -C /usr/local/bin govc && \
    chmod +x /usr/local/bin/govc

# Stage 2: Install dependencies
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src/ ./src/

# Stage 3: Runtime
FROM oven/bun:1-alpine
WORKDIR /app

COPY --from=govc-builder /usr/local/bin/govc /usr/local/bin/govc
COPY --from=builder /app ./

# A cluster with a restricted security policy (OpenShift's restricted-v2, the
# restricted Pod Security Standard) runs the container under an arbitrary uid
# that has no passwd entry, so $HOME resolves to "/" and nothing the app writes
# there lands. Point HOME and the govc session cache at /tmp, and give gid 0 -
# which such a uid always carries - the same access as the owner.
ENV HOME=/tmp \
    GOVMOMI_HOME=/tmp/.govmomi
RUN mkdir -p /tmp/.govmomi && \
    chgrp -R 0 /app /tmp/.govmomi && \
    chmod -R g=u /app /tmp/.govmomi

# MCP stdio server — used by both modes
RUN printf '#!/bin/sh\nexec bun run /app/src/index.ts\n' > /usr/local/bin/vmware-mcp && \
    chmod +x /usr/local/bin/vmware-mcp

ENTRYPOINT ["vmware-mcp"]