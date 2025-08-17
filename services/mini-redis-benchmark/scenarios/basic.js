/**
 * Basic Performance Benchmark Scenario
 * 
 * Tests fundamental Redis operations with standard parameters
 * to establish baseline performance metrics.
 */

const BenchmarkRunner = require('../src/benchmark_runner');

async function runBasicBenchmarks(options = {}) {
  const runner = new BenchmarkRunner(options);
  
  try {
    await runner.initialize();
    
    console.log('🎯 BASIC PERFORMANCE BENCHMARK');
    console.log('==============================\n');
    
    // Basic SET operations
    await runner.runBenchmark('Basic SET Operations', 
      () => runner.benchmarkSet({ operations: 1000, valueSize: 64 })
    );
    
    // Basic GET operations
    await runner.runBenchmark('Basic GET Operations',
      () => runner.benchmarkGet({ operations: 1000, valueSize: 64 })
    );
    
    // Mixed operations
    await runner.runBenchmark('Mixed Operations (SET/GET/DEL)',
      () => runner.benchmarkMixed({ operations: 900, valueSize: 64 })
    );
    
    // PING test
    await runner.runBenchmark('PING Operations',
      async () => {
        const operations = 1000;
        const latencies = [];
        
        console.log(`   🏓 ${operations} PING operations`);
        
        for (let i = 0; i < operations; i++) {
          const start = Date.now();
          await runner.pool.command('PING');
          latencies.push(Date.now() - start);
        }
        
        return runner.calculateStats(operations, latencies);
      }
    );
    
    return runner.generateReport();
    
  } finally {
    await runner.cleanup();
  }
}

module.exports = runBasicBenchmarks;

// Run if called directly
if (require.main === module) {
  runBasicBenchmarks()
    .then(report => {
      console.log('\n🎉 Basic benchmark completed!');
      process.exit(report.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Benchmark failed:', error.message);
      process.exit(1);
    });
}
