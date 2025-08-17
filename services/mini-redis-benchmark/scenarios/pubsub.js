/**
 * Pub/Sub Benchmark Scenario
 * 
 * Tests publish/subscribe functionality with various message sizes,
 * channel counts, and subscriber patterns.
 */

const BenchmarkRunner = require('../src/benchmark_runner');

async function runPubSubBenchmarks(options = {}) {
  const runner = new BenchmarkRunner({
    ...options,
    poolSize: options.poolSize || 15 // Moderate pool for pub/sub testing
  });
  
  try {
    await runner.initialize();
    
    console.log('📡 PUB/SUB BENCHMARK');
    console.log('===================\n');
    
    // Basic publish operations
    await runner.runBenchmark('Basic PUBLISH Operations', 
      () => runner.benchmarkPubSub({ 
        messages: 1000, 
        messageSize: 64,
        channel: 'basic_channel'
      })
    );
    
    // Small message publishing
    await runner.runBenchmark('Small Message Publishing',
      () => runner.benchmarkPubSub({ 
        messages: 2000, 
        messageSize: 32,
        channel: 'small_msg_channel'
      })
    );
    
    // Large message publishing
    await runner.runBenchmark('Large Message Publishing',
      () => runner.benchmarkPubSub({ 
        messages: 500, 
        messageSize: 1024, // 1KB messages
        channel: 'large_msg_channel'
      })
    );
    
    // Multiple channels test
    await runner.runBenchmark('Multiple Channels Publishing',
      async () => {
        const channels = 10;
        const messagesPerChannel = 100;
        const messageSize = 128;
        const latencies = [];
        
        console.log(`   📻 ${messagesPerChannel} messages to ${channels} channels`);
        
        for (let ch = 0; ch < channels; ch++) {
          for (let msg = 0; msg < messagesPerChannel; msg++) {
            const start = Date.now();
            const message = 'x'.repeat(messageSize);
            await runner.pool.command(`PUBLISH channel_${ch} ${message}_${msg}`);
            latencies.push(Date.now() - start);
          }
        }
        
        return runner.calculateStats(channels * messagesPerChannel, latencies);
      }
    );
    
    // High-frequency publishing
    await runner.runBenchmark('High-Frequency Publishing',
      async () => {
        const messages = 1000;
        const messageSize = 64;
        const channel = 'high_freq_channel';
        const latencies = [];
        
        console.log(`   ⚡ ${messages} high-frequency messages`);
        
        const promises = [];
        for (let i = 0; i < messages; i++) {
          const promise = (async () => {
            const start = Date.now();
            const message = 'x'.repeat(messageSize);
            await runner.pool.command(`PUBLISH ${channel} ${message}_${i}`);
            latencies.push(Date.now() - start);
          })();
          promises.push(promise);
          
          // Control concurrency to simulate high frequency
          if (promises.length >= 50) {
            await Promise.all(promises.splice(0, 25));
          }
        }
        
        if (promises.length > 0) {
          await Promise.all(promises);
        }
        
        return runner.calculateStats(messages, latencies);
      }
    );
    
    // JSON message publishing
    await runner.runBenchmark('JSON Message Publishing',
      async () => {
        const messages = 500;
        const channel = 'json_channel';
        const latencies = [];
        
        console.log(`   📄 ${messages} JSON messages`);
        
        for (let i = 0; i < messages; i++) {
          const jsonMessage = JSON.stringify({
            id: i,
            timestamp: Date.now(),
            data: {
              user: `user_${i}`,
              action: 'test_action',
              metadata: {
                source: 'benchmark',
                version: '1.0.0'
              }
            },
            payload: 'x'.repeat(100) // Some payload data
          });
          
          const start = Date.now();
          await runner.pool.command(`PUBLISH ${channel} ${jsonMessage}`);
          latencies.push(Date.now() - start);
        }
        
        return runner.calculateStats(messages, latencies);
      }
    );
    
    // Burst publishing test
    await runner.runBenchmark('Burst Publishing Test',
      async () => {
        const bursts = 10;
        const messagesPerBurst = 100;
        const burstDelay = 100; // ms between bursts
        const messageSize = 64;
        const latencies = [];
        
        console.log(`   💥 ${bursts} bursts of ${messagesPerBurst} messages each`);
        
        for (let burst = 0; burst < bursts; burst++) {
          const burstPromises = [];
          
          for (let msg = 0; msg < messagesPerBurst; msg++) {
            const promise = (async () => {
              const start = Date.now();
              const message = 'x'.repeat(messageSize);
              await runner.pool.command(`PUBLISH burst_channel ${message}_${burst}_${msg}`);
              latencies.push(Date.now() - start);
            })();
            burstPromises.push(promise);
          }
          
          await Promise.all(burstPromises);
          
          // Delay between bursts
          if (burst < bursts - 1) {
            await new Promise(resolve => setTimeout(resolve, burstDelay));
          }
        }
        
        return runner.calculateStats(bursts * messagesPerBurst, latencies);
      }
    );
    
    // Subscribe operations test
    await runner.runBenchmark('SUBSCRIBE Operations',
      async () => {
        const subscriptions = 100;
        const latencies = [];
        
        console.log(`   📥 ${subscriptions} SUBSCRIBE operations`);
        
        for (let i = 0; i < subscriptions; i++) {
          const start = Date.now();
          await runner.pool.command(`SUBSCRIBE test_channel_${i}`);
          latencies.push(Date.now() - start);
        }
        
        return runner.calculateStats(subscriptions, latencies);
      }
    );
    
    return runner.generateReport();
    
  } finally {
    await runner.cleanup();
  }
}

module.exports = runPubSubBenchmarks;

// Run if called directly
if (require.main === module) {
  runPubSubBenchmarks()
    .then(report => {
      console.log('\n📡 Pub/Sub benchmark completed!');
      process.exit(report.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Pub/Sub benchmark failed:', error.message);
      process.exit(1);
    });
}
