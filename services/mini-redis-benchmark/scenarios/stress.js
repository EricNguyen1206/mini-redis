/**
 * Stress Test Benchmark Scenario
 * 
 * High-load testing with large datasets, high concurrency,
 * and extended duration to test system limits and stability.
 */

const BenchmarkRunner = require('../src/benchmark_runner');

async function runStressBenchmarks(options = {}) {
  const runner = new BenchmarkRunner({
    ...options,
    poolSize: options.poolSize || 20 // Larger pool for stress testing
  });
  
  try {
    await runner.initialize();
    
    console.log('💪 STRESS TEST BENCHMARK');
    console.log('========================\n');
    
    // High-volume SET operations
    await runner.runBenchmark('High-Volume SET Operations', 
      () => runner.benchmarkSet({ 
        operations: 10000, 
        valueSize: 64,
        keyPrefix: 'stress_set'
      })
    );
    
    // High-volume GET operations
    await runner.runBenchmark('High-Volume GET Operations',
      () => runner.benchmarkGet({ 
        operations: 10000, 
        valueSize: 64,
        keyPrefix: 'stress_get'
      })
    );
    
    // High concurrency test
    await runner.runBenchmark('High Concurrency Operations',
      () => runner.benchmarkConcurrent({ 
        operations: 5000, 
        concurrency: 100,
        valueSize: 64,
        keyPrefix: 'stress_concurrent'
      })
    );
    
    // Large value test
    await runner.runBenchmark('Large Value Operations',
      () => runner.benchmarkSet({ 
        operations: 1000, 
        valueSize: 1024, // 1KB values
        keyPrefix: 'stress_large'
      })
    );
    
    // Very large value test
    await runner.runBenchmark('Very Large Value Operations',
      () => runner.benchmarkSet({ 
        operations: 100, 
        valueSize: 10240, // 10KB values
        keyPrefix: 'stress_xlarge'
      })
    );
    
    // Sustained load test
    await runner.runBenchmark('Sustained Load Test',
      async () => {
        const duration = 30; // 30 seconds
        const operations = [];
        const latencies = [];
        
        console.log(`   ⏰ Sustained load for ${duration} seconds`);
        
        const startTime = Date.now();
        let operationCount = 0;
        
        while ((Date.now() - startTime) < duration * 1000) {
          const opStart = Date.now();
          await runner.pool.command(`SET sustained_${operationCount} value_${operationCount}`);
          latencies.push(Date.now() - opStart);
          operationCount++;
          
          // Small delay to prevent overwhelming
          if (operationCount % 100 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
        }
        
        return runner.calculateStats(operationCount, latencies);
      }
    );
    
    // Memory pressure test
    await runner.runBenchmark('Memory Pressure Test',
      async () => {
        const operations = 5000;
        const valueSize = 512; // 512 bytes
        const latencies = [];
        
        console.log(`   💾 ${operations} operations with ${valueSize}-byte values (memory pressure)`);
        
        // Create many keys to test memory usage
        for (let i = 0; i < operations; i++) {
          const start = Date.now();
          const value = `memory_test_${'x'.repeat(valueSize)}_${i}`;
          await runner.pool.command(`SET memory_key_${i} ${value}`);
          latencies.push(Date.now() - start);
          
          // Set expiration on some keys to test TTL handling under load
          if (i % 10 === 0) {
            await runner.pool.command(`EXPIRE memory_key_${i} 60`);
          }
        }
        
        return runner.calculateStats(operations, latencies);
      }
    );
    
    // Rapid fire operations
    await runner.runBenchmark('Rapid Fire Operations',
      async () => {
        const operations = 2000;
        const latencies = [];
        
        console.log(`   🔥 ${operations} rapid-fire operations (no delays)`);
        
        const promises = [];
        for (let i = 0; i < operations; i++) {
          const promise = (async () => {
            const start = Date.now();
            await runner.pool.command(`SET rapid_${i} value_${i}`);
            latencies.push(Date.now() - start);
          })();
          promises.push(promise);
        }
        
        await Promise.all(promises);
        return runner.calculateStats(operations, latencies);
      }
    );
    
    return runner.generateReport();
    
  } finally {
    await runner.cleanup();
  }
}

module.exports = runStressBenchmarks;

// Run if called directly
if (require.main === module) {
  runStressBenchmarks()
    .then(report => {
      console.log('\n💪 Stress test completed!');
      process.exit(report.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Stress test failed:', error.message);
      process.exit(1);
    });
}
