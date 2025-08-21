const crypto = require("crypto");
const { RESPFormatter, RESPParser } = require("./resp");

/** Represents a connected TCP client */
class TCPClient {
  constructor(socket, server) {
    this.socket = socket;
    this.server = server;
    this.id = crypto.randomUUID();
    this.buffer = "";
    this.subscribed = new Set();
    this.respParser = new RESPParser();

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("close", () => this._onClose());
    socket.on("error", (err) => {
      // Log; keep alive unless fatal
      console.error(`TCP ${this.id} error:`, err.message);
    });

    // Register socket with the I/O multiplexer for efficient writes
    if (server?.mux) {
      server.mux.registerSocket(socket);
    }
  }

  send(data, type = "bulk") {
    let response;
    if (
      typeof data === "string" &&
      (data.startsWith("+") ||
        data.startsWith("-") ||
        data.startsWith(":") ||
        data.startsWith("$") ||
        data.startsWith("*"))
    ) {
      // Already RESP formatted
      response = data;
    } else {
      // Format using RESP
      response = RESPFormatter.format(data, type);
    }

    // Use the I/O multiplexer for efficient, non-blocking writes
    if (this.server?.mux) {
      this.server.mux.enqueue(this.socket, response);
    } else {
      // Fallback to direct write if multiplexer is not available
      try {
        this.socket.write(response);
      } catch (_) {
        // ignore broken pipe
      }
    }
  }

  _onData(chunk) {
    // Feed data to RESP parser
    this.respParser.feed(chunk);

    // Process complete commands
    const commands = this.respParser.parse();
    for (const command of commands) {
      if (Array.isArray(command) && command.length > 0) {
        this.server.handleCommand(this, command);
      } else if (typeof command === "string" && command.trim().length > 0) {
        // Handle inline commands (fallback for simple text protocol)
        const args = command.trim().split(/\s+/);
        this.server.handleCommand(this, args);
      }
    }
  }

  _onClose() {
    // Ensure we remove subscriptions when client leaves
    this.server.handleClientClose(this);
  }
}

module.exports = TCPClient;
