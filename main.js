const net = require("net");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const MiniRedisStore = require("./store");
const PubSub = require("./pubsub");
const Client = require("./tcp_client");

const DEFAULT_PORT = Number(process.env.PORT || 6380);
const HTTP_PORT = Number(process.env.HTTP_PORT || 8080);

/** Utility: robust-ish tokenizer supporting quoted args and escaped quotes. */
function tokenize(line) {
  const tokens = [];
  let i = 0,
    cur = "",
    inQuotes = false,
    escaped = false;

  // Trim line endings
  line = line.replace(/\r?\n$/, "");

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (escaped) {
        cur += ch; // allow any escaped char as literal
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (/\s/.test(ch)) {
        if (cur.length) {
          tokens.push(cur);
          cur = "";
        }
      } else {
        cur += ch;
      }
    }
    i++;
  }
  if (cur.length) tokens.push(cur);
  return tokens;
}

/** The main server */
class MiniRedisServer {
  constructor({ port = DEFAULT_PORT, httpPort = HTTP_PORT } = {}) {
    this.port = port;
    this.httpPort = httpPort;
    this.kv = new MiniRedisStore();
    this.ps = new PubSub();
    this.webClients = new Set(); // WebSocket clients for real-time updates

    // TCP Server for Redis protocol
    this.server = net.createServer((socket) => {
      const client = new Client(socket, this);
      client.send(`* connected to mini-redis on port ${this.port}`);
    });

    // HTTP Server for web interface
    this.httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    // Handle WebSocket upgrades for real-time updates
    this.httpServer.on("upgrade", (request, socket, head) => {
      this.handleWebSocketUpgrade(request, socket, head);
    });
  }

  listen() {
    return new Promise((resolve) => {
      // Start TCP server
      this.server.listen(this.port, () => {
        console.log(`mini-redis TCP server listening on 127.0.0.1:${this.port}`);

        // Start HTTP server
        this.httpServer.listen(this.httpPort, () => {
          console.log(`mini-redis HTTP server listening on 127.0.0.1:${this.httpPort}`);
          console.log(`Web interface available at http://127.0.0.1:${this.httpPort}`);
          resolve();
        });
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.httpServer.close(() => resolve());
      });
    });
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
        default:
          res.writeHead(404);
          res.end("Not Found");
      }
    } catch (error) {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }

  // Serve static files
  serveFile(res, filename, contentType) {
    try {
      // Validate filename to prevent directory traversal
      if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
        res.writeHead(400);
        res.end("Invalid filename");
        return;
      }

      const filePath = path.join(__dirname, filename);
      // Additional safety: ensure resolved path is within __dirname
      const resolvedPath = path.resolve(filePath);
      const baseDir = path.resolve(__dirname);
      if (!resolvedPath.startsWith(baseDir)) {
        res.writeHead(400);
        res.end("Invalid file path");
        return;
      }

      const content = fs.readFileSync(filePath, "utf8");
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch (error) {
      res.writeHead(404);
      res.end("File not found");
    }
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
            this.notifyWebClients();
          },
          subscribed: new Set(),
        };

        this.handleCommand(mockClient, command);
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

  // WebSocket handling for real-time updates
  handleWebSocketUpgrade(request, socket, head) {
    const key = request.headers["sec-websocket-key"];
    const acceptKey = this.generateWebSocketAcceptKey(key);

    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n");

    socket.write(responseHeaders);

    // Add to web clients set
    this.webClients.add(socket);

    socket.on("close", () => {
      this.webClients.delete(socket);
    });

    socket.on("error", () => {
      this.webClients.delete(socket);
    });
  }

  generateWebSocketAcceptKey(key) {
    const WEBSOCKET_MAGIC_STRING = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    return crypto
      .createHash("sha1")
      .update(key + WEBSOCKET_MAGIC_STRING)
      .digest("base64");
  }

  notifyWebClients() {
    const data = [];
    for (const [key, value] of this.kv.store.entries()) {
      const expiration = this.kv.expirations.get(key);
      let ttl = null;
      if (expiration) {
        const now = Date.now();
        const expirationTime = expiration._idleStart ? expiration._idleStart + expiration._idleTimeout : now + 1000;
        ttl = Math.max(0, Math.ceil((expirationTime - now) / 1000));
      }
      data.push({ key, value, ttl, type: "string", timestamp: new Date().toISOString() });
    }

    const message = JSON.stringify({ type: "data_update", data });
    const frame = this.createWebSocketFrame(message);

    for (const client of this.webClients) {
      try {
        client.write(frame);
      } catch (error) {
        this.webClients.delete(client);
      }
    }
  }

  createWebSocketFrame(data) {
    const payload = Buffer.from(data, "utf8");
    const payloadLength = payload.length;

    let frame;
    if (payloadLength < 126) {
      frame = Buffer.allocUnsafe(2 + payloadLength);
      frame[0] = 0x81; // FIN + text frame
      frame[1] = payloadLength;
      payload.copy(frame, 2);
    } else if (payloadLength < 65536) {
      frame = Buffer.allocUnsafe(4 + payloadLength);
      frame[0] = 0x81;
      frame[1] = 126;
      frame.writeUInt16BE(payloadLength, 2);
      payload.copy(frame, 4);
    } else {
      frame = Buffer.allocUnsafe(10 + payloadLength);
      frame[0] = 0x81;
      frame[1] = 127;
      frame.writeUInt32BE(0, 2);
      frame.writeUInt32BE(payloadLength, 6);
      payload.copy(frame, 10);
    }

    return frame;
  }

  handleClientClose(client) {
    this.ps.unsubscribeAll(client);
  }

  handleCommand(client, line) {
    const args = tokenize(line);
    if (args.length === 0) return;

    const cmd = args[0].toUpperCase();
    try {
      switch (cmd) {
        case "PING": {
          client.send("PONG");
          break;
        }

        // --- Key/Value ---
        case "SET": {
          if (args.length < 3) return client.send("ERR wrong number of arguments for SET");
          const key = args[1];
          const value = args.slice(2).join(" "); // allow spaces if quoted pieces combined
          this.kv.set(key, value);
          client.send("OK");
          this.notifyWebClients(); // Notify web clients of data change
          break;
        }
        case "GET": {
          if (args.length !== 2) return client.send("ERR wrong number of arguments for GET");
          const val = this.kv.get(args[1]);
          client.send(val === null ? "(nil)" : String(val));
          break;
        }
        case "DEL": {
          if (args.length < 2) return client.send("ERR wrong number of arguments for DEL");
          const n = this.kv.del(args.slice(1));
          client.send(String(n));
          this.notifyWebClients(); // Notify web clients of data change
          break;
        }
        case "EXPIRE": {
          if (args.length !== 3) return client.send("ERR wrong number of arguments for EXPIRE");
          const key = args[1];
          const sec = Number(args[2]);
          if (!Number.isFinite(sec) || sec < 0) {
            return client.send("ERR seconds must be a non-negative number");
          }
          const result = this.kv.expire(key, sec, () => {
            // Notify web clients when key expires
            this.notifyWebClients();
          });
          client.send(String(result));
          this.notifyWebClients(); // Notify web clients of TTL change
          break;
        }

        // --- Pub/Sub ---
        case "SUBSCRIBE": {
          if (args.length < 2) return client.send("ERR wrong number of arguments for SUBSCRIBE");
          let count = client.subscribed.size;
          for (let i = 1; i < args.length; i++) {
            const ch = args[i];
            if (!client.subscribed.has(ch)) {
              client.subscribed.add(ch);
              this.ps.subscribe(client, ch);
              count++;
            }
            client.send(`subscribed ${ch} ${count}`);
          }
          break;
        }
        case "UNSUBSCRIBE": {
          // If no channels provided, unsubscribe from all
          const channels = args.length > 1 ? args.slice(1) : Array.from(client.subscribed);
          for (const ch of channels) {
            if (client.subscribed.has(ch)) {
              client.subscribed.delete(ch);
              this.ps.unsubscribe(client, ch);
            }
            const count = client.subscribed.size;
            client.send(`unsubscribed ${ch} ${count}`);
          }
          break;
        }
        case "PUBLISH": {
          if (args.length < 3) return client.send("ERR wrong number of arguments for PUBLISH");
          const channel = args[1];
          const message = args.slice(2).join(" ");
          const delivered = this.ps.publish(channel, message);
          client.send(String(delivered));
          break;
        }

        default:
          client.send(`ERR unknown command '${args[0]}'`);
      }
    } catch (err) {
      client.send("ERR " + (err && err.message ? err.message : "internal error"));
    }
  }
}

// /** Demo: start server and run a simple client interaction to showcase features */
// const { setTimeout: sleep } = require("timers/promises");
// async function runDemo(port) {
//   const demoLog = (...a) => console.log("[demo]", ...a);

//   const srv = new MiniRedisServer({ port });
//   await srv.listen();

//   // Create two demo clients using net.connect
//   const mkClient = (name) => {
//     const sock = net.connect({ host: "127.0.0.1", port }, () => {
//       demoLog(`${name} connected`);
//     });
//     sock.setEncoding("utf8");
//     sock.on("data", (d) => process.stdout.write(`[${name} <-] ${d}`));
//     sock.on("error", (e) => demoLog(`${name} error:`, e.message));
//     const send = (cmd) => {
//       demoLog(`${name} -> ${cmd}`);
//       sock.write(cmd + "\n");
//     };
//     return { send, sock };
//   };

//   const sub = mkClient("subscriber");
//   const pub = mkClient("publisher");

//   // Sequence:
//   await sleep(150);
//   sub.send("SUBSCRIBE news sport");

//   await sleep(150);
//   pub.send('SET greeting "hello world"');

//   await sleep(150);
//   pub.send("GET greeting");

//   await sleep(150);
//   pub.send("EXPIRE greeting 2");

//   await sleep(500);
//   pub.send('PUBLISH news "breaking: node.js is fun"');

//   await sleep(2500);
//   pub.send("GET greeting"); // should be (nil) after expiry

//   await sleep(150);
//   sub.send("UNSUBSCRIBE news sport");

//   await sleep(200);
//   sub.sock.end();
//   pub.sock.end();

//   await sleep(200);
//   demoLog("Demo complete. Press Ctrl+C to stop the server.");
// }

(async () => {
  const isDemo = process.argv.includes("--demo");
  const port = DEFAULT_PORT;

  if (isDemo) {
    await runDemo(port);
  } else {
    const srv = new MiniRedisServer({ port });
    await srv.listen();
  }
})();
