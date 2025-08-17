const net = require('net');

/**
 * Redis Client for Mini-Redis Benchmark Service
 * 
 * High-performance Redis client optimized for benchmarking operations.
 * Supports connection pooling and concurrent operations.
 */
class RedisClient {
  constructor(options = {}) {
    this.host = options.host || process.env.REDIS_HOST || 'mini-redis-core';
    this.port = options.port || process.env.REDIS_PORT || 6380;
    this.socket = null;
    this.connected = false;
    this.commandQueue = [];
    this.responseBuffer = '';
    this.pendingCommands = 0;
  }

  /**
   * Connect to the Redis core service
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.port, this.host);

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });

      this.socket.on('data', (data) => {
        this.handleResponse(data.toString());
      });

      this.socket.on('error', (error) => {
        this.connected = false;
        reject(error);
      });

      this.socket.on('close', () => {
        this.connected = false;
      });
    });
  }

  /**
   * Handle response data from Redis core
   */
  handleResponse(data) {
    this.responseBuffer += data;
    
    // Process complete lines
    const lines = this.responseBuffer.split('\n');
    this.responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        this.processResponse(line.trim());
      }
    }
  }

  /**
   * Process a complete response line
   */
  processResponse(response) {
    if (this.commandQueue.length > 0) {
      const { resolve } = this.commandQueue.shift();
      this.pendingCommands--;
      resolve(response);
    }
  }

  /**
   * Execute a Redis command
   */
  async command(cmd) {
    if (!this.connected) {
      throw new Error('Not connected to Redis core');
    }

    return new Promise((resolve, reject) => {
      this.commandQueue.push({ resolve, reject });
      this.pendingCommands++;
      
      try {
        this.socket.write(cmd + '\n');
      } catch (error) {
        this.commandQueue.pop(); // Remove from queue on error
        this.pendingCommands--;
        reject(error);
      }
    });
  }

  /**
   * Execute multiple commands concurrently
   */
  async batchCommands(commands) {
    const promises = commands.map(cmd => this.command(cmd));
    return Promise.all(promises);
  }

  /**
   * Ping the server
   */
  async ping() {
    return this.command('PING');
  }

  /**
   * Set a key-value pair
   */
  async set(key, value) {
    return this.command(`SET ${key} ${value}`);
  }

  /**
   * Get a value by key
   */
  async get(key) {
    return this.command(`GET ${key}`);
  }

  /**
   * Delete a key
   */
  async del(key) {
    return this.command(`DEL ${key}`);
  }

  /**
   * Set key expiration
   */
  async expire(key, seconds) {
    return this.command(`EXPIRE ${key} ${seconds}`);
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel, message) {
    return this.command(`PUBLISH ${channel} ${message}`);
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel) {
    return this.command(`SUBSCRIBE ${channel}`);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      connected: this.connected,
      pendingCommands: this.pendingCommands,
      queueLength: this.commandQueue.length
    };
  }

  /**
   * Close the connection
   */
  disconnect() {
    if (this.socket) {
      this.socket.end();
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }
}

/**
 * Redis Connection Pool for high-concurrency benchmarks
 */
class RedisConnectionPool {
  constructor(options = {}) {
    this.host = options.host || process.env.REDIS_HOST || 'mini-redis-core';
    this.port = options.port || process.env.REDIS_PORT || 6380;
    this.poolSize = options.poolSize || 10;
    this.connections = [];
    this.currentIndex = 0;
  }

  /**
   * Initialize the connection pool
   */
  async initialize() {
    const connectionPromises = [];
    
    for (let i = 0; i < this.poolSize; i++) {
      const client = new RedisClient({ host: this.host, port: this.port });
      connectionPromises.push(client.connect().then(() => client));
    }

    this.connections = await Promise.all(connectionPromises);
    console.log(`✅ Initialized Redis connection pool with ${this.poolSize} connections`);
  }

  /**
   * Get the next available connection (round-robin)
   */
  getConnection() {
    const connection = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return connection;
  }

  /**
   * Execute a command using the pool
   */
  async command(cmd) {
    const connection = this.getConnection();
    return connection.command(cmd);
  }

  /**
   * Execute multiple commands concurrently across the pool
   */
  async batchCommands(commands) {
    const promises = commands.map(cmd => {
      const connection = this.getConnection();
      return connection.command(cmd);
    });
    return Promise.all(promises);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      poolSize: this.poolSize,
      connections: this.connections.map(conn => conn.getStats())
    };
  }

  /**
   * Close all connections in the pool
   */
  async close() {
    for (const connection of this.connections) {
      connection.disconnect();
    }
    this.connections = [];
  }
}

module.exports = { RedisClient, RedisConnectionPool };
