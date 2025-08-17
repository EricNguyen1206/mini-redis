# Mini-Redis Insight Service - Web Interface and Monitoring
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN adduser -S miniredis -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies (none currently, but ready for future)
RUN npm ci --only=production && npm cache clean --force

# Copy source code and static files
COPY . .

# Change ownership to non-root user
RUN chown -R miniredis:miniredis /app

# Switch to non-root user
USER miniredis

# Expose HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.request('http://localhost:8080/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.end();"

# Start the insight service
CMD ["node", "index.js"]
