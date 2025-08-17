const net = require("net");
const KeyValueStore = require("./store");
const PubSub = require("./pubsub");
const Client = require("./tcp_client");
const { IOMultiplexer } = require("./io_multiflexing");
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
      client.send(`* connected to mini-redis on port ${this.port}`);
    });
  }

  listen() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`mini-redis listening on 127.0.0.1:${this.port}`);
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
            // Optionally notify subscribers of a special channel, or ignore.
            // For simplicity, we do nothing here.
          });
          client.send(String(result));
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

module.exports = TCPServer;
