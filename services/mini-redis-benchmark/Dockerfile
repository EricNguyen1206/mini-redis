# Mini-Redis Benchmark Service - Performance Testing Tool
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN adduser -S miniredis -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies (none currently, but ready for future)
RUN npm ci --only=production && npm cache clean --force

# Copy source code and scenarios
COPY . .

# Change ownership to non-root user
RUN chown -R miniredis:miniredis /app

# Switch to non-root user
USER miniredis

# Default command runs basic benchmarks
CMD ["node", "index.js", "basic"]
