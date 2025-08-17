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
    try {
      // Connect to Redis core service first
      console.log(`🔌 Connecting to Redis core at ${this.redisHost}:${this.redisPort}...`);
      await this.redisClient.connect();
      console.log(`✅ Connected to Redis core service`);

      // Start HTTP server
      return new Promise((resolve) => {
        this.httpServer.listen(this.httpPort, () => {
          console.log(`🌐 Mini-Redis Insight HTTP server listening on 127.0.0.1:${this.httpPort}`);
          console.log(`📊 Web interface available at http://127.0.0.1:${this.httpPort}`);
          resolve();
        });
      });
    } catch (error) {
      console.error(`❌ Failed to connect to Redis core: ${error.message}`);
      console.log(`🔄 Starting HTTP server anyway (will retry Redis connection automatically)`);

      // Start HTTP server even if Redis connection fails
      return new Promise((resolve) => {
        this.httpServer.listen(this.httpPort, () => {
          console.log(`🌐 Mini-Redis Insight HTTP server listening on 127.0.0.1:${this.httpPort}`);
          console.log(`⚠️  Redis core not available - some features may be limited`);
          resolve();
        });
      });
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

  notifyWebClients() {
    const data = [];
    for (const [key, value] of this.tcpServer.kv.store.entries()) {
      const expiration = this.tcpServer.kv.expirations.get(key);
      let ttl = null;
      if (expiration) {
        const now = Date.now();
        const expirationTime = expiration._idleStart ? expiration._idleStart + expiration._idleTimeout : now + 1000;
        ttl = Math.max(0, Math.ceil((expirationTime - now) / 1000));
      }
      data.push({ key, value, ttl, type: "string", timestamp: new Date().toISOString() });
    }
    this.ws.broadcastToWebClients(JSON.stringify({ type: "data_update", data }));
  }
}

module.exports = Orchestrator;
