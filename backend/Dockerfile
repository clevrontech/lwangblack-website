FROM node:20-alpine AS backend

WORKDIR /app

COPY package*.json .npmrc ./
# --omit=dev replaces deprecated --only=production; skip cache clean --force (avoids npm "protections disabled" noise)
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# Create invoice directory
RUN mkdir -p /app/invoices

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S lwangblack -u 1001 -G nodejs && \
    chown -R lwangblack:nodejs /app/invoices
USER lwangblack

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "src/server.js"]
