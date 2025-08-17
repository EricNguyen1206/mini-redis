// Advanced I/O multiplexer using Node's nonblocking sockets + backpressure.
// Manages per-socket queues with batching, prioritization, and performance monitoring.

const EventEmitter = require("events");
const MessageHandler = require("./message_handler");

class IOMultiplexer extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration options
    this.options = {
      batchSize: options.batchSize || 10, // Max messages to batch per flush
      batchTimeout: options.batchTimeout || 5, // Max ms to wait before flushing batch
      maxQueueSize: options.maxQueueSize || 1000, // Max queued messages per socket
      priorityLevels: options.priorityLevels || 3, // Number of priority levels (0=highest)
      compressionThreshold: options.compressionThreshold || 1024, // Compress messages larger than this
      ...options,
    };

    // Core data structures
    this.queues = new Map(); // socket -> { priority: [messages], normal: [messages], low: [messages] }
    this.flushing = new WeakSet(); // sockets currently flushing
    this.batchTimers = new Map(); // socket -> timer for batch flushing
    this.socketMetrics = new Map(); // socket -> performance metrics
    this.connectionHealth = new Map(); // socket -> health status

    // Global metrics
    this.globalMetrics = {
      totalMessages: 0,
      totalBytes: 0,
      batchedMessages: 0,
      droppedMessages: 0,
      compressionSavings: 0,
      avgLatency: 0,
      peakConnections: 0,
      startTime: Date.now(),
    };

    // Message handler for large payloads
    this.messageHandler = new MessageHandler({
      maxChunkSize: options.maxChunkSize || 8192,
      compressionThreshold: options.compressionThreshold || this.options.compressionThreshold,
      enableChunking: options.enableChunking !== false,
      enableCompression: options.enableCompression !== false,
    });

    // Periodic cleanup and health monitoring
    this.healthCheckInterval = setInterval(() => this._performHealthCheck(), 30000);
    this.metricsReportInterval = setInterval(() => this._reportMetrics(), 60000);
  }

  registerSocket(socket) {
    if (this.queues.has(socket)) return; // Already registered

    // Initialize priority queues for this socket
    this.queues.set(socket, {
      priority: [], // High priority messages (system messages, errors)
      normal: [], // Normal priority messages (regular pub/sub)
      low: [], // Low priority messages (metrics, heartbeats)
    });

    // Initialize socket metrics
    this.socketMetrics.set(socket, {
      messagesQueued: 0,
      messagesSent: 0,
      bytesQueued: 0,
      bytesSent: 0,
      lastActivity: Date.now(),
      connectionTime: Date.now(),
      errors: 0,
      backpressureEvents: 0,
      avgFlushTime: 0,
    });

    // Initialize connection health
    this.connectionHealth.set(socket, {
      status: "healthy",
      lastHealthCheck: Date.now(),
      consecutiveErrors: 0,
      slowFlushCount: 0,
      queueFullCount: 0,
    });

    // Update peak connections metric
    const currentConnections = this.queues.size;
    if (currentConnections > this.globalMetrics.peakConnections) {
      this.globalMetrics.peakConnections = currentConnections;
    }

    // Event handlers
    socket.on("drain", () => {
      this._updateSocketMetric(socket, "backpressureEvents", 1);
      this._flush(socket);
    });

    socket.on("close", () => this._cleanup(socket));
    socket.on("error", (err) => {
      this._updateSocketMetric(socket, "errors", 1);
      this._updateConnectionHealth(socket, "error", err);
      this._cleanup(socket);
    });

    this.emit("socketRegistered", socket, currentConnections);
  }

  enqueue(socket, line, priority = "normal", options = {}) {
    const queues = this.queues.get(socket);
    if (!queues) {
      // Socket not registered, drop message
      this.globalMetrics.droppedMessages++;
      this.emit("messageDropped", socket, line, "socket_not_registered");
      return false;
    }

    const metrics = this.socketMetrics.get(socket);

    // Check queue size limits
    const totalQueueSize = queues.priority.length + queues.normal.length + queues.low.length;
    if (totalQueueSize >= this.options.maxQueueSize) {
      // Queue is full, drop low priority messages first
      if (priority === "low" || (priority === "normal" && queues.low.length > 0)) {
        if (queues.low.length > 0) {
          queues.low.shift(); // Drop oldest low priority message
        } else {
          this.globalMetrics.droppedMessages++;
          this._updateConnectionHealth(socket, "queue_full");
          this.emit("messageDropped", socket, line, "queue_full");
          return false;
        }
      } else if (priority === "normal" && queues.normal.length > queues.priority.length * 2) {
        queues.normal.shift(); // Drop oldest normal message if too many
      }
    }

    const originalSize = Buffer.byteLength(line, "utf8");

    // Process large messages with compression and chunking
    try {
      // For now, use simple synchronous processing to maintain interface compatibility
      // TODO: Implement full async processing in future version
      const processed = this._processMessageSync(line, options);

      if (processed.chunks) {
        // Message was chunked - enqueue each chunk
        let enqueuedChunks = 0;
        for (const chunk of processed.chunks) {
          // Don't add newline if message already ends with RESP terminator
          const needsNewline = !chunk.endsWith("\r\n") && !chunk.endsWith("\n");
          const chunkMessage = {
            content: needsNewline ? chunk + "\n" : chunk,
            timestamp: Date.now(),
            priority,
            size: Buffer.byteLength(chunk, "utf8"),
            chunked: true,
            originalSize,
            ...options,
          };

          queues[priority].push(chunkMessage);
          enqueuedChunks++;
        }

        // Update metrics for chunked message
        if (metrics) {
          metrics.messagesQueued += enqueuedChunks;
          metrics.bytesQueued += originalSize;
          metrics.lastActivity = Date.now();
        }

        this.globalMetrics.totalMessages += enqueuedChunks;
        this.globalMetrics.totalBytes += originalSize;
      } else {
        // Single message (possibly compressed)
        // Don't add newline if message already ends with RESP terminator
        const needsNewline = !processed.message.endsWith("\r\n") && !processed.message.endsWith("\n");
        const finalContent = needsNewline ? processed.message + "\n" : processed.message;
        const finalMessage = {
          content: processed.metadata.compressed ? `COMPRESSED:${finalContent}` : finalContent,
          timestamp: Date.now(),
          priority,
          size: originalSize,
          compressed: processed.metadata.compressed,
          compressionRatio: processed.metadata.compressionRatio,
          ...options,
        };

        // Add to appropriate priority queue
        queues[priority].push(finalMessage);

        // Update metrics
        if (metrics) {
          metrics.messagesQueued++;
          metrics.bytesQueued += originalSize;
          metrics.lastActivity = Date.now();
        }

        this.globalMetrics.totalMessages++;
        this.globalMetrics.totalBytes += originalSize;

        // Track compression savings
        if (processed.metadata.compressed && processed.metadata.compressedSize) {
          this.globalMetrics.compressionSavings += originalSize - processed.metadata.compressedSize;
        }
      }
    } catch (err) {
      // Message processing failed, enqueue original message
      // Don't add newline if message already ends with RESP terminator
      const needsNewline = !line.endsWith("\r\n") && !line.endsWith("\n");
      const message = {
        content: needsNewline ? line + "\n" : line,
        timestamp: Date.now(),
        priority,
        size: originalSize,
        error: err.message,
        ...options,
      };

      queues[priority].push(message);

      if (metrics) {
        metrics.messagesQueued++;
        metrics.bytesQueued += originalSize;
        metrics.lastActivity = Date.now();
      }

      this.globalMetrics.totalMessages++;
      this.globalMetrics.totalBytes += originalSize;
    }

    // Schedule batch flush or flush immediately based on priority
    if (priority === "priority") {
      // High priority messages flush immediately
      this._flush(socket);
    } else {
      // Normal and low priority messages can be batched
      this._scheduleBatchFlush(socket);
    }

    return true;
  }

  broadcast(sockets, line, priority = "normal", options = {}) {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;

    // Use async iteration for large broadcasts to avoid blocking
    const socketArray = Array.isArray(sockets) ? sockets : Array.from(sockets);

    if (socketArray.length > 100) {
      // For large broadcasts, process in chunks to avoid blocking the event loop
      this._broadcastInChunks(socketArray, line, priority, options);
    } else {
      // For smaller broadcasts, process synchronously
      for (const sock of socketArray) {
        if (sock.destroyed) {
          failureCount++;
          continue;
        }

        if (this.enqueue(sock, line, priority, options)) {
          successCount++;
        } else {
          failureCount++;
        }
      }
    }

    // Emit broadcast metrics
    const duration = Date.now() - startTime;
    this.emit("broadcastComplete", {
      totalSockets: socketArray.length,
      successCount,
      failureCount,
      duration,
      messageSize: Buffer.byteLength(line, "utf8"),
    });

    return { successCount, failureCount };
  }

  _flush(socket) {
    if (this.flushing.has(socket)) return; // already flushing

    const queues = this.queues.get(socket);
    if (!queues) return;

    const totalMessages = queues.priority.length + queues.normal.length + queues.low.length;
    if (totalMessages === 0) return;

    this.flushing.add(socket);
    const startTime = Date.now();
    const metrics = this.socketMetrics.get(socket);
    let messagesSent = 0;
    let bytesSent = 0;

    try {
      // Process messages by priority: priority -> normal -> low
      const priorityOrder = ["priority", "normal", "low"];

      for (const priority of priorityOrder) {
        const queue = queues[priority];

        while (queue.length > 0) {
          const message = queue[0];
          let content = message.content;

          // Decompress if needed
          if (message.compressed) {
            // Decompress if needed
            if (message.compressed) {
              try {
                // Remove the COMPRESSED: prefix if present
                if (content.startsWith("COMPRESSED:")) {
                  content = content.substring(11);
                }
                // Note: Current compression is lossy and cannot be decompressed
                // Consider implementing proper compression with zlib
              } catch (err) {
                // Decompression failed, skip message
                queue.shift();
                this.globalMetrics.droppedMessages++;
                continue;
              }
            }
          }

          const ok = socket.write(content);
          if (!ok) {
            // Backpressure detected, wait for 'drain'
            break;
          }

          // Message sent successfully
          queue.shift();
          messagesSent++;
          bytesSent += message.size;

          // Update metrics
          if (metrics) {
            metrics.messagesSent++;
            metrics.bytesSent += message.size;
          }
        }

        // If we hit backpressure, stop processing all queues
        if (queue.length > 0) {
          break;
        }
      }
    } catch (err) {
      // Socket error during flush
      this._updateSocketMetric(socket, "errors", 1);
      this._updateConnectionHealth(socket, "flush_error", err);
    }

    this.flushing.delete(socket);

    // Update flush performance metrics
    const flushTime = Date.now() - startTime;
    if (metrics) {
      metrics.avgFlushTime = (metrics.avgFlushTime + flushTime) / 2;
      if (flushTime > 100) {
        // Slow flush threshold
        this._updateConnectionHealth(socket, "slow_flush");
      }
    }

    // Clear batch timer if exists
    const timer = this.batchTimers.get(socket);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(socket);
    }

    // If there are still messages, they're waiting for backpressure to clear
    const remainingMessages = queues.priority.length + queues.normal.length + queues.low.length;
    if (remainingMessages > 0) {
      // Emit backpressure event for monitoring
      this.emit("backpressure", socket, remainingMessages);
    }

    return { messagesSent, bytesSent, flushTime };
  }

  _cleanup(socket) {
    // Clear batch timer
    // Clear batch timer
    const timer = this.batchTimers.get(socket);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(socket);
    }

    // Clean up data structures
    this.queues.delete(socket);
    this.flushing.delete(socket);
    this.batchTimers.delete(socket);
    this.socketMetrics.delete(socket);
    this.connectionHealth.delete(socket);

    this.emit("socketDisconnected", socket, this.queues.size);
  }

  // Enhanced stats for monitoring and UI
  queueSize(socket) {
    const queues = this.queues.get(socket);
    if (!queues) return 0;
    return queues.priority.length + queues.normal.length + queues.low.length;
  }

  getSocketMetrics(socket) {
    return this.socketMetrics.get(socket) || null;
  }

  getGlobalMetrics() {
    const uptime = Date.now() - this.globalMetrics.startTime;
    return {
      ...this.globalMetrics,
      uptime,
      currentConnections: this.queues.size,
      messagesPerSecond: this.globalMetrics.totalMessages / (uptime / 1000),
      bytesPerSecond: this.globalMetrics.totalBytes / (uptime / 1000),
    };
  }

  getConnectionHealth(socket) {
    return this.connectionHealth.get(socket) || null;
  }

  // Batch scheduling for efficient I/O
  _scheduleBatchFlush(socket) {
    if (this.batchTimers.has(socket)) return; // Already scheduled

    const timer = setTimeout(() => {
      this.batchTimers.delete(socket);
      this._flush(socket);
    }, this.options.batchTimeout);

    this.batchTimers.set(socket, timer);
  }

  // Async broadcast for large subscriber lists
  async _broadcastInChunks(sockets, line, priority, options) {
    const chunkSize = 50; // Process 50 sockets at a time
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < sockets.length; i += chunkSize) {
      const chunk = sockets.slice(i, i + chunkSize);

      for (const sock of chunk) {
        if (sock.destroyed) {
          failureCount++;
          continue;
        }

        if (this.enqueue(sock, line, priority, options)) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      // Yield control to event loop between chunks
      if (i + chunkSize < sockets.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    return { successCount, failureCount };
  }

  // Helper methods for metrics and health monitoring
  _updateSocketMetric(socket, metric, value) {
    const metrics = this.socketMetrics.get(socket);
    if (metrics && metrics.hasOwnProperty(metric)) {
      if (typeof metrics[metric] === "number") {
        metrics[metric] += value;
      } else {
        metrics[metric] = value;
      }
    }
  }

  _updateConnectionHealth(socket, event, data = null) {
    const health = this.connectionHealth.get(socket);
    if (!health) return;

    health.lastHealthCheck = Date.now();

    switch (event) {
      case "error":
      case "flush_error":
        health.consecutiveErrors++;
        if (health.consecutiveErrors > 3) {
          health.status = "unhealthy";
        }
        break;
      case "slow_flush":
        health.slowFlushCount++;
        if (health.slowFlushCount > 5) {
          health.status = "degraded";
        }
        break;
      case "queue_full":
        health.queueFullCount++;
        if (health.queueFullCount > 3) {
          health.status = "overloaded";
        }
        break;
      case "healthy":
        health.consecutiveErrors = 0;
        health.slowFlushCount = 0;
        health.queueFullCount = 0;
        health.status = "healthy";
        break;
    }
  }

  // Synchronous message processing for interface compatibility
  _processMessageSync(line, options) {
    const originalSize = Buffer.byteLength(line, "utf8");
    let processedMessage = line;
    let compressed = false;
    let compressionSavings = 0;

    // Simple compression for large messages
    if (originalSize > this.options.compressionThreshold && !options.noCompression) {
      try {
        const simpleCompressed = this._compressMessage(line);
        if (simpleCompressed.length < originalSize * 0.8) {
          processedMessage = simpleCompressed;
          compressed = true;
          compressionSavings = originalSize - simpleCompressed.length;
        }
      } catch (err) {
        // Compression failed, use original
      }
    }

    // Check if message needs chunking
    const maxChunkSize = this.messageHandler.options.maxChunkSize;
    if (processedMessage.length > maxChunkSize && !options.noChunking) {
      // Create chunks
      const chunks = [];
      const messageId = Date.now().toString(36) + Math.random().toString(36).substring(2);
      const chunkSize = maxChunkSize - 100; // Reserve space for headers

      for (let i = 0; i < processedMessage.length; i += chunkSize) {
        const chunkData = processedMessage.substring(i, i + chunkSize);
        const chunkIndex = Math.floor(i / chunkSize);
        const totalChunks = Math.ceil(processedMessage.length / chunkSize);

        chunks.push(`CHUNK:${messageId}:${chunkIndex}:${totalChunks}:${chunkData}`);
      }

      return {
        chunks,
        metadata: {
          original: false,
          compressed,
          chunked: true,
          totalSize: originalSize,
          compressedSize: compressed ? processedMessage.length : originalSize,
        },
      };
    }

    return {
      message: processedMessage,
      metadata: {
        original: !compressed,
        compressed,
        chunked: false,
        totalSize: originalSize,
        compressedSize: compressed ? processedMessage.length : originalSize,
      },
    };
  }

  // Compression helpers (simple gzip-like compression simulation)
  _compressMessage(content) {
    // In a real implementation, you'd use zlib.gzip or similar
    // For now, we'll simulate compression by removing repeated whitespace
    return content.replace(/\s+/g, " ").trim();
  }

  _decompressMessage(content) {
    // In a real implementation, you'd use zlib.gunzip or similar
    // For now, just return as-is since our compression is lossy
    return content;
  }

  // Health monitoring
  _performHealthCheck() {
    const now = Date.now();
    const staleThreshold = 300000; // 5 minutes

    for (const [socket, health] of this.connectionHealth.entries()) {
      const timeSinceLastActivity = now - (this.socketMetrics.get(socket)?.lastActivity || now);

      if (timeSinceLastActivity > staleThreshold) {
        this._updateConnectionHealth(socket, "stale");
      } else if (health.status !== "healthy" && health.consecutiveErrors === 0) {
        this._updateConnectionHealth(socket, "healthy");
      }
    }

    this.emit("healthCheckComplete", this.connectionHealth.size);
  }

  // Metrics reporting
  _reportMetrics() {
    const metrics = this.getGlobalMetrics();
    this.emit("metricsReport", metrics);
  }

  // Cleanup method for graceful shutdown
  destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.metricsReportInterval) {
      clearInterval(this.metricsReportInterval);
    }

    // Clear all batch timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }

    // Cleanup message handler
    if (this.messageHandler) {
      this.messageHandler.destroy();
    }

    this.batchTimers.clear();
    this.queues.clear();
    this.socketMetrics.clear();
    this.connectionHealth.clear();

    this.emit("destroyed");
  }
}

module.exports = { IOMultiplexer };
