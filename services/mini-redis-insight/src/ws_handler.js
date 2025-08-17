const crypto = require("crypto");

class WebSocketHandler {
  constructor(server) {
    this.server = server;
    this.webClients = new Set();
  }

  /**
   * Generate the WebSocket Accept Key from the client's Sec-WebSocket-Key header
   * @param {string} key - The Sec-WebSocket-Key header from the client's handshake request
   * Step 1: Create a SHA-1 hash object.<br>
   * Step 2: Update the hash object with the concatenation of the client's Sec-WebSocket-Key header and the WebSocket GUID.<br>
   * Step 3: Calculate the SHA-1 hash of the concatenated string.<br>
   * Step 4: Encode the hash as a base64 string.<br>
   * @return {string} The WebSocket Accept Key in Sec-WebSocket-Accept format
   */
  generateWebSocketAcceptKey(key) {
    const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // WebSocket Global Unique Identifier
    return crypto
      .createHash("sha1")
      .update(key + WEBSOCKET_GUID)
      .digest("base64");
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

  broadcastToWebClients(message) {
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
}

module.exports = WebSocketHandler;
