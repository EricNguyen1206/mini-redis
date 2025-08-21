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
    this.startTime = Date.now(); // Track server start time for INFO command
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

        // --- Connection/Authentication ---
        case "AUTH": {
          // mini-redis-core doesn't implement authentication, but we accept any AUTH attempt
          // to maintain compatibility with Redis clients like RedisInsight
          if (args.length === 1) {
            // AUTH with no password - Redis requires at least one argument
            client.send("ERR wrong number of arguments for 'AUTH' command", "error");
          } else if (args.length === 2) {
            // AUTH password - accept any password since no auth is implemented
            client.send("OK", "simple");
          } else if (args.length === 3) {
            // AUTH username password (Redis 6+ ACL format) - accept any credentials
            client.send("OK", "simple");
          } else {
            client.send("ERR wrong number of arguments for 'AUTH' command", "error");
          }
          break;
        }

        case "SELECT": {
          // mini-redis-core only supports database 0 (single database)
          if (args.length !== 2) {
            return client.send("ERR wrong number of arguments for 'SELECT' command", "error");
          }
          const dbIndex = parseInt(args[1], 10);
          if (isNaN(dbIndex)) {
            return client.send("ERR value is not an integer or out of range", "error");
          }
          if (dbIndex === 0) {
            client.send("OK", "simple");
          } else {
            client.send("ERR DB index is out of range", "error");
          }
          break;
        }

        case "INFO": {
          // Return minimal server information for Redis client compatibility
          const uptime = Math.floor((Date.now() - this.startTime) / 1000);
          const info = [
            "# Server",
            "redis_version:7.0.0-mini-redis",
            "redis_git_sha1:00000000",
            "redis_git_dirty:0",
            "redis_build_id:mini-redis-core",
            "redis_mode:standalone",
            "os:Linux",
            "arch_bits:64",
            "multiplexing_api:epoll",
            "atomicvar_api:atomic-builtin",
            "gcc_version:0.0.0",
            "process_id:1",
            "run_id:mini-redis-" + Math.random().toString(36).substr(2, 9),
            `tcp_port:${this.port}`,
            `uptime_in_seconds:${uptime}`,
            `uptime_in_days:${Math.floor(uptime / 86400)}`,
            "",
            "# Clients",
            "connected_clients:1",
            "client_recent_max_input_buffer:0",
            "client_recent_max_output_buffer:0",
            "",
            "# Memory",
            "used_memory:1048576",
            "used_memory_human:1.00M",
            "used_memory_rss:2097152",
            "used_memory_rss_human:2.00M",
            "used_memory_peak:1048576",
            "used_memory_peak_human:1.00M",
            "",
            "# Stats",
            "total_connections_received:1",
            "total_commands_processed:1",
            "instantaneous_ops_per_sec:0",
            "total_net_input_bytes:0",
            "total_net_output_bytes:0",
            "instantaneous_input_kbps:0.00",
            "instantaneous_output_kbps:0.00",
            "",
            "# Replication",
            "role:master",
            "connected_slaves:0",
            "",
            "# CPU",
            "used_cpu_sys:0.00",
            "used_cpu_user:0.00",
            "used_cpu_sys_children:0.00",
            "used_cpu_user_children:0.00",
            "",
            "# Keyspace",
            "db0:keys=0,expires=0,avg_ttl=0",
          ].join("\r\n");

          // Handle optional section parameter
          if (args.length > 1) {
            const section = String(args[1]).toLowerCase();
            if (
              section === "server" ||
              section === "memory" ||
              section === "stats" ||
              section === "replication" ||
              section === "cpu" ||
              section === "keyspace" ||
              section === "clients"
            ) {
              // For simplicity, return full info regardless of section
              // A more complete implementation would filter by section
              client.send(info, "bulk");
            } else {
              client.send("", "bulk"); // Empty response for unknown sections
            }
          } else {
            client.send(info, "bulk");
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

        case "SCAN": {
          // SCAN cursor [MATCH pattern] [COUNT count]
          if (args.length < 2) {
            return client.send("ERR wrong number of arguments for 'SCAN' command", "error");
          }

          // Parse cursor
          const cursorArg = String(args[1]);
          let cursor = parseInt(cursorArg, 10);
          if (isNaN(cursor) || cursor < 0) {
            return client.send("ERR invalid cursor", "error");
          }

          // Parse optional arguments
          let pattern = "*";
          let count = 10; // Default count

          for (let i = 2; i < args.length; i += 2) {
            const option = String(args[i]).toUpperCase();
            if (i + 1 >= args.length) {
              return client.send(`ERR syntax error`, "error");
            }

            if (option === "MATCH") {
              pattern = String(args[i + 1]);
            } else if (option === "COUNT") {
              const countArg = parseInt(args[i + 1], 10);
              if (isNaN(countArg) || countArg <= 0) {
                return client.send("ERR value is not an integer or out of range", "error");
              }
              count = countArg;
            } else {
              return client.send(`ERR syntax error`, "error");
            }
          }

          // Get all matching keys
          const allKeys = this.kv.keys(pattern);

          // Handle cursor-based pagination
          const startIndex = cursor;
          const endIndex = Math.min(startIndex + count, allKeys.length);
          const keysSlice = allKeys.slice(startIndex, endIndex);

          // Calculate next cursor
          let nextCursor = 0; // 0 indicates end of iteration
          if (endIndex < allKeys.length) {
            nextCursor = endIndex;
          }

          // Return [next_cursor, [keys...]]
          const result = [String(nextCursor), keysSlice];
          client.send(result, "array");
          break;
        }

        case "DBSIZE": {
          // Return the number of keys in the database
          const allKeys = this.kv.keys("*");
          client.send(allKeys.length, "integer");
          break;
        }

        case "TYPE": {
          // Return the type of a key (mini-redis only supports strings)
          if (args.length !== 2) {
            return client.send("ERR wrong number of arguments for 'TYPE' command", "error");
          }
          const key = String(args[1]);
          const value = this.kv.get(key);
          if (value === null) {
            client.send("none", "simple");
          } else {
            client.send("string", "simple");
          }
          break;
        }

        case "CLIENT": {
          // Handle CLIENT subcommands
          if (args.length < 2) {
            return client.send("ERR wrong number of arguments for 'CLIENT' command", "error");
          }
          const subcommand = String(args[1]).toUpperCase();

          if (subcommand === "SETNAME") {
            // CLIENT SETNAME connection-name
            if (args.length !== 3) {
              return client.send("ERR wrong number of arguments for 'CLIENT SETNAME' command", "error");
            }
            // Accept any client name (we don't actually store it)
            client.send("OK", "simple");
          } else if (subcommand === "GETNAME") {
            // CLIENT GETNAME - return null since we don't store names
            client.send(null, "bulk");
          } else if (subcommand === "LIST") {
            // CLIENT LIST - return minimal client info
            const clientInfo =
              "id=1 addr=127.0.0.1:0 fd=1 name= age=0 idle=0 flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=0 obl=0 oll=0 omem=0 events=r cmd=client";
            client.send(clientInfo, "bulk");
          } else {
            client.send(`ERR unknown subcommand '${subcommand}'. Try CLIENT HELP.`, "error");
          }
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
          // Enhanced error reporting for unknown commands
          const commandName = args[0] ? String(args[0]).toUpperCase() : "UNKNOWN";
          console.log(`⚠️  Unknown command received: '${commandName}' with ${args.length - 1} arguments`);
          if (args.length > 1) {
            console.log(
              `   Arguments: ${args
                .slice(1)
                .map((arg) => `'${arg}'`)
                .join(", ")}`
            );
          }
          client.send(
            `ERR unknown command '${commandName}', with args beginning with: ${args
              .slice(1, 4)
              .map((arg) => `'${arg}'`)
              .join(", ")}`,
            "error"
          );
      }
    } catch (err) {
      // Enhanced error handling with more debugging information
      const commandName = args && args[0] ? String(args[0]).toUpperCase() : "UNKNOWN";
      const errorMessage = err && err.message ? err.message : "internal error";
      console.error(`❌ Error processing command '${commandName}':`, errorMessage);
      console.error(`   Stack trace:`, err.stack);
      client.send(`ERR ${errorMessage}`, "error");
    }
  }
}

module.exports = TCPServer;
