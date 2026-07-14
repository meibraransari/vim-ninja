# ============================================================
# Stage 1: Build — nothing to compile for a static site,
#           but we validate/copy cleanly
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all static assets
COPY index.html .
COPY style.css  .
COPY data.js    .
COPY vim-engine.js .
COPY app.js     .
COPY README.md  .

# Optional: run any linting / minification if added later
# RUN npx html-minifier-terser index.html -o index.min.html

# ============================================================
# Stage 2: Production — nginx serving static files
# ============================================================
FROM nginx:1.27-alpine AS production

LABEL maintainer="VimNinja <vimninja@example.com>"
LABEL description="VimNinja — Interactive Vim Learning Platform"
LABEL version="1.0.0"

# Remove default nginx config and content
RUN rm -rf /usr/share/nginx/html/* \
    && rm -f /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/vimninja.conf

# Copy static site from builder
COPY --from=builder /app /usr/share/nginx/html

# Create non-root user for security
RUN addgroup -S vimninja && adduser -S vimninja -G vimninja \
    && chown -R vimninja:vimninja /usr/share/nginx/html \
    && chown -R vimninja:vimninja /var/cache/nginx \
    && chown -R vimninja:vimninja /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown vimninja:vimninja /var/run/nginx.pid

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:80/health || exit 1

EXPOSE 80

USER vimninja

CMD ["nginx", "-g", "daemon off;"]
