const { performance } = require("perf_hooks");
const EventEmitter = require("events");

/**
 * Real-time performance monitoring system for mini-redis
 * Integrates with IOMultiplexer and PubSub to provide live metrics
 */
class PerformanceMonitor extends EventEmitter {
  constructor(server) {
    super();
    this.server = server;
    this.startTime = Date.now();

    // Performance metrics storage
    this.metrics = {
      cache: {
        requestsPerSecond: 0,
        totalRequests: 0,
        latencyP99: 0,
        hitRate: 0,
        hits: 0,
        misses: 0,
        recentLatencies: [],
        recentRequests: [],
      },
      pubsub: {
        messagesPublishedPerSecond: 0,
        messagesConsumedPerSecond: 0,
        totalPublished: 0,
        totalConsumed: 0,
        latencyP99: 0,
        recentPublishLatencies: [],
        recentConsumeLatencies: [],
        recentPublished: [],
        recentConsumed: [],
      },
      system: {
        connections: 0,
        uptime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
      },
    };

    // Rolling window configuration (60 seconds)
    this.windowSize = 60000; // 60 seconds in milliseconds
    this.updateInterval = 1000; // Update every second

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Start the performance monitoring system
   */
  startMonitoring() {
    console.log("🚀 Starting Real-time Performance Monitoring");

    // Hook into server events for cache operations
    this.hookCacheOperations();

    // Hook into pub/sub operations
    this.hookPubSubOperations();

    // Hook into IOMultiplexer events
    this.hookIOMultiplexerEvents();

    // Start periodic metric updates
    this.metricsUpdateTimer = setInterval(() => {
      this.updateMetrics();
      this.emit("metricsUpdate", this.getMetrics());
    }, this.updateInterval);

    console.log("✅ Performance monitoring started");
  }

  /**
   * Hook into cache operations to track performance
   */
  hookCacheOperations() {
    if (!this.server) return;

    // Store original handleCommand method
    const originalHandleCommand = this.server.handleCommand.bind(this.server);

    // Override handleCommand to track cache operations
    this.server.handleCommand = (client, line) => {
      const startTime = performance.now();
      const args = this.tokenize(line);
      const cmd = args[0]?.toUpperCase();

      // Track cache commands
      if (["GET", "SET", "DEL", "EXPIRE"].includes(cmd)) {
        this.trackCacheRequest(cmd, startTime);
      }

      // Call original method
      let result;
      try {
        result = originalHandleCommand(client, line);
      } catch (error) {
        // Track failed request
        if (["GET", "SET", "DEL", "EXPIRE"].includes(cmd)) {
          this.trackCacheCompletion(cmd, startTime, false);
        }
        throw error;
      }

      // Track completion
      if (["GET", "SET", "DEL", "EXPIRE"].includes(cmd)) {
        this.trackCacheCompletion(cmd, startTime, true);
      }

      return result;
    };
  }

  /**
   * Hook into pub/sub operations to track performance
   */
  hookPubSubOperations() {
    if (!this.server?.ps) return;

    // Store original publish method
    const originalPublish = this.server.ps.publish.bind(this.server.ps);

    // Override publish to track performance
    this.server.ps.publish = (channel, message, options = {}) => {
      const startTime = performance.now();

      // Call original method
      const result = originalPublish(channel, message, options);

      // Track publish metrics
      this.trackPublishOperation(startTime, result);

      return result;
    };

    // Store original subscribe method
    const originalSubscribe = this.server.ps.subscribe.bind(this.server.ps);

    // Override subscribe to track subscriptions
    this.server.ps.subscribe = (client, channel, priority = "normal") => {
      const result = originalSubscribe(client, channel, priority);
      this.trackSubscription(channel);
      return result;
    };
  }

  /**
   * Hook into IOMultiplexer events for system metrics
   */
  hookIOMultiplexerEvents() {
    if (!this.server?.mux) return;

    // Listen to IOMultiplexer events
    this.server.mux.on("socketRegistered", (socket, connectionCount) => {
      this.metrics.system.connections = connectionCount;
    });

    this.server.mux.on("socketDisconnected", (socket, connectionCount) => {
      this.metrics.system.connections = connectionCount;
    });

    this.server.mux.on("broadcastComplete", (stats) => {
      this.trackBroadcastMetrics(stats);
    });

    this.server.mux.on("backpressure", (socket, queueSize) => {
      // Track backpressure events for performance analysis
      this.trackBackpressure(queueSize);
    });
  }

  /**
   * Track cache request
   */
  trackCacheRequest(cmd, startTime) {
    this.metrics.cache.totalRequests++;
    this.metrics.cache.recentRequests.push({
      timestamp: Date.now(),
      command: cmd,
      startTime,
    });
  }

  /**
   * Track cache completion
   */
  trackCacheCompletion(cmd, startTime) {
    const latency = performance.now() - startTime;
    this.metrics.cache.recentLatencies.push({
      timestamp: Date.now(),
      latency,
      command: cmd,
    });

    // Track hits/misses for GET commands
    // Track hits/misses for GET commands
    // This needs to be moved to where we have access to the result
    // or passed as a parameter to this method
  }

  /**
   * Track publish operation
   */
  trackPublishOperation(startTime, subscriberCount) {
    const latency = performance.now() - startTime;
    this.metrics.pubsub.totalPublished++;
    this.metrics.pubsub.recentPublishLatencies.push({
      timestamp: Date.now(),
      latency,
    });
    this.metrics.pubsub.recentPublished.push({
      timestamp: Date.now(),
      subscriberCount,
    });
  }

  /**
   * Track subscription
   */
  trackSubscription(channel) {
    this.metrics.pubsub.totalConsumed++;
    this.metrics.pubsub.recentConsumed.push({
      timestamp: Date.now(),
      channel,
    });
  }

  /**
   * Track broadcast metrics
   */
  trackBroadcastMetrics(stats) {
    // Update metrics based on broadcast statistics
    if (stats.duration) {
      this.metrics.pubsub.recentPublishLatencies.push({
        timestamp: Date.now(),
        latency: stats.duration,
      });
    }
  }

  /**
   * Track backpressure events
   */
  trackBackpressure(queueSize) {
    // Could be used for performance analysis
    // For now, just log significant backpressure
    if (queueSize > 100) {
      console.warn(`⚠️ High queue size detected: ${queueSize}`);
    }
  }

  /**
   * Update calculated metrics
   */
  updateMetrics() {
    const now = Date.now();
    const windowStart = now - this.windowSize;

    // Clean old data
    this.cleanOldData(windowStart);

    // Calculate cache metrics
    this.calculateCacheMetrics(windowStart, now);

    // Calculate pub/sub metrics
    this.calculatePubSubMetrics(windowStart, now);

    // Calculate system metrics
    this.calculateSystemMetrics();
  }

  /**
   * Clean old data outside the rolling window
   */
  cleanOldData(windowStart) {
    this.metrics.cache.recentLatencies = this.metrics.cache.recentLatencies.filter(
      (item) => item.timestamp > windowStart
    );
    this.metrics.cache.recentRequests = this.metrics.cache.recentRequests.filter(
      (item) => item.timestamp > windowStart
    );
    this.metrics.pubsub.recentPublishLatencies = this.metrics.pubsub.recentPublishLatencies.filter(
      (item) => item.timestamp > windowStart
    );
    this.metrics.pubsub.recentConsumeLatencies = this.metrics.pubsub.recentConsumeLatencies.filter(
      (item) => item.timestamp > windowStart
    );
    this.metrics.pubsub.recentPublished = this.metrics.pubsub.recentPublished.filter(
      (item) => item.timestamp > windowStart
    );
    this.metrics.pubsub.recentConsumed = this.metrics.pubsub.recentConsumed.filter(
      (item) => item.timestamp > windowStart
    );
  }

  /**
   * Calculate cache performance metrics
   */
  calculateCacheMetrics(windowStart, now) {
    const windowDuration = (now - windowStart) / 1000; // seconds

    // Requests per second
    this.metrics.cache.requestsPerSecond = this.metrics.cache.recentRequests.length / windowDuration;

    // P99 latency
    if (this.metrics.cache.recentLatencies.length > 0) {
      const sortedLatencies = this.metrics.cache.recentLatencies.map((item) => item.latency).sort((a, b) => a - b);
      const p99Index = Math.min(Math.floor(sortedLatencies.length * 0.99), sortedLatencies.length - 1);
      this.metrics.cache.latencyP99 = sortedLatencies[p99Index] || 0;
    }

    // Hit rate
    const totalCacheOps = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = totalCacheOps > 0 ? (this.metrics.cache.hits / totalCacheOps) * 100 : 0;
  }

  /**
   * Calculate pub/sub performance metrics
   */
  calculatePubSubMetrics(windowStart, now) {
    const windowDuration = (now - windowStart) / 1000; // seconds

    // Messages per second
    this.metrics.pubsub.messagesPublishedPerSecond = this.metrics.pubsub.recentPublished.length / windowDuration;
    this.metrics.pubsub.messagesConsumedPerSecond = this.metrics.pubsub.recentConsumed.length / windowDuration;

    // P99 latency for publishing
    if (this.metrics.pubsub.recentPublishLatencies.length > 0) {
      const sortedLatencies = this.metrics.pubsub.recentPublishLatencies
        .map((item) => item.latency)
        .sort((a, b) => a - b);
      const p99Index = Math.floor(sortedLatencies.length * 0.99);
      this.metrics.pubsub.latencyP99 = sortedLatencies[p99Index] || 0;
    }
  }

  /**
   * Calculate system metrics
   */
  calculateSystemMetrics() {
    this.metrics.system.uptime = Date.now() - this.startTime;

    // Get memory usage
    const memUsage = process.memoryUsage();
    this.metrics.system.memoryUsage = memUsage.heapUsed / 1024 / 1024; // MB
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      cache: {
        requestsPerSecond: Math.round(this.metrics.cache.requestsPerSecond * 100) / 100,
        latencyP99: Math.round(this.metrics.cache.latencyP99 * 100) / 100,
        hitRate: Math.round(this.metrics.cache.hitRate * 100) / 100,
        totalRequests: this.metrics.cache.totalRequests,
      },
      pubsub: {
        messagesPublishedPerSecond: Math.round(this.metrics.pubsub.messagesPublishedPerSecond * 100) / 100,
        messagesConsumedPerSecond: Math.round(this.metrics.pubsub.messagesConsumedPerSecond * 100) / 100,
        latencyP99: Math.round(this.metrics.pubsub.latencyP99 * 100) / 100,
        totalPublished: this.metrics.pubsub.totalPublished,
        totalConsumed: this.metrics.pubsub.totalConsumed,
      },
      system: {
        connections: this.metrics.system.connections,
        uptime: this.metrics.system.uptime,
        memoryUsage: Math.round(this.metrics.system.memoryUsage * 100) / 100,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Tokenize command line (simplified version)
   */
  tokenize(line) {
    return line.trim().split(/\s+/);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.metricsUpdateTimer) {
      clearInterval(this.metricsUpdateTimer);
    }
    console.log("🛑 Performance monitoring stopped");
  }
}

module.exports = PerformanceMonitor;
