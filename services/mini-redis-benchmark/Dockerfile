# Mini-Redis Benchmark Service - Performance Testing Tool
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

# Copy source code and scenarios
COPY . .

# Change ownership to non-root user
RUN chown -R miniredis:miniredis /app

# Switch to non-root user
USER miniredis

# Default command runs basic benchmarks
CMD ["node", "index.js", "basic"]
