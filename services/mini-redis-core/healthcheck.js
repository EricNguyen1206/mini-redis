#!/usr/bin/env node

/**
 * Health check script for mini-redis-core
 * Tests the Redis server using RESP protocol
 */

const net = require('net');

function healthCheck() {
  return new Promise((resolve, reject) => {
    const client = net.connect(6380, '127.0.0.1', () => {
      // Send PING command using RESP protocol
      client.write('*1\r\n$4\r\nPING\r\n');
      
      client.on('data', (data) => {
        const response = data.toString();
        if (response.includes('+PONG')) {
          client.end();
          resolve(true);
        } else {
          client.end();
          reject(new Error(`Unexpected response: ${response}`));
        }
      });
    });

    client.on('error', (err) => {
      reject(err);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      client.destroy();
      reject(new Error('Health check timeout'));
    }, 5000);
  });
}

// Run health check
healthCheck()
  .then(() => {
    console.log('Health check passed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Health check failed:', err.message);
    process.exit(1);
  });
