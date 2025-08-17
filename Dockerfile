# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (none currently, but good practice)
# Since there are no dependencies and no package-lock.json, we'll skip npm ci
RUN npm install --only=production || true

# Copy source code
COPY . .

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S miniredis -u 1001

# Change ownership of the app directory
RUN chown -R miniredis:nodejs /app
USER miniredis

# Expose ports
# 6380 for Redis TCP protocol
# 8080 for HTTP web interface
EXPOSE 6380 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const net = require('net'); const client = net.connect(6380, 'localhost', () => { client.write('PING\\n'); client.on('data', () => { client.end(); process.exit(0); }); }); client.on('error', () => process.exit(1));"

# Default command - start with monitoring enabled
CMD ["node", "index.js", "--monitor"]
