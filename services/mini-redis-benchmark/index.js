#!/usr/bin/env node

/**
 * Mini-Redis Benchmark Service
 *
 * Comprehensive performance testing and benchmarking tool for Mini-Redis.
 * Provides various benchmark scenarios to test different aspects of Redis
 * performance including throughput, latency, concurrency, and reliability.
 *
 * Features:
 * - Multiple benchmark scenarios (basic, stress, pub/sub)
 * - Connection pooling for high-concurrency tests
 * - Detailed performance metrics and reporting
 * - Configurable test parameters
 * - Support for custom benchmark scenarios
 *
 * Usage:
 *   node index.js [scenario] [options]
 *
 * Environment Variables:
 *   REDIS_HOST - Redis core service host (default: mini-redis-core)
 *   REDIS_PORT - Redis core service port (default: 6380)
 *
 * @author EricNguyen1206
 * @license MIT
 */

const runBasicBenchmarks = require('./scenarios/basic');
const runStressBenchmarks = require('./scenarios/stress');
const runPubSubBenchmarks = require('./scenarios/pubsub');

// Parse command line arguments
const args = process.argv.slice(2);
let scenario = args[0] || 'basic';
let redisHost = process.env.REDIS_HOST || 'mini-redis-core';
let redisPort = process.env.REDIS_PORT || 6380;
let poolSize = 10;

// Parse additional options
for (let i = 1; i < args.length; i++) {
  switch (args[i]) {
    case "--redis-host":
    case "-h":
      redisHost = args[++i] || redisHost;
      break;
    case "--redis-port":
    case "-p":
      redisPort = parseInt(args[++i]) || redisPort;
      break;
    case "--pool-size":
    case "-c":
      poolSize = parseInt(args[++i]) || poolSize;
      break;
    case "--help":
      console.log(`
Mini-Redis Benchmark Service

Usage: node index.js [scenario] [options]

Scenarios:
  basic                       Basic performance tests (default)
  stress                      High-load stress testing
  pubsub                      Pub/Sub messaging tests
  all                         Run all benchmark scenarios

Options:
  -h, --redis-host <host>     Redis core service host (default: mini-redis-core)
  -p, --redis-port <port>     Redis core service port (default: 6380)
  -c, --pool-size <size>      Connection pool size (default: 10)
  --help                      Show this help message
  --version                   Show version information

Environment Variables:
  REDIS_HOST                  Redis core service host
  REDIS_PORT                  Redis core service port

Examples:
  node index.js basic                           # Run basic benchmarks
  node index.js stress -c 20                   # Run stress tests with 20 connections
  node index.js pubsub -h localhost -p 6380    # Run pub/sub tests against localhost
  node index.js all                            # Run all benchmark scenarios

Benchmark Scenarios:

📊 Basic Performance:
  - Basic SET/GET/DEL operations
  - Mixed operation patterns
  - PING response times
  - Baseline performance metrics

💪 Stress Testing:
  - High-volume operations (10,000+ ops)
  - High concurrency testing
  - Large value handling
  - Sustained load testing
  - Memory pressure testing

📡 Pub/Sub Testing:
  - Message publishing performance
  - Multiple channel handling
  - Various message sizes
  - High-frequency messaging
  - Subscription management
      `);
      process.exit(0);
    case "--version":
    case "-v":
      const packageJson = require("./package.json");
      console.log(`Mini-Redis Benchmark Service v${packageJson.version}`);
      process.exit(0);
    default:
      if (args[i].startsWith("-")) {
        console.error(`Unknown option: ${args[i]}`);
        console.error("Use --help for usage information");
        process.exit(1);
      }
  }
}

// Validate inputs
if (isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
  console.error(`Invalid Redis port: ${redisPort}`);
  process.exit(1);
}

if (isNaN(poolSize) || poolSize < 1 || poolSize > 100) {
  console.error(`Invalid pool size: ${poolSize} (must be 1-100)`);
  process.exit(1);
}

// Benchmark options
const benchmarkOptions = {
  host: redisHost,
  port: redisPort,
  poolSize
};

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Received SIGINT, stopping benchmarks...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, stopping benchmarks...");
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

// Main benchmark execution
async function runBenchmarks() {
  console.log("🚀 Mini-Redis Benchmark Service");
  console.log("===============================");
  console.log(`🎯 Target: ${redisHost}:${redisPort}`);
  console.log(`🏊 Pool Size: ${poolSize} connections`);
  console.log(`📊 Scenario: ${scenario}`);
  console.log("");

  const startTime = Date.now();
  const reports = [];

  try {
    switch (scenario.toLowerCase()) {
      case 'basic':
        console.log("Running basic performance benchmarks...\n");
        reports.push(await runBasicBenchmarks(benchmarkOptions));
        break;

      case 'stress':
        console.log("Running stress test benchmarks...\n");
        reports.push(await runStressBenchmarks(benchmarkOptions));
        break;

      case 'pubsub':
        console.log("Running pub/sub benchmarks...\n");
        reports.push(await runPubSubBenchmarks(benchmarkOptions));
        break;

      case 'all':
        console.log("Running all benchmark scenarios...\n");
        
        console.log("🔄 Starting basic benchmarks...");
        reports.push(await runBasicBenchmarks(benchmarkOptions));
        
        console.log("\n🔄 Starting stress benchmarks...");
        reports.push(await runStressBenchmarks(benchmarkOptions));
        
        console.log("\n🔄 Starting pub/sub benchmarks...");
        reports.push(await runPubSubBenchmarks(benchmarkOptions));
        break;

      default:
        console.error(`❌ Unknown scenario: ${scenario}`);
        console.error("Available scenarios: basic, stress, pubsub, all");
        process.exit(1);
    }

    // Generate summary report
    const totalTime = (Date.now() - startTime) / 1000;
    const totalSuccessful = reports.reduce((sum, report) => sum + report.successful, 0);
    const totalFailed = reports.reduce((sum, report) => sum + report.failed, 0);

    console.log("\n🎉 BENCHMARK SUMMARY");
    console.log("===================");
    console.log(`⏱️  Total Time: ${totalTime.toFixed(2)} seconds`);
    console.log(`✅ Successful Tests: ${totalSuccessful}`);
    console.log(`❌ Failed Tests: ${totalFailed}`);
    console.log(`📊 Success Rate: ${((totalSuccessful / (totalSuccessful + totalFailed)) * 100).toFixed(1)}%`);

    if (totalFailed > 0) {
      console.log("\n⚠️  Some benchmarks failed. Check the logs above for details.");
      process.exit(1);
    } else {
      console.log("\n🎯 All benchmarks completed successfully!");
      process.exit(0);
    }

  } catch (error) {
    console.error("\n❌ Benchmark execution failed:", error.message);
    console.error("Make sure the Redis core service is running and accessible.");
    process.exit(1);
  }
}

// Start benchmarks
runBenchmarks();
