# Mini-Redis Core Service - Optimized for Performance
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN adduser -S miniredis -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies (none currently, but ready for future)
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R miniredis:miniredis /app

# Switch to non-root user
USER miniredis

# Expose Redis port
EXPOSE 6380

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const net = require('net'); const client = net.connect(6380, 'localhost', () => { client.write('PING\\n'); client.on('data', () => { client.end(); process.exit(0); }); }); client.on('error', () => process.exit(1));"

# Start the core service
CMD ["node", "index.js"]
