# syntax=docker/dockerfile:1

# =============================================================================
#  Microfinance Admin Panel — production image
#  Multi-stage: build the Vite SPA -> serve static assets via unprivileged nginx.
# =============================================================================

############################
# Build — compile the Vite/React SPA
############################
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# VITE_API_BASE_URL is baked into the bundle at build time.
# Default empty => same-origin: nginx reverse-proxies /api/* to the backend,
# so no CORS and no hardcoded host is required. Override only for a split-host
# deployment (e.g. https://api.your-domain.com).
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY . .
RUN npm run build


############################
# Runtime — static files on a non-root nginx
############################
# nginx-unprivileged runs as uid 101 (non-root) and listens on 8080 by default.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Reverse-proxy + SPA-fallback config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static build output.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# Probe nginx's own lightweight health route (does not depend on the backend).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1"]
