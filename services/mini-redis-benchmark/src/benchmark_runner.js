const { RedisClient, RedisConnectionPool } = require('./redis_client');

/**
 * Comprehensive benchmark runner for Mini-Redis
 * 
 * Provides various benchmark scenarios to test different aspects
 * of Redis performance including throughput, latency, and concurrency.
 */
class BenchmarkRunner {
  constructor(options = {}) {
    this.host = options.host || process.env.REDIS_HOST || 'mini-redis-core';
    this.port = options.port || process.env.REDIS_PORT || 6380;
    this.poolSize = options.poolSize || 10;
    this.pool = null;
    this.results = [];
  }

  /**
   * Initialize the benchmark runner
   */
  async initialize() {
    console.log(`🚀 Initializing Mini-Redis Benchmark Runner`);
    console.log(`🔌 Target: ${this.host}:${this.port}`);
    console.log(`🏊 Pool Size: ${this.poolSize} connections`);
    console.log('');

    this.pool = new RedisConnectionPool({
      host: this.host,
      port: this.port,
      poolSize: this.poolSize
    });

    await this.pool.initialize();
  }

  /**
   * Run a single benchmark scenario
   */
  async runBenchmark(name, testFunction, options = {}) {
    console.log(`📊 Running benchmark: ${name}`);
    
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    try {
      const result = await testFunction(options);
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      
      const duration = (endTime - startTime) / 1000; // seconds
      const memoryDelta = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024; // MB
      
      const benchmarkResult = {
        name,
        success: true,
        duration,
        memoryDelta,
        ...result
      };
      
      this.results.push(benchmarkResult);
      this.printBenchmarkResult(benchmarkResult);
      
      return benchmarkResult;
    } catch (error) {
      const errorResult = {
        name,
        success: false,
        error: error.message,
        duration: (Date.now() - startTime) / 1000
      };
      
      this.results.push(errorResult);
      console.log(`❌ ${name} failed: ${error.message}`);
      
      return errorResult;
    }
  }

  /**
   * Print benchmark result
   */
  printBenchmarkResult(result) {
    if (result.success) {
      console.log(`✅ ${result.name} completed in ${result.duration.toFixed(2)}s`);
      if (result.operationsPerSecond) {
        console.log(`   📈 ${result.operationsPerSecond.toFixed(2)} ops/sec`);
      }
      if (result.averageLatency) {
        console.log(`   ⏱️  Average latency: ${result.averageLatency.toFixed(2)}ms`);
      }
      if (result.p99Latency) {
        console.log(`   🎯 P99 latency: ${result.p99Latency.toFixed(2)}ms`);
      }
      if (result.memoryDelta) {
        console.log(`   💾 Memory delta: ${result.memoryDelta.toFixed(2)}MB`);
      }
    }
    console.log('');
  }

  /**
   * Basic SET operations benchmark
   */
  async benchmarkSet(options = {}) {
    const operations = options.operations || 1000;
    const keyPrefix = options.keyPrefix || 'benchmark_set';
    const valueSize = options.valueSize || 64;
    
    const value = 'x'.repeat(valueSize);
    const latencies = [];
    
    console.log(`   🔧 ${operations} SET operations with ${valueSize}-byte values`);
    
    for (let i = 0; i < operations; i++) {
      const start = Date.now();
      await this.pool.command(`SET ${keyPrefix}_${i} ${value}`);
      const latency = Date.now() - start;
      latencies.push(latency);
    }
    
    return this.calculateStats(operations, latencies);
  }

  /**
   * Basic GET operations benchmark
   */
  async benchmarkGet(options = {}) {
    const operations = options.operations || 1000;
    const keyPrefix = options.keyPrefix || 'benchmark_get';
    const valueSize = options.valueSize || 64;
    
    // Pre-populate keys
    const value = 'x'.repeat(valueSize);
    for (let i = 0; i < operations; i++) {
      await this.pool.command(`SET ${keyPrefix}_${i} ${value}`);
    }
    
    console.log(`   🔍 ${operations} GET operations`);
    
    const latencies = [];
    for (let i = 0; i < operations; i++) {
      const start = Date.now();
      await this.pool.command(`GET ${keyPrefix}_${i}`);
      const latency = Date.now() - start;
      latencies.push(latency);
    }
    
    return this.calculateStats(operations, latencies);
  }

  /**
   * Mixed operations benchmark (SET/GET/DEL)
   */
  async benchmarkMixed(options = {}) {
    const operations = options.operations || 900; // 300 each
    const keyPrefix = options.keyPrefix || 'benchmark_mixed';
    const valueSize = options.valueSize || 64;
    
    const value = 'x'.repeat(valueSize);
    const latencies = [];
    const opsPerType = Math.floor(operations / 3);
    
    console.log(`   🔄 ${operations} mixed operations (SET/GET/DEL)`);
    
    // SET operations
    for (let i = 0; i < opsPerType; i++) {
      const start = Date.now();
      await this.pool.command(`SET ${keyPrefix}_${i} ${value}`);
      latencies.push(Date.now() - start);
    }
    
    // GET operations
    for (let i = 0; i < opsPerType; i++) {
      const start = Date.now();
      await this.pool.command(`GET ${keyPrefix}_${i}`);
      latencies.push(Date.now() - start);
    }
    
    // DEL operations
    for (let i = 0; i < opsPerType; i++) {
      const start = Date.now();
      await this.pool.command(`DEL ${keyPrefix}_${i}`);
      latencies.push(Date.now() - start);
    }
    
    return this.calculateStats(operations, latencies);
  }

  /**
   * Concurrent operations benchmark
   */
  async benchmarkConcurrent(options = {}) {
    const operations = options.operations || 1000;
    const concurrency = options.concurrency || 50;
    const keyPrefix = options.keyPrefix || 'benchmark_concurrent';
    const valueSize = options.valueSize || 64;
    
    const value = 'x'.repeat(valueSize);
    console.log(`   ⚡ ${operations} concurrent SET operations (${concurrency} concurrent)`);
    
    const promises = [];
    const latencies = [];
    
    for (let i = 0; i < operations; i++) {
      const promise = (async () => {
        const start = Date.now();
        await this.pool.command(`SET ${keyPrefix}_${i} ${value}`);
        const latency = Date.now() - start;
        latencies.push(latency);
      })();
      
      promises.push(promise);
      
      // Control concurrency
      if (promises.length >= concurrency) {
        await Promise.all(promises.splice(0, concurrency));
      }
    }
    
    // Wait for remaining promises
    if (promises.length > 0) {
      await Promise.all(promises);
    }
    
    return this.calculateStats(operations, latencies);
  }

  /**
   * Pub/Sub benchmark
   */
  async benchmarkPubSub(options = {}) {
    const messages = options.messages || 100;
    const channel = options.channel || 'benchmark_channel';
    const messageSize = options.messageSize || 256;
    
    const message = 'x'.repeat(messageSize);
    console.log(`   📡 ${messages} pub/sub messages (${messageSize} bytes each)`);
    
    const latencies = [];
    
    for (let i = 0; i < messages; i++) {
      const start = Date.now();
      await this.pool.command(`PUBLISH ${channel} ${message}_${i}`);
      const latency = Date.now() - start;
      latencies.push(latency);
    }
    
    return this.calculateStats(messages, latencies);
  }

  /**
   * Calculate performance statistics
   */
  calculateStats(operations, latencies) {
    const totalTime = latencies.reduce((sum, lat) => sum + lat, 0) / 1000; // seconds
    const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    
    // Calculate P99 latency
    const sortedLatencies = latencies.sort((a, b) => a - b);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);
    const p99Latency = sortedLatencies[p99Index] || 0;
    
    return {
      operations,
      operationsPerSecond: operations / (totalTime || 0.001),
      averageLatency,
      p99Latency,
      minLatency: Math.min(...latencies),
      maxLatency: Math.max(...latencies)
    };
  }

  /**
   * Generate comprehensive benchmark report
   */
  generateReport() {
    console.log('\n📋 BENCHMARK REPORT');
    console.log('==================');
    
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    
    console.log(`✅ Successful benchmarks: ${successful.length}`);
    console.log(`❌ Failed benchmarks: ${failed.length}`);
    console.log('');
    
    if (successful.length > 0) {
      console.log('📊 Performance Summary:');
      successful.forEach(result => {
        console.log(`   ${result.name}:`);
        if (result.operationsPerSecond) {
          console.log(`     - ${result.operationsPerSecond.toFixed(2)} ops/sec`);
        }
        if (result.averageLatency) {
          console.log(`     - ${result.averageLatency.toFixed(2)}ms avg latency`);
        }
        if (result.p99Latency) {
          console.log(`     - ${result.p99Latency.toFixed(2)}ms P99 latency`);
        }
      });
    }
    
    if (failed.length > 0) {
      console.log('\n❌ Failed Benchmarks:');
      failed.forEach(result => {
        console.log(`   ${result.name}: ${result.error}`);
      });
    }
    
    return {
      successful: successful.length,
      failed: failed.length,
      results: this.results
    };
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.pool) {
      await this.pool.close();
    }
  }
}

module.exports = BenchmarkRunner;
