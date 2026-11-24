FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  ': > /app/.dev.vars' \
  'for var in DATABASE_URL AGENT_RUNTIME_API_URL GCP_SA_KEY_JSON GCP_IDENTITY_API_KEY GCP_PROJECT_ID AUTH_LOCAL_SECRET; do' \
  '  val=$(printenv "$var" 2>/dev/null || true)' \
  '  if [ -n "$val" ]; then' \
  '    printf "%s=%s\n" "$var" "$val" >> /app/.dev.vars' \
  '  fi' \
  'done' \
  'exec pnpm exec vite --host 0.0.0.0 --port 5173 --strictPort' \
  > /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5173

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
