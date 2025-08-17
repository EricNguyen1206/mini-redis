const { performance } = require("perf_hooks");
const EventEmitter = require("events");

/**
 * Real-time performance monitoring system for mini-redis insight service
 * Monitors Redis core service via client connection
 */
class PerformanceMonitor extends EventEmitter {
  constructor(redisClient) {
    super();
    this.redisClient = redisClient;
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
    console.log("🚀 Starting Real-time Performance Monitoring for Insight Service");

    // Start periodic metric updates
    this.metricsUpdateTimer = setInterval(async () => {
      await this.updateMetrics();
      this.emit("metricsUpdate", this.getMetrics());
    }, this.updateInterval);

    console.log("✅ Performance monitoring started");
  }

  /**
   * Update metrics by fetching from Redis client
   */
  async updateMetrics() {
    try {
      if (this.redisClient && this.redisClient.isConnected()) {
        // Get metrics from Redis client
        const clientMetrics = await this.redisClient.getPerformanceMetrics();

        // Update our metrics with client data
        this.metrics = {
          ...this.metrics,
          ...clientMetrics,
        };
      } else {
        // Use default metrics when disconnected
        this.metrics = this.getDefaultMetrics();
      }

      // Update system metrics
      this.updateSystemMetrics();
    } catch (error) {
      console.error("Error updating metrics:", error.message);
      this.metrics = this.getDefaultMetrics();
    }
  }

  /**
   * Update system-level metrics
   */
  updateSystemMetrics() {
    this.metrics.system.uptime = Date.now() - this.startTime;
    this.metrics.system.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    this.metrics.system.connections = this.redisClient && this.redisClient.isConnected() ? 1 : 0;
  }

  /**
   * Get default metrics when Redis core is unavailable
   */
  getDefaultMetrics() {
    return {
      cache: {
        requestsPerSecond: 0,
        latencyP99: 0,
        hitRate: 0,
        totalRequests: 0,
      },
      pubsub: {
        messagesPublishedPerSecond: 0,
        messagesConsumedPerSecond: 0,
        latencyP99: 0,
        totalPublished: 0,
        totalConsumed: 0,
      },
      system: {
        connections: 0,
        uptime: Date.now() - this.startTime,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      },
    };
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
