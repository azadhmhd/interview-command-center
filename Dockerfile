# One Dockerfile for the whole app. Targets:
#   api    → NestJS API, also used by the worker service (different command)
#   web    → Next.js standalone server
#   runner → apply runner (Playwright + headless Chromium) for servers; compose profile "runner"
# Both targets share the same install/build stage, so dependencies are installed and compiled once.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.6.2
WORKDIR /repo

FROM base AS build
# Next.js bakes rewrites in at build time: where the web server reaches the API inside the compose network.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/apply-runner/package.json apps/apply-runner/
RUN pnpm install --frozen-lockfile --filter api... --filter web...
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter api build \
  && pnpm --filter web build \
  && pnpm --filter api deploy --legacy --prod /out/api

FROM base AS api
ENV NODE_ENV=production
# Claude Code CLI for the unattended agent adapter (used when AGENT_CLAUDE_CLI_ENABLED=true).
RUN npm install -g @anthropic-ai/claude-code
WORKDIR /app
COPY --from=build /out/api ./
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
# Headless Chromium for resume PDFs (prints the web app's /print/resume page), shared by the node user
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN node node_modules/playwright/cli.js install --with-deps --only-shell chromium && rm -rf /var/lib/apt/lists/*
# Agent skill pack: the worker installs it into the shared agent-workspace on start
COPY skills ./skills
RUN npx prisma generate && mkdir -p /data /agent-workspace && chown -R node:node /data /agent-workspace
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM base AS runner
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/apply-runner/package.json apps/apply-runner/
RUN pnpm install --frozen-lockfile --filter apply-runner...
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN cd apps/apply-runner && node node_modules/playwright/cli.js install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY apps/apply-runner/tsconfig.json apps/apply-runner/
COPY apps/apply-runner/src apps/apply-runner/src
WORKDIR /repo/apps/apply-runner
USER node
# a container restart leaves the profile lock of the killed process behind; only this container uses the profile
CMD ["sh", "-c", "rm -f \"$HOME\"/.icc-apply-runner/profiles/*/.icc-runner.lock; exec node_modules/.bin/tsx src/main.ts"]
