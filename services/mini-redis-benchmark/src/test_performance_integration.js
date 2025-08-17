const net = require('net');
const http = require('http');

/**
 * Test script to demonstrate the real-time performance monitoring system
 */
class PerformanceIntegrationTest {
  constructor() {
    this.serverPort = 6380;
    this.httpPort = 8080;
  }

  async runTest() {
    console.log('🧪 Testing Performance Monitoring Integration\n');
    
    try {
      // Test 1: Verify API endpoint
      await this.testPerformanceAPI();
      
      // Test 2: Generate cache operations and verify metrics
      await this.testCacheMetrics();
      
      // Test 3: Generate pub/sub operations and verify metrics
      await this.testPubSubMetrics();
      
      // Test 4: Verify real-time updates
      await this.testRealTimeUpdates();
      
      console.log('✅ All performance monitoring tests passed!');
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }
  }

  async testPerformanceAPI() {
    console.log('📊 Test 1: Performance API Endpoint');
    
    const response = await this.makeHttpRequest('/api/performance');
    const data = JSON.parse(response);
    
    // Verify structure
    if (!data.cache || !data.pubsub || !data.system) {
      throw new Error('Invalid performance data structure');
    }
    
    // Verify cache metrics
    const requiredCacheFields = ['requestsPerSecond', 'latencyP99', 'hitRate', 'totalRequests'];
    for (const field of requiredCacheFields) {
      if (typeof data.cache[field] !== 'number') {
        throw new Error(`Missing or invalid cache field: ${field}`);
      }
    }
    
    // Verify pub/sub metrics
    const requiredPubSubFields = ['messagesPublishedPerSecond', 'messagesConsumedPerSecond', 'latencyP99', 'totalPublished', 'totalConsumed'];
    for (const field of requiredPubSubFields) {
      if (typeof data.pubsub[field] !== 'number') {
        throw new Error(`Missing or invalid pub/sub field: ${field}`);
      }
    }
    
    // Verify system metrics
    const requiredSystemFields = ['connections', 'uptime', 'memoryUsage'];
    for (const field of requiredSystemFields) {
      if (typeof data.system[field] !== 'number') {
        throw new Error(`Missing or invalid system field: ${field}`);
      }
    }
    
    console.log('   ✅ API endpoint structure is valid');
    console.log(`   📈 Current metrics: ${data.cache.totalRequests} cache requests, ${data.pubsub.totalPublished} messages published\n`);
  }

  async testCacheMetrics() {
    console.log('💾 Test 2: Cache Performance Metrics');
    
    // Get baseline metrics
    const baseline = JSON.parse(await this.makeHttpRequest('/api/performance'));
    
    // Perform cache operations
    const client = await this.createTcpClient();
    
    for (let i = 0; i < 10; i++) {
      await this.sendCommand(client, `SET test_key_${i} value_${i}`);
      await this.sendCommand(client, `GET test_key_${i}`);
    }
    
    client.destroy();
    
    // Wait for metrics to update
    await this.sleep(2000);
    
    // Get updated metrics
    const updated = JSON.parse(await this.makeHttpRequest('/api/performance'));
    
    // Verify metrics increased
    if (updated.cache.totalRequests <= baseline.cache.totalRequests) {
      throw new Error('Cache request count did not increase');
    }
    
    if (updated.cache.requestsPerSecond < 0) {
      throw new Error('Invalid requests per second value');
    }
    
    console.log('   ✅ Cache metrics updated correctly');
    console.log(`   📊 Requests: ${baseline.cache.totalRequests} → ${updated.cache.totalRequests}`);
    console.log(`   ⚡ RPS: ${updated.cache.requestsPerSecond.toFixed(2)}, Latency P99: ${updated.cache.latencyP99.toFixed(2)}ms\n`);
  }

  async testPubSubMetrics() {
    console.log('📡 Test 3: Pub/Sub Performance Metrics');
    
    // Get baseline metrics
    const baseline = JSON.parse(await this.makeHttpRequest('/api/performance'));
    
    // Perform pub/sub operations
    const client = await this.createTcpClient();
    
    for (let i = 0; i < 5; i++) {
      await this.sendCommand(client, `PUBLISH test_channel_${i} "Test message ${i}"`);
    }
    
    client.destroy();
    
    // Wait for metrics to update
    await this.sleep(2000);
    
    // Get updated metrics
    const updated = JSON.parse(await this.makeHttpRequest('/api/performance'));
    
    // Verify metrics increased
    if (updated.pubsub.totalPublished <= baseline.pubsub.totalPublished) {
      throw new Error('Pub/sub message count did not increase');
    }
    
    console.log('   ✅ Pub/sub metrics updated correctly');
    console.log(`   📊 Published: ${baseline.pubsub.totalPublished} → ${updated.pubsub.totalPublished}`);
    console.log(`   ⚡ Pub/Sub RPS: ${updated.pubsub.messagesPublishedPerSecond.toFixed(2)}, Latency P99: ${updated.pubsub.latencyP99.toFixed(2)}ms\n`);
  }

  async testRealTimeUpdates() {
    console.log('🔄 Test 4: Real-time Metric Updates');
    
    // Take multiple samples to verify metrics are updating
    const samples = [];
    
    for (let i = 0; i < 3; i++) {
      const response = await this.makeHttpRequest('/api/performance');
      const data = JSON.parse(response);
      samples.push(data.timestamp);
      
      if (i < 2) {
        await this.sleep(1000); // Wait 1 second between samples
      }
    }
    
    // Verify timestamps are different (metrics are updating)
    if (samples[0] === samples[1] || samples[1] === samples[2]) {
      throw new Error('Metrics timestamps are not updating');
    }
    
    console.log('   ✅ Real-time updates are working');
    console.log(`   🕐 Sample timestamps: ${samples.map(t => new Date(t).toLocaleTimeString()).join(' → ')}\n`);
  }

  createTcpClient() {
    return new Promise((resolve, reject) => {
      const client = net.connect(this.serverPort, '127.0.0.1');
      client.setEncoding('utf8');
      
      client.on('connect', () => {
        resolve(client);
      });
      
      client.on('error', reject);
      
      // Skip the welcome message
      client.once('data', () => {});
    });
  }

  sendCommand(client, command) {
    return new Promise((resolve) => {
      client.write(command + '\n');
      client.once('data', resolve);
    });
  }

  makeHttpRequest(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: this.httpPort,
        path: path,
        method: 'GET'
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  const tester = new PerformanceIntegrationTest();
  tester.runTest().catch(console.error);
}

module.exports = PerformanceIntegrationTest;
