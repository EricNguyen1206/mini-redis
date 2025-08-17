# ⚡ Mini-Redis Benchmark Service

A comprehensive performance testing and benchmarking tool for Mini-Redis. This service provides multiple benchmark scenarios to test different aspects of Redis performance including throughput, latency, concurrency, and reliability.

## 🎯 Features

- **📊 Multiple Scenarios**: Basic, stress, and pub/sub benchmark tests
- **🏊 Connection Pooling**: High-concurrency testing with configurable pool sizes
- **📈 Detailed Metrics**: Throughput, latency (avg, P99), and performance statistics
- **⚡ Concurrent Testing**: Parallel operations to test system limits
- **📡 Pub/Sub Testing**: Message publishing and subscription performance
- **🔧 Configurable**: Customizable test parameters and scenarios
- **📋 Comprehensive Reporting**: Detailed results with success/failure tracking

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies (if any)
npm install

# Run basic benchmarks (requires mini-redis-core to be running)
npm start

# Run specific scenarios
npm run basic      # Basic performance tests
npm run stress     # Stress testing
npm run pubsub     # Pub/Sub tests
npm run all        # All scenarios

# Custom configuration
node index.js basic --redis-host localhost --redis-port 6380 --pool-size 20
```

### Docker

```bash
# Build the image
docker build -t mini-redis-benchmark .

# Run basic benchmarks (requires mini-redis-core service)
docker run --rm -e REDIS_HOST=mini-redis-core mini-redis-benchmark

# Run specific scenario
docker run --rm -e REDIS_HOST=mini-redis-core mini-redis-benchmark node index.js stress

# Run all scenarios
docker run --rm -e REDIS_HOST=mini-redis-core mini-redis-benchmark node index.js all
```

## 📊 Benchmark Scenarios

### 1. Basic Performance (`basic`)

Tests fundamental Redis operations with standard parameters:

- **SET Operations**: 1,000 operations with 64-byte values
- **GET Operations**: 1,000 operations 
- **Mixed Operations**: 900 SET/GET/DEL operations
- **PING Operations**: 1,000 ping tests

**Example Output:**
```
✅ Basic SET Operations completed in 10.97s
   📈 91.19 ops/sec
   ⏱️  Average latency: 10.96ms
   🎯 P99 latency: 15.23ms
```

### 2. Stress Testing (`stress`)

High-load testing with large datasets and high concurrency:

- **High-Volume Operations**: 10,000+ operations
- **High Concurrency**: 100+ concurrent operations
- **Large Values**: 1KB and 10KB value testing
- **Sustained Load**: 30-second continuous testing
- **Memory Pressure**: 5,000 operations with TTL testing
- **Rapid Fire**: No-delay concurrent operations

### 3. Pub/Sub Testing (`pubsub`)

Message publishing and subscription performance:

- **Basic Publishing**: 1,000 messages with 64-byte payloads
- **Large Messages**: 1KB message publishing
- **Multiple Channels**: 10 channels with 100 messages each
- **High-Frequency**: Concurrent message publishing
- **JSON Messages**: Structured data publishing
- **Burst Testing**: Burst patterns with delays

## ⚙️ Configuration

### Environment Variables

- `REDIS_HOST` - Redis core service host (default: mini-redis-core)
- `REDIS_PORT` - Redis core service port (default: 6380)

### Command Line Options

```bash
node index.js [scenario] [options]

Scenarios:
  basic                       Basic performance tests (default)
  stress                      High-load stress testing
  pubsub                      Pub/Sub messaging tests
  all                         Run all benchmark scenarios

Options:
  -h, --redis-host <host>     Redis core service host
  -p, --redis-port <port>     Redis core service port
  -c, --pool-size <size>      Connection pool size (default: 10)
  --help                      Show help message
  --version                   Show version information
```

## 🏗️ Architecture

The benchmark service consists of:

- **Redis Client** (`src/redis_client.js`) - High-performance Redis connection
- **Connection Pool** (`src/redis_client.js`) - Concurrent connection management
- **Benchmark Runner** (`src/benchmark_runner.js`) - Core benchmarking engine
- **Scenarios** (`scenarios/`) - Different test scenarios
  - `basic.js` - Basic performance tests
  - `stress.js` - Stress testing scenarios
  - `pubsub.js` - Pub/Sub performance tests

## 📈 Performance Metrics

Each benchmark provides detailed metrics:

### Throughput Metrics
- **Operations per Second**: Total throughput
- **Total Operations**: Number of operations completed
- **Duration**: Total execution time

### Latency Metrics
- **Average Latency**: Mean response time
- **P99 Latency**: 99th percentile response time
- **Min/Max Latency**: Best and worst response times

### System Metrics
- **Memory Delta**: Memory usage change during test
- **Connection Stats**: Pool utilization and connection health

## 🔧 Development

### Project Structure

```
mini-redis-benchmark/
├── src/
│   ├── redis_client.js        # Redis connection and pooling
│   └── benchmark_runner.js    # Core benchmarking engine
├── scenarios/
│   ├── basic.js              # Basic performance tests
│   ├── stress.js             # Stress testing scenarios
│   └── pubsub.js             # Pub/Sub performance tests
├── index.js                  # Service entry point
├── package.json              # Dependencies
├── Dockerfile               # Container definition
└── README.md                # This file
```

### Adding New Scenarios

1. Create a new file in `scenarios/` directory
2. Export an async function that takes options
3. Use `BenchmarkRunner` to create and run tests
4. Add the scenario to the main `index.js` file

Example scenario:
```javascript
const BenchmarkRunner = require('../src/benchmark_runner');

async function runCustomBenchmarks(options = {}) {
  const runner = new BenchmarkRunner(options);
  
  try {
    await runner.initialize();
    
    await runner.runBenchmark('Custom Test', 
      () => runner.benchmarkSet({ operations: 500 })
    );
    
    return runner.generateReport();
  } finally {
    await runner.cleanup();
  }
}

module.exports = runCustomBenchmarks;
```

## 🐳 Docker Integration

This service is designed to work as part of the Mini-Redis microservices architecture:

- **mini-redis-core** - Core Redis functionality (target for benchmarks)
- **mini-redis-insight** - Web UI and monitoring
- **mini-redis-benchmark** (this service) - Performance testing

### Service Dependencies

The benchmark service requires:
1. `mini-redis-core` service to be running and accessible
2. Network connectivity to the core service
3. Proper environment variables for connection

## 📊 Example Results

```bash
🎉 BENCHMARK SUMMARY
===================
⏱️  Total Time: 45.67 seconds
✅ Successful Tests: 12
❌ Failed Tests: 0
📊 Success Rate: 100.0%

📊 Performance Summary:
   Basic SET Operations:
     - 91.19 ops/sec
     - 10.96ms avg latency
     - 15.23ms P99 latency
   Basic GET Operations:
     - 91.64 ops/sec
     - 10.91ms avg latency
     - 14.87ms P99 latency
```

## 🔒 Security

- Runs as non-root user in Docker
- No persistent data storage
- Read-only operations where possible
- Input validation and sanitization

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file for details.
