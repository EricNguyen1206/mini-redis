const zlib = require("zlib");
const { promisify } = require("util");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Advanced message handler for large payloads with chunking and compression
 */
class MessageHandler {
  constructor(options = {}) {
    this.options = {
      maxChunkSize: options.maxChunkSize || 8192, // 8KB chunks
      compressionThreshold: options.compressionThreshold || 1024, // 1KB threshold
      compressionLevel: options.compressionLevel || 6, // zlib compression level
      enableChunking: options.enableChunking !== false, // Enable by default
      enableCompression: options.enableCompression !== false, // Enable by default
      chunkTimeout: options.chunkTimeout || 30000, // 30s timeout for chunk assembly
      ...options,
    };

    // Track chunked messages being assembled
    this.chunkAssembly = new Map(); // messageId -> { chunks: Map, totalChunks, receivedChunks, timestamp }

    // Cleanup timer for stale chunk assemblies
    this.cleanupTimer = setInterval(() => this._cleanupStaleChunks(), 10000);
  }

  /**
   * Process outgoing message - compress and/or chunk if needed
   */
  async processOutgoingMessage(message, options = {}) {
    let processedMessage = message;
    let metadata = {
      original: true,
      compressed: false,
      chunked: false,
      totalSize: Buffer.byteLength(message, "utf8"),
    };

    // Apply compression if message is large enough
    if (
      this.options.enableCompression &&
      metadata.totalSize >= this.options.compressionThreshold &&
      !options.noCompression
    ) {
      try {
        const compressed = await gzip(Buffer.from(message, "utf8"), {
          level: this.options.compressionLevel,
        });

        // Only use compression if it provides significant savings
        if (compressed.length < metadata.totalSize * 0.8) {
          processedMessage = compressed.toString("base64");
          metadata.compressed = true;
          metadata.compressedSize = compressed.length;
          metadata.compressionRatio = compressed.length / metadata.totalSize;
        }
      } catch (err) {
        // Compression failed, use original message
        console.warn("Message compression failed:", err.message);
      }
    }

    // Apply chunking if message is still too large
    const currentSize = Buffer.byteLength(processedMessage, "utf8");
    if (this.options.enableChunking && currentSize > this.options.maxChunkSize && !options.noChunking) {
      const chunks = this._chunkMessage(processedMessage, metadata);
      metadata.chunked = true;
      metadata.totalChunks = chunks.length;

      return { chunks, metadata };
    }

    return { message: processedMessage, metadata };
  }

  /**
   * Process incoming message - decompress and/or assemble chunks if needed
   */
  async processIncomingMessage(data, messageId = null) {
    try {
      // Check if this is a chunked message
      if (data.startsWith("CHUNK:")) {
        return await this._handleChunkedMessage(data, messageId);
      }

      // Check if this is a compressed message
      if (data.startsWith("COMPRESSED:")) {
        return await this._handleCompressedMessage(data.substring(11));
      }

      // Regular message
      return { message: data, complete: true };
    } catch (err) {
      throw new Error(`Message processing failed: ${err.message}`);
    }
  }

  /**
   * Create chunks from a large message
   */
  _chunkMessage(message, metadata) {
    const messageId = this._generateMessageId();
    const chunks = [];
    const chunkSize = this.options.maxChunkSize - 100; // Reserve space for headers

    for (let i = 0; i < message.length; i += chunkSize) {
      const chunkData = message.substring(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      const totalChunks = Math.ceil(message.length / chunkSize);

      const chunkMessage = `CHUNK:${messageId}:${chunkIndex}:${totalChunks}:${chunkData}`;
      chunks.push(chunkMessage);
    }

    return chunks;
  }

  /**
   * Handle incoming chunked message
   */
  async _handleChunkedMessage(chunkData, clientId) {
    const parts = chunkData.split(":");
    if (parts.length < 5) {
      throw new Error("Invalid chunk format");
    }

    const messageId = parts[1];
    const chunkIndex = parseInt(parts[2]);
    const totalChunks = parseInt(parts[3]);
    const data = parts.slice(4).join(":"); // Rejoin in case data contains colons

    const assemblyKey = `${clientId || "unknown"}_${messageId}`;

    // Initialize chunk assembly if not exists
    if (!this.chunkAssembly.has(assemblyKey)) {
      this.chunkAssembly.set(assemblyKey, {
        chunks: new Map(),
        totalChunks,
        receivedChunks: 0,
        timestamp: Date.now(),
      });
    }

    const assembly = this.chunkAssembly.get(assemblyKey);

    // Add chunk if not already received
    if (!assembly.chunks.has(chunkIndex)) {
      assembly.chunks.set(chunkIndex, data);
      assembly.receivedChunks++;
    }

    // Check if all chunks received
    if (assembly.receivedChunks === assembly.totalChunks) {
      // Assemble complete message
      let completeMessage = "";
      for (let i = 0; i < assembly.totalChunks; i++) {
        completeMessage += assembly.chunks.get(i) || "";
      }

      // Clean up
      this.chunkAssembly.delete(assemblyKey);

      // Check if assembled message is compressed
      if (completeMessage.startsWith("COMPRESSED:")) {
        const decompressed = await this._handleCompressedMessage(completeMessage.substring(11));
        return { message: decompressed.message, complete: true, chunked: true, compressed: true };
      }

      return { message: completeMessage, complete: true, chunked: true };
    }

    // Message not yet complete
    return {
      message: null,
      complete: false,
      progress: assembly.receivedChunks / assembly.totalChunks,
    };
  }

  /**
   * Handle compressed message
   */
  async _handleCompressedMessage(compressedData) {
    try {
      const buffer = Buffer.from(compressedData, "base64");
      const decompressed = await gunzip(buffer);
      return { message: decompressed.toString("utf8"), compressed: true };
    } catch (err) {
      throw new Error(`Decompression failed: ${err.message}`);
    }
  }

  /**
   * Generate unique message ID
   */
  _generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Clean up stale chunk assemblies
   */
  _cleanupStaleChunks() {
    const now = Date.now();
    const staleThreshold = this.options.chunkTimeout;

    for (const [key, assembly] of this.chunkAssembly.entries()) {
      if (now - assembly.timestamp > staleThreshold) {
        this.chunkAssembly.delete(key);
      }
    }
  }

  /**
   * Get statistics about message processing
   */
  getStats() {
    return {
      activeChunkAssemblies: this.chunkAssembly.size,
      options: { ...this.options },
    };
  }

  /**
   * Cleanup method for graceful shutdown
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.chunkAssembly.clear();
  }
}

module.exports = MessageHandler;
