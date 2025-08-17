const fs = require("fs");
const path = require("path");

class HttpRequestHandler {
  constructor({ redisClient, notifier, performanceMonitor, staticDir }) {
    this.redisClient = redisClient;
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

  async handleApiCommand(req, res) {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const { command } = JSON.parse(body);

        if (!this.redisClient.isConnected()) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "Redis core service is not available",
            })
          );
          return;
        }

        // Execute command via Redis client
        const response = await this.redisClient.command(command);

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
  async handleApiData(req, res) {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    try {
      if (!this.redisClient.isConnected()) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Redis core service is not available",
          })
        );
        return;
      }

      const data = await this.redisClient.getAllData();
      const formattedData = [];

      for (const [key, info] of Object.entries(data)) {
        formattedData.push({
          key,
          value: info.value,
          ttl: info.ttl,
          type: "string",
          timestamp: new Date().toISOString(),
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedData));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: error.message,
        })
      );
    }
  }

  async handleApiPubSub(req, res) {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    try {
      // For now, return empty channels since we don't have direct access to pub/sub state
      // In a real implementation, this could be enhanced with Redis commands to get channel info
      const channels = [];

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(channels));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: error.message,
        })
      );
    }
  }

  async handleApiPerformance(req, res) {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    try {
      // Get performance metrics from Redis client
      const metrics = await this.redisClient.getPerformanceMetrics();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(metrics));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: error.message,
        })
      );
    }
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
