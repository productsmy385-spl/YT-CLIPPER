FROM node:22-bookworm-slim AS base

# FFmpeg (rendering/analysis), fonts for caption rendering (libass falls back to Noto for scripts the bundled
# fonts do not cover), python3 for yt-dlp (used ONLY for videos owned by the connected YouTube channel).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl python3 fontconfig fonts-noto-core \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# /app/storage holds media and the SQLite working copy. Mount a Railway volume here so uploads, sources and
# rendered shorts survive redeploys (PostgreSQL keeps the durable copy of the database rows).
RUN mkdir -p storage && chmod 777 storage
EXPOSE 3000
CMD ["npm", "run", "start"]
