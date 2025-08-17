const http = require("http");
const path = require("path");
const PerformanceMonitor = require("./performance_monitor");
const HttpRequestHandler = require("./http_handler");
const WebSocketHandler = require("./ws_handler");
/** @typedef {import('../core/tcp_server')} TCPServer */

class Orchestrator {
  /**
   *
   * @param {number} httpPort
   * @param {TCPServer} tcpServer
   */
  constructor(httpPort, tcpServer) {
    this.tcpServer = tcpServer;
    this.httpPort = httpPort;

    this.ws = new WebSocketHandler(this);
    // Initialize performance monitoring
    this.performanceMonitor = new PerformanceMonitor(this.tcpServer);
    // HTTP Server for web interface
    this.httpRequestHandler = new HttpRequestHandler({
      core: this.tcpServer,
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

  listen() {
    return new Promise((resolve) => {
      // Start HTTP server
      this.httpServer.listen(this.httpPort, () => {
        console.log(`mini-redis HTTP server listening on 127.0.0.1:${this.httpPort}`);
        console.log(`Web interface available at http://127.0.0.1:${this.httpPort}`);
        resolve();
      });
    });
  }

  async close() {
    try {
      this.performanceMonitor.stop();
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
