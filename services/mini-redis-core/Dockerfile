# Mini-Redis Core Service - Optimized for Performance
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 miniredis && \
  adduser -S -u 1001 -G miniredis miniredis

# Copy package files
COPY package*.json ./

# Install dependencies (skip if no dependencies exist)
# Use npm install instead of npm ci for zero-dependency packages
RUN if [ -f package-lock.json ]; then \
  npm ci --only=production; \
  else \
  npm install --only=production; \
  fi && \
  npm cache clean --force

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R miniredis:miniredis /app

# Switch to non-root user
USER miniredis

# Expose Redis port
EXPOSE 6380

# Health check using RESP protocol
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the core service
CMD ["node", "index.js"]
