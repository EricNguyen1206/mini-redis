/** Simple Pub/Sub broker */
class PubSub {
  constructor() {
    this.channels = new Map(); // channel -> Set<Client>
  }

  subscribe(client, channel) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel).add(client);
  }

  unsubscribe(client, channel) {
    if (!this.channels.has(channel)) return;
    const set = this.channels.get(channel);
    set.delete(client);
    if (set.size === 0) this.channels.delete(channel);
  }

  unsubscribeAll(client) {
    for (const [ch, set] of this.channels.entries()) {
      if (set.has(client)) {
        set.delete(client);
        if (set.size === 0) this.channels.delete(ch);
      }
    }
  }

  publish(channel, message) {
    const set = this.channels.get(channel);
    if (!set || set.size === 0) return 0;
    let delivered = 0;
    for (const client of set) {
      client.send(`message ${channel} ${message}`);
      delivered++;
    }
    return delivered;
  }
}

module.exports = PubSub;
