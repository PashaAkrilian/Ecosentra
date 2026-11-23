# Image produksi aplikasi web (Next.js standalone). Dibangun dari folder apps/web:
#   docker build -t ecosentra-web \
#     --build-arg NEXT_PUBLIC_COGNITO_REGION=ap-southeast-2 \
#     --build-arg NEXT_PUBLIC_COGNITO_CLIENT_ID=<app client id> .
# Nilai NEXT_PUBLIC_* tertanam di kode browser SAAT BUILD; kalau tidak diberikan, login nonaktif (mode demo).
# Build mengunduh font Google (next/font), jadi butuh akses internet.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_COGNITO_REGION
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID
ARG NEXT_PUBLIC_COGNITO_ENDPOINT
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# Jalankan sebagai pengguna biasa, bukan root.
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/api/healthcheck || exit 1
CMD ["node", "server.js"]
