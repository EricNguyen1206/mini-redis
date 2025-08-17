#!/usr/bin/env node

/**
 * Mini-Redis Server Entry Point
 *
 * A Redis-compatible in-memory data store with pub/sub messaging,
 * real-time performance monitoring, and web interface.
 *
 * Features:
 * - Redis-compatible commands (GET, SET, DEL, EXPIRE, etc.)
 * - Pub/Sub messaging system
 * - Real-time performance monitoring
 * - Web-based management interface
 * - WebSocket support for live updates
 * - High-performance I/O multiplexing
 *
 * Usage:
 *   node index.js [options]
 *
 * Environment Variables:
 *   PORT - TCP server port (default: 6380)
 *   HTTP_PORT - HTTP server port (default: 8080)
 *
 * @author EricNguyen1206
 * @license MIT
 */

const Orchestrator = require("./src/monitoring/orchestrator");
const TCPServer = require("./src/core/tcp_server");

// Parse command line arguments
const args = process.argv.slice(2);
const isMonitor = args.includes("--monitor");
let tcpPort = process.env.PORT || 6380;
let httpPort = process.env.HTTP_PORT || 8080;

// Simple argument parsing
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--port":
    case "-p":
      tcpPort = parseInt(args[++i]) || tcpPort;
      break;
    case "--http-port":
    case "-h":
      httpPort = parseInt(args[++i]) || httpPort;
      break;
    case "--help":
      console.log(`
Mini-Redis Server

Usage: node index.js [options]

Options:
  -p, --port <port>       TCP server port (default: 6380)
  -h, --http-port <port>  HTTP server port (default: 8080)
  --monitor               Enable web interface and monitoring
  --help                  Show this help message

Environment Variables:
  PORT                    TCP server port
  HTTP_PORT               HTTP server port

Examples:
  node index.js                          # Start with default ports
  node index.js -p 6379 -h 8080         # Custom ports
  PORT=6379 HTTP_PORT=8080 node index.js # Using environment variables

Web Interface:
  Once started, open http://localhost:${httpPort} in your browser
  to access the web-based management interface.

Redis Compatibility:
  Connect using any Redis client:
  redis-cli -p ${tcpPort}
      `);
      process.exit(0);
    case "--version":
    case "-v":
      const packageJson = require("./package.json");
      console.log(`Mini-Redis Server v${packageJson.version}`);
      process.exit(0);
    case "--monitor":
      // Monitor flag is already handled above, just skip it here
      break;
    default:
      if (args[i].startsWith("-")) {
        console.error(`Unknown option: ${args[i]}`);
        console.error("Use --help for usage information");
        process.exit(1);
      }
  }
}

// Validate ports
if (isNaN(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
  console.error(`Invalid TCP port: ${tcpPort}`);
  process.exit(1);
}

if (isNaN(httpPort) || httpPort < 1 || httpPort > 65535) {
  console.error(`Invalid HTTP port: ${httpPort}`);
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

// Start the server
async function startServer() {
  try {
    console.log("🚀 Starting Mini-Redis Server...");
    console.log(`📊 TCP Port: ${tcpPort}`);
    console.log(`🌐 HTTP Port: ${httpPort}`);
    console.log(`🔗 Web Interface: http://localhost:${httpPort}`);
    console.log("");

    const core = new TCPServer({ port: tcpPort });
    await core.listen();

    if (isMonitor) {
      const orch = new Orchestrator(httpPort, core);
      await orch.listen();
    }
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
