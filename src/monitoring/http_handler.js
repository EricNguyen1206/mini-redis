const fs = require("fs");
const path = require("path");

class HttpRequestHandler {
  constructor({ core, notifier, performanceMonitor, staticDir }) {
    this.core = core;
    this.kv = core.kv;
    this.ps = core.ps;
    this.performanceMonitor = performanceMonitor;
    this.notify = notifier;
    this.staticDir = staticDir;
  }

  serveFile(res, filename, contentType) {
    try {
      const resolved = path.resolve(this.staticDir, filename);
      if (!resolved.startsWith(path.resolve(this.staticDir))) {
        res.writeHead(400);
        return res.end("Invalid path");
      }
      const content = fs.readFileSync(resolved, "utf8");
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  }

  handleApiCommand(req, res) {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const { command } = JSON.parse(body);

        // Create a mock client for API commands
        const mockClient = {
          send: (response) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: true,
                response,
                timestamp: new Date().toISOString(),
              })
            );

            // Notify WebSocket clients of data changes
            this.notify();
          },
          subscribed: new Set(),
        };

        this.core.handleCommand(mockClient, command);
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
          })
        );
      }
    });
  }

  // API endpoint handlers
  handleApiData(req, res) {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    const data = [];
    for (const [key, value] of this.kv.store.entries()) {
      const expiration = this.kv.expirations.get(key);
      let ttl = null;
      if (expiration) {
        // Calculate remaining TTL in seconds
        // Note: Node.js timeout objects don't have _idleStart/_idleTimeout in all versions
        // We'll use a simpler approach by storing expiration time
        const now = Date.now();
        const expirationTime = expiration._idleStart ? expiration._idleStart + expiration._idleTimeout : now + 1000; // fallback to 1 second if properties not available
        ttl = Math.max(0, Math.ceil((expirationTime - now) / 1000));
      }
      data.push({
        key,
        value,
        ttl,
        type: "string",
        timestamp: new Date().toISOString(),
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  handleApiPubSub(req, res) {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    const channels = [];
    for (const [channel, clients] of this.ps.channels.entries()) {
      channels.push({
        channel,
        subscribers: clients.size,
        timestamp: new Date().toISOString(),
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(channels));
  }

  handleApiPerformance(req, res) {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    // Get current performance metrics
    const metrics = this.performanceMonitor.getMetrics();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(metrics));
  }

  // HTTP request handler
  handleHttpRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      switch (url.pathname) {
        case "/":
          this.serveFile(res, "index.html", "text/html");
          break;
        case "/api/data":
          this.handleApiData(req, res);
          break;
        case "/api/command":
          this.handleApiCommand(req, res);
          break;
        case "/api/pubsub":
          this.handleApiPubSub(req, res);
          break;
        case "/api/performance":
          this.handleApiPerformance(req, res);
          break;
        default:
          res.writeHead(404);
          res.end("Not Found");
      }
    } catch (error) {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }
}

module.exports = HttpRequestHandler;
