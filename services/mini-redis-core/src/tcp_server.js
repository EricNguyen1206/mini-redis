const net = require("net");
const KeyValueStore = require("./store");
const PubSub = require("./pubsub");
const Client = require("./tcp_client");
const { IOMultiplexer } = require("./io_multiflexing");
const { RESPFormatter } = require("./resp");
const DEFAULT_PORT = Number(process.env.PORT || 6380);

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
class TCPServer {
  constructor({ port = DEFAULT_PORT } = {}) {
    this.port = port;
    this.kv = new KeyValueStore();
    this.mux = new IOMultiplexer(); // I/O multiplexer for efficient socket writes
    this.ps = new PubSub(this.mux);
    this.server = net.createServer((socket) => {
      const client = new Client(socket, this);
      // Don't send connection message for Redis compatibility
    });
  }

  listen() {
    return new Promise((resolve) => {
      this.server.listen(this.port, "0.0.0.0", () => {
        console.log(`mini-redis listening on 0.0.0.0:${this.port}`);
        resolve();
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  handleClientClose(client) {
    this.ps.unsubscribeAll(client);
  }

  handleCommand(client, args) {
    // Handle both array format (from RESP) and string format (from tokenize)
    if (typeof args === "string") {
      args = tokenize(args);
    }

    if (!Array.isArray(args) || args.length === 0) return;

    const cmd = String(args[0]).toUpperCase();
    try {
      switch (cmd) {
        case "PING": {
          if (args.length === 1) {
            client.send("PONG", "simple");
          } else {
            client.send(args[1], "bulk");
          }
          break;
        }

        // --- Key/Value ---
        case "SET": {
          if (args.length < 3) return client.send("ERR wrong number of arguments for 'SET' command", "error");
          const key = String(args[1]);
          const value = String(args[2]);
          this.kv.set(key, value);
          client.send("OK", "simple");
          break;
        }
        case "GET": {
          if (args.length !== 2) return client.send("ERR wrong number of arguments for 'GET' command", "error");
          const val = this.kv.get(String(args[1]));
          client.send(val, "bulk"); // null will be formatted as $-1\r\n
          break;
        }
        case "DEL": {
          if (args.length < 2) return client.send("ERR wrong number of arguments for 'DEL' command", "error");
          const keys = args.slice(1).map((k) => String(k));
          const n = this.kv.del(keys);
          client.send(n, "integer");
          break;
        }
        case "EXISTS": {
          if (args.length < 2) return client.send("ERR wrong number of arguments for 'EXISTS' command", "error");
          const keys = args.slice(1).map((k) => String(k));
          let count = 0;
          for (const key of keys) {
            if (this.kv.get(key) !== null) count++;
          }
          client.send(count, "integer");
          break;
        }
        case "TTL": {
          if (args.length !== 2) return client.send("ERR wrong number of arguments for 'TTL' command", "error");
          const key = String(args[1]);
          const ttl = this.kv.ttl(key);
          client.send(ttl, "integer");
          break;
        }
        case "EXPIRE": {
          if (args.length !== 3) return client.send("ERR wrong number of arguments for 'EXPIRE' command", "error");
          const key = String(args[1]);
          const sec = Number(args[2]);
          if (!Number.isFinite(sec) || sec < 0) {
            return client.send("ERR value is not an integer or out of range", "error");
          }
          const result = this.kv.expire(key, sec, () => {
            // Optionally notify subscribers of a special channel, or ignore.
            // For simplicity, we do nothing here.
          });
          client.send(result, "integer");
          break;
        }
        case "KEYS": {
          if (args.length !== 2) return client.send("ERR wrong number of arguments for 'KEYS' command", "error");
          const pattern = String(args[1]);
          const keys = this.kv.keys(pattern);
          client.send(keys, "array");
          break;
        }

        // --- Pub/Sub ---
        case "SUBSCRIBE": {
          if (args.length < 2) return client.send("ERR wrong number of arguments for 'SUBSCRIBE' command", "error");
          for (let i = 1; i < args.length; i++) {
            const ch = String(args[i]);
            if (!client.subscribed.has(ch)) {
              client.subscribed.add(ch);
              this.ps.subscribe(client, ch);
            }
            const count = client.subscribed.size;
            // RESP array format for subscription confirmation
            client.send(["subscribe", ch, count], "array");
          }
          break;
        }
        case "UNSUBSCRIBE": {
          // If no channels provided, unsubscribe from all
          const channels = args.length > 1 ? args.slice(1).map((ch) => String(ch)) : Array.from(client.subscribed);
          for (const ch of channels) {
            if (client.subscribed.has(ch)) {
              client.subscribed.delete(ch);
              this.ps.unsubscribe(client, ch);
            }
            const count = client.subscribed.size;
            // RESP array format for unsubscription confirmation
            client.send(["unsubscribe", ch, count], "array");
          }
          break;
        }
        case "PUBLISH": {
          if (args.length < 3) return client.send("ERR wrong number of arguments for 'PUBLISH' command", "error");
          const channel = String(args[1]);
          const message = String(args[2]);
          const delivered = this.ps.publish(channel, message);
          client.send(delivered, "integer");
          break;
        }

        default:
          client.send(`ERR unknown command '${args[0]}'`, "error");
      }
    } catch (err) {
      client.send("ERR " + (err && err.message ? err.message : "internal error"), "error");
    }
  }
}

module.exports = TCPServer;
