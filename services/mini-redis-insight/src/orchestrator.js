const http = require("http");
const path = require("path");
const PerformanceMonitor = require("./performance_monitor");
const HttpRequestHandler = require("./http_handler");
const WebSocketHandler = require("./ws_handler");
const RedisClient = require("./redis_client");

class Orchestrator {
  /**
   *
   * @param {number} httpPort
   * @param {object} options - Configuration options
   */
  constructor(httpPort, options = {}) {
    this.httpPort = httpPort;
    this.redisHost = options.redisHost || process.env.REDIS_HOST || "mini-redis-core";
    this.redisPort = options.redisPort || process.env.REDIS_PORT || 6380;

    // Initialize Redis client
    this.redisClient = new RedisClient({
      host: this.redisHost,
      port: this.redisPort,
    });

    this.ws = new WebSocketHandler(this);
    // Initialize performance monitoring
    this.performanceMonitor = new PerformanceMonitor(this.redisClient);
    // HTTP Server for web interface
    this.httpRequestHandler = new HttpRequestHandler({
      redisClient: this.redisClient,
      notifier: this.notifyWebClients.bind(this),
      performanceMonitor: this.performanceMonitor,
      staticDir: path.resolve(__dirname, "../public"),
    });

    this.httpServer = http.createServer((req, res) => {
      this.httpRequestHandler.handleHttpRequest(req, res);
    });
    // Handle WebSocket upgrades for real-time updates
    this.httpServer.on("upgrade", (req, socket, head) => {
      this.ws.handleWebSocketUpgrade(req, socket, head);
    });

    // Forward performance metrics to web clients
    this.performanceMonitor.on("metricsUpdate", (metrics) => {
      this.ws.broadcastToWebClients(
        JSON.stringify({
          type: "performance",
          data: metrics,
        })
      );
    });
  }

  async listen() {
    // Always start HTTP server first - insight service should be available even if core is not
    console.log(`🚀 Starting Mini-Redis Insight Service...`);
    console.log(`🎯 Target Redis core: ${this.redisHost}:${this.redisPort}`);

    // Start HTTP server
    await new Promise((resolve) => {
      this.httpServer.listen(this.httpPort, () => {
        console.log(`🌐 Mini-Redis Insight HTTP server listening on 127.0.0.1:${this.httpPort}`);
        console.log(`📊 Web interface available at http://127.0.0.1:${this.httpPort}`);
        resolve();
      });
    });

    // Try to connect to Redis core service (non-blocking)
    this.connectToRedisCore();
  }

  /**
   * Attempt to connect to Redis core service with automatic retries
   */
  async connectToRedisCore() {
    try {
      console.log(`🔌 Attempting to connect to Redis core at ${this.redisHost}:${this.redisPort}...`);
      await this.redisClient.connect();
      console.log(`✅ Connected to Redis core service - full functionality available`);

      // Start performance monitoring once connected
      this.performanceMonitor.startMonitoring();
    } catch (error) {
      console.log(`⚠️  Redis core not available: ${error.message}`);
      console.log(`🔄 Web interface running in limited mode - will retry connection automatically`);
      console.log(`💡 Start the core service with: docker compose up -d mini-redis-core`);

      // The Redis client will handle automatic reconnection attempts
      // Web interface remains functional with appropriate error states
    }
  }

  async close() {
    try {
      this.performanceMonitor.stop();
    } catch {}
    try {
      this.redisClient.disconnect();
    } catch {}
    try {
      for (const sock of this.ws?.webClients || []) {
        try {
          sock.end();
        } catch {}
      }
    } finally {
      return new Promise((resolve) => this.httpServer.close(() => resolve()));
    }
  }

  async notifyWebClients() {
    try {
      if (!this.redisClient.isConnected()) {
        // If not connected to Redis core, send empty data with connection status
        this.ws.broadcastToWebClients(
          JSON.stringify({
            type: "data_update",
            data: [],
            connected: false,
            message: "Redis core service not available",
          })
        );
        return;
      }

      // Get data from Redis core via client
      const redisData = await this.redisClient.getAllData();
      const data = [];

      for (const [key, info] of Object.entries(redisData)) {
        data.push({
          key,
          value: info.value,
          ttl: info.ttl,
          type: "string",
          timestamp: new Date().toISOString(),
        });
      }

      this.ws.broadcastToWebClients(
        JSON.stringify({
          type: "data_update",
          data,
          connected: true,
        })
      );
    } catch (error) {
      console.error("Error notifying web clients:", error.message);
      this.ws.broadcastToWebClients(
        JSON.stringify({
          type: "data_update",
          data: [],
          connected: false,
          error: error.message,
        })
      );
    }
  }
}

module.exports = Orchestrator;
