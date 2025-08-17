#!/usr/bin/env node

/**
 * Mini-Redis Insight Service
 *
 * Web-based monitoring and management interface for Mini-Redis.
 * Connects to the mini-redis-core service to provide real-time insights,
 * performance monitoring, and interactive command execution.
 *
 * Features:
 * - Real-time web dashboard with Chart.js visualizations
 * - Interactive Redis command execution
 * - Performance monitoring and metrics
 * - WebSocket-based live updates
 * - Pub/Sub message monitoring
 * - Data visualization and management
 *
 * Usage:
 *   node index.js [options]
 *
 * Environment Variables:
 *   HTTP_PORT - HTTP server port (default: 8080)
 *   REDIS_HOST - Redis core service host (default: mini-redis-core)
 *   REDIS_PORT - Redis core service port (default: 6380)
 *
 * @author EricNguyen1206
 * @license MIT
 */

const Orchestrator = require("./src/orchestrator");

// Parse command line arguments
const args = process.argv.slice(2);
let httpPort = process.env.HTTP_PORT || 8080;
let redisHost = process.env.REDIS_HOST || 'mini-redis-core';
let redisPort = process.env.REDIS_PORT || 6380;

// Simple argument parsing
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--port":
    case "-p":
      httpPort = parseInt(args[++i]) || httpPort;
      break;
    case "--redis-host":
    case "-h":
      redisHost = args[++i] || redisHost;
      break;
    case "--redis-port":
    case "-r":
      redisPort = parseInt(args[++i]) || redisPort;
      break;
    case "--help":
      console.log(`
Mini-Redis Insight Service

Usage: node index.js [options]

Options:
  -p, --port <port>           HTTP server port (default: 8080)
  -h, --redis-host <host>     Redis core service host (default: mini-redis-core)
  -r, --redis-port <port>     Redis core service port (default: 6380)
  --help                      Show this help message
  --version                   Show version information

Environment Variables:
  HTTP_PORT                   HTTP server port
  REDIS_HOST                  Redis core service host
  REDIS_PORT                  Redis core service port

Examples:
  node index.js                                    # Start with defaults
  node index.js -p 8080 -h localhost -r 6380     # Custom configuration
  HTTP_PORT=8080 REDIS_HOST=localhost node index.js # Using environment variables

Web Interface:
  Once started, open http://localhost:${httpPort} in your browser
  to access the monitoring dashboard and management interface.

Features:
  📊 Real-time performance charts and metrics
  🔧 Interactive Redis command execution
  📡 Pub/Sub message monitoring
  💾 Data visualization and management
  🔄 Live updates via WebSocket
      `);
      process.exit(0);
    case "--version":
    case "-v":
      const packageJson = require("./package.json");
      console.log(`Mini-Redis Insight Service v${packageJson.version}`);
      process.exit(0);
    default:
      if (args[i].startsWith("-")) {
        console.error(`Unknown option: ${args[i]}`);
        console.error("Use --help for usage information");
        process.exit(1);
      }
  }
}

// Validate ports
if (isNaN(httpPort) || httpPort < 1 || httpPort > 65535) {
  console.error(`Invalid HTTP port: ${httpPort}`);
  process.exit(1);
}

if (isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
  console.error(`Invalid Redis port: ${redisPort}`);
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

// Start the insight service
async function startInsightService() {
  try {
    console.log("🚀 Starting Mini-Redis Insight Service...");
    console.log(`🌐 HTTP Port: ${httpPort}`);
    console.log(`🔌 Redis Core: ${redisHost}:${redisPort}`);
    console.log(`📊 Web Interface: http://localhost:${httpPort}`);
    console.log("");

    const orchestrator = new Orchestrator(httpPort, {
      redisHost,
      redisPort
    });
    
    await orchestrator.listen();

    console.log("✅ Mini-Redis Insight Service is ready!");
    console.log("🎯 Providing real-time monitoring and management interface");
  } catch (error) {
    console.error("❌ Failed to start insight service:", error.message);
    process.exit(1);
  }
}

startInsightService();
