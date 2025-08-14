const crypto = require("crypto");

/** Represents a connected TCP client */
class Client {
  constructor(socket, server) {
    this.socket = socket;
    this.server = server;
    this.id = crypto.randomUUID();
    this.buffer = "";
    this.subscribed = new Set();

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("close", () => this._onClose());
    socket.on("error", (err) => {
      // Could log; keep alive unless fatal
      // console.error(`Client ${this.id} error:`, err.message);
    });
  }

  send(line) {
    try {
      this.socket.write(line + "\n");
    } catch (_) {
      // ignore broken pipe
    }
  }

  _onData(chunk) {
    this.buffer += chunk;
    // Process complete lines
    let idx;
    while ((idx = this.buffer.search(/\r?\n/)) !== -1) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + (this.buffer[idx] === "\r" ? 2 : 1));
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      this.server.handleCommand(this, trimmed);
    }
  }

  _onClose() {
    // Ensure we remove subscriptions when client leaves
    this.server.handleClientClose(this);
  }
}

module.exports = Client;
