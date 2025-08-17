#!/usr/bin/env node

/**
 * Mini-Redis Core Service
 *
 * A lightweight, high-performance Redis-compatible server focused on core functionality.
 * This service provides only the essential Redis operations without web interface or monitoring.
 *
 * Features:
 * - Redis-compatible TCP server (port 6380)
 * - Core commands: GET, SET, DEL, EXPIRE, TTL, PING, EXISTS, KEYS
 * - Pub/Sub messaging system
 * - High-performance I/O multiplexing
 * - Optimized for maximum throughput and minimal latency
 *
 * Usage:
 *   node index.js [options]
 *
 * Environment Variables:
 *   REDIS_PORT - TCP server port (default: 6380)
 *   NODE_ENV - Environment mode (development/production)
 *
 * @author EricNguyen1206
 * @license MIT
 */

const TCPServer = require("./src/tcp_server");

// Parse command line arguments
const args = process.argv.slice(2);
let tcpPort = process.env.REDIS_PORT || process.env.PORT || 6380;

// Simple argument parsing
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--port":
    case "-p":
      tcpPort = parseInt(args[++i]) || tcpPort;
      break;
    case "--help":
      console.log(`
Mini-Redis Core Service

Usage: node index.js [options]

Options:
  -p, --port <port>       TCP server port (default: 6380)
  --help                  Show this help message
  --version               Show version information

Environment Variables:
  REDIS_PORT              TCP server port
  NODE_ENV                Environment mode

Examples:
  node index.js                    # Start with default port 6380
  node index.js -p 6379           # Start on custom port
  REDIS_PORT=6379 node index.js   # Using environment variable

Redis Compatibility:
  Connect using any Redis client:
  redis-cli -p ${tcpPort}

Performance Focus:
  This core service is optimized for maximum performance:
  - No web interface overhead
  - No monitoring dependencies
  - Minimal memory footprint
  - High-throughput I/O multiplexing
      `);
      process.exit(0);
    case "--version":
    case "-v":
      const packageJson = require("./package.json");
      console.log(`Mini-Redis Core Service v${packageJson.version}`);
      process.exit(0);
    default:
      if (args[i].startsWith("-")) {
        console.error(`Unknown option: ${args[i]}`);
        console.error("Use --help for usage information");
        process.exit(1);
      }
  }
}

// Validate port
if (isNaN(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
  console.error(`Invalid TCP port: ${tcpPort}`);
  process.exit(1);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the core Redis server
async function startCoreServer() {
  try {
    console.log("🚀 Starting Mini-Redis Core Service...");
    console.log(`📊 TCP Port: ${tcpPort}`);
    console.log(`⚡ Mode: High-Performance Core Only`);
    console.log(`🔗 Connect with: redis-cli -p ${tcpPort}`);
    console.log("");

    const core = new TCPServer({ port: tcpPort });
    await core.listen();

    console.log("✅ Mini-Redis Core Service is ready!");
    console.log("🎯 Optimized for maximum performance and minimal latency");
  } catch (error) {
    console.error("❌ Failed to start core server:", error.message);
    process.exit(1);
  }
}

startCoreServer();
