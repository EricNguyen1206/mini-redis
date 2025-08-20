/** High-performance Pub/Sub broker with I/O multiplexing support */
class PubSub {
  constructor(ioMultiplexer = null) {
    this.channels = new Map(); // channel -> Set<Client>
    this.mux = ioMultiplexer; // I/O multiplexer for efficient broadcasting

    // Performance optimizations
    this.subscriberGroups = new Map(); // channel -> Map<priority, Set<Client>>
    this.messageBuffer = new Map(); // channel -> Array<buffered messages>
    this.channelMetrics = new Map(); // channel -> performance metrics

    // Configuration
    this.options = {
      maxBufferedMessages: 100,
      bufferFlushInterval: 10, // ms
      enableSubscriberGrouping: true,
      enableMessageBatching: true,
      largeChannelThreshold: 100, // subscribers
    };

    // Periodic buffer flushing for batched messages
    this.bufferFlushTimer = setInterval(() => this._flushMessageBuffers(), this.options.bufferFlushInterval);
  }

  subscribe(client, channel, priority = "medium") {
    // Initialize channel if it doesn't exist
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
      this.subscriberGroups.set(
        channel,
        new Map([
          ["high", new Set()],
          ["medium", new Set()],
          ["low", new Set()],
        ])
      );
      this.channelMetrics.set(channel, {
        totalSubscribers: 0,
        messagesPublished: 0,
        totalBytesPublished: 0,
        avgMessageSize: 0,
        lastActivity: Date.now(),
        createdAt: Date.now(),
      });
    }

    // Add client to main channel set
    const channelSet = this.channels.get(channel);
    channelSet.add(client);

    // Add client to appropriate priority group if grouping is enabled
    if (this.options.enableSubscriberGrouping) {
      const groups = this.subscriberGroups.get(channel);
      const groupKey = groups.has(priority) ? priority : "medium";
      groups.get(groupKey).add(client);
    }

    // Update metrics
    const metrics = this.channelMetrics.get(channel);
    metrics.totalSubscribers = channelSet.size;
    metrics.lastActivity = Date.now();

    // Store client's priority for later reference
    if (!client.subscriptionPriorities) {
      client.subscriptionPriorities = new Map();
    }
    client.subscriptionPriorities.set(channel, priority);
  }

  unsubscribe(client, channel) {
    if (!this.channels.has(channel)) return;

    const channelSet = this.channels.get(channel);
    channelSet.delete(client);

    // Remove from priority groups if grouping is enabled
    if (this.options.enableSubscriberGrouping && this.subscriberGroups.has(channel)) {
      const groups = this.subscriberGroups.get(channel);
      for (const prioritySet of groups.values()) {
        prioritySet.delete(client);
      }
    }

    // Clean up client's priority tracking
    if (client.subscriptionPriorities) {
      client.subscriptionPriorities.delete(channel);
    }

    // Update metrics
    if (this.channelMetrics.has(channel)) {
      const metrics = this.channelMetrics.get(channel);
      metrics.totalSubscribers = channelSet.size;
      metrics.lastActivity = Date.now();
    }

    // Clean up empty channels
    if (channelSet.size === 0) {
      this.channels.delete(channel);
      this.subscriberGroups.delete(channel);
      this.channelMetrics.delete(channel);
      this.messageBuffer.delete(channel);
    }
  }

  unsubscribeAll(client) {
    // Get all channels this client is subscribed to
    const subscribedChannels = [];
    for (const [channel, channelSet] of this.channels.entries()) {
      if (channelSet.has(client)) {
        subscribedChannels.push(channel);
      }
    }

    // Unsubscribe from each channel (this handles cleanup properly)
    for (const channel of subscribedChannels) {
      this.unsubscribe(client, channel);
    }

    // Clean up client's priority tracking
    if (client.subscriptionPriorities) {
      client.subscriptionPriorities.clear();
    }
  }

  publish(channel, message, options = {}) {
    const channelSet = this.channels.get(channel);
    if (!channelSet || channelSet.size === 0) return 0;

    const messageSize = Buffer.byteLength(message, "utf8");
    const formattedMessage = `message ${channel} ${message}`;
    const isLargeChannel = channelSet.size >= this.options.largeChannelThreshold;

    // Update channel metrics
    const metrics = this.channelMetrics.get(channel);
    if (metrics) {
      metrics.messagesPublished++;
      metrics.totalBytesPublished += messageSize;
      metrics.avgMessageSize = metrics.totalBytesPublished / metrics.messagesPublished;
      metrics.lastActivity = Date.now();
    }

    // Choose delivery strategy based on channel size and options
    if (this.options.enableMessageBatching && !options.immediate && !isLargeChannel) {
      // Buffer message for batch delivery (small to medium channels)
      return this._bufferMessage(channel, formattedMessage, options);
    } else if (this.mux && (isLargeChannel || options.useMultiplexer !== false)) {
      // Use I/O multiplexer for efficient delivery (large channels or explicit request)
      return this._publishWithMultiplexer(channel, formattedMessage, channelSet, options);
    } else {
      // Direct delivery for immediate messages or when multiplexer is not available
      return this._publishDirect(channel, formattedMessage, channelSet, options);
    }
  }

  // Direct message delivery (synchronous)
  _publishDirect(channel, formattedMessage, channelSet, options) {
    let delivered = 0;
    const priority = options.priority || "medium";

    for (const client of channelSet) {
      try {
        if (this.mux) {
          // Use multiplexer even for direct delivery to get backpressure handling
          if (this.mux.enqueue(client.socket, formattedMessage, priority)) {
            delivered++;
          }
        } else {
          // Fallback to client's send method
          client.send(formattedMessage);
          delivered++;
        }
      } catch (err) {
        // Client send failed, continue with others
        continue;
      }
    }

    return delivered;
  }

  // I/O multiplexer-based delivery (asynchronous, high-performance)
  _publishWithMultiplexer(channel, formattedMessage, channelSet, options) {
    const priority = options.priority || "medium";
    const sockets = [];

    // Extract sockets from clients
    for (const client of channelSet) {
      if (client.socket && !client.socket.destroyed) {
        sockets.push(client.socket);
      }
    }

    // Use multiplexer's broadcast method for efficient delivery
    const result = this.mux.broadcast(sockets, formattedMessage, priority, options);
    return result.successCount || sockets.length; // Fallback to socket count if no result
  }

  // Message buffering for batch delivery
  _bufferMessage(channel, formattedMessage, options) {
    if (!this.messageBuffer.has(channel)) {
      this.messageBuffer.set(channel, []);
    }

    const buffer = this.messageBuffer.get(channel);
    buffer.push({
      message: formattedMessage,
      timestamp: Date.now(),
      options,
    });

    // If buffer is full, flush immediately
    if (buffer.length >= this.options.maxBufferedMessages) {
      return this._flushChannelBuffer(channel);
    }

    // Return estimated delivery count (will be delivered on next flush)
    const channelSet = this.channels.get(channel);
    return channelSet ? channelSet.size : 0;
  }

  // Flush message buffers for batch delivery
  _flushMessageBuffers() {
    let totalDelivered = 0;

    for (const channel of this.messageBuffer.keys()) {
      totalDelivered += this._flushChannelBuffer(channel);
    }

    return totalDelivered;
  }

  // Flush buffer for a specific channel
  _flushChannelBuffer(channel) {
    const buffer = this.messageBuffer.get(channel);
    if (!buffer || buffer.length === 0) return 0;

    const channelSet = this.channels.get(channel);
    if (!channelSet || channelSet.size === 0) {
      // Channel has no subscribers, clear buffer
      this.messageBuffer.set(channel, []);
      return 0;
    }

    let totalDelivered = 0;

    // Group messages by priority for efficient delivery
    const priorityGroups = { high: [], medium: [], low: [] };
    for (const bufferedMsg of buffer) {
      const p =
        bufferedMsg?.options?.priority &&
        Object.prototype.hasOwnProperty.call(priorityGroups, bufferedMsg.options.priority)
          ? bufferedMsg.options.priority
          : "medium";
      priorityGroups[p].push(bufferedMsg.message);
    }

    // Deliver messages by priority
    for (const [priority, messages] of Object.entries(priorityGroups)) {
      if (messages.length === 0) continue;

      if (this.mux) {
        // Use multiplexer for batch delivery
        const sockets = Array.from(channelSet)
          .map((client) => client.socket)
          .filter((s) => s && !s.destroyed);
        for (const message of messages) {
          const result = this.mux.broadcast(sockets, message, priority);
          totalDelivered += result.successCount || 0;
        }
      } else {
        // Direct delivery fallback
        for (const message of messages) {
          for (const client of channelSet) {
            try {
              client.send(message);
              totalDelivered++;
            } catch (err) {
              // Continue with other clients
            }
          }
        }
      }
    }

    // Clear the buffer
    this.messageBuffer.set(channel, []);
    return totalDelivered;
  }

  // Get channel metrics for monitoring
  getChannelMetrics(channel) {
    return this.channelMetrics.get(channel) || null;
  }

  // Get all channel metrics
  getAllChannelMetrics() {
    const metrics = {};
    for (const [channel, channelMetrics] of this.channelMetrics.entries()) {
      metrics[channel] = { ...channelMetrics };
    }
    return metrics;
  }

  // Get subscriber count for a channel
  getSubscriberCount(channel) {
    const channelSet = this.channels.get(channel);
    return channelSet ? channelSet.size : 0;
  }

  // Cleanup method for graceful shutdown
  destroy() {
    if (this.bufferFlushTimer) {
      clearInterval(this.bufferFlushTimer);
    }

    // Flush any remaining buffered messages
    this._flushMessageBuffers();

    // Clear all data structures
    this.channels.clear();
    this.subscriberGroups.clear();
    this.messageBuffer.clear();
    this.channelMetrics.clear();
  }
}

module.exports = PubSub;
