const net = require("net");

/**
 * Demo script to showcase the I/O multiplexing improvements
 */
class PubSubDemo {
  constructor() {
    this.serverPort = 6380;
  }

  async runDemo() {
    console.log("🎯 Mini-Redis Pub/Sub I/O Multiplexing Demo\n");

    try {
      // Demo 1: Basic pub/sub with multiplexing
      await this.demoBasicPubSub();

      // Demo 2: Large message handling
      await this.demoLargeMessages();

      // Demo 3: High-frequency publishing
      await this.demoHighFrequency();

      console.log("✅ Demo completed successfully!");
    } catch (error) {
      console.error("❌ Demo failed:", error.message);
    }
  }

  async demoBasicPubSub() {
    console.log("📡 Demo 1: Basic Pub/Sub with I/O Multiplexing");

    const subscriber = await this.createClient();
    const publisher = await this.createClient();

    // Set up subscriber
    console.log("   Setting up subscriber...");
    await this.sendCommand(subscriber, "SUBSCRIBE news");

    // Set up message listener
    let messageReceived = false;
    subscriber.on("data", (data) => {
      if (data.includes("message news")) {
        console.log("   📨 Subscriber received:", data.trim());
        messageReceived = true;
      }
    });

    // Publish a message
    console.log("   Publishing message...");
    await this.sendCommand(publisher, 'PUBLISH news "Breaking: I/O multiplexing is working!"');

    // Wait for message to be received
    await this.waitFor(() => messageReceived, 5000);

    console.log("   ✅ Basic pub/sub working with I/O multiplexing\n");

    subscriber.destroy();
    publisher.destroy();
  }

  async demoLargeMessages() {
    console.log("📦 Demo 2: Large Message Handling");

    const subscriber = await this.createClient();
    const publisher = await this.createClient();

    await this.sendCommand(subscriber, "SUBSCRIBE large_channel");

    // Create a large message (10KB)
    const largeMessage = "This is a large message! ".repeat(400); // ~10KB
    console.log(`   Creating large message (${largeMessage.length} bytes)...`);

    let largeMessageReceived = false;
    subscriber.on("data", (data) => {
      if (data.includes("message large_channel")) {
        console.log(`   📨 Large message received (${data.length} bytes total)`);
        largeMessageReceived = true;
      }
    });

    console.log("   Publishing large message...");
    await this.sendCommand(publisher, `PUBLISH large_channel "${largeMessage}"`);

    await this.waitFor(() => largeMessageReceived, 10000);

    console.log("   ✅ Large message handled successfully\n");

    subscriber.destroy();
    publisher.destroy();
  }

  async demoHighFrequency() {
    console.log("⚡ Demo 3: High-Frequency Publishing");

    const subscriber = await this.createClient();
    const publisher = await this.createClient();

    await this.sendCommand(subscriber, "SUBSCRIBE high_freq");

    const messageCount = 100;
    let receivedCount = 0;

    subscriber.on("data", (data) => {
      if (data.includes("message high_freq")) {
        receivedCount++;
        if (receivedCount % 20 === 0) {
          console.log(`   📊 Received ${receivedCount}/${messageCount} messages`);
        }
      }
    });

    console.log(`   Publishing ${messageCount} messages rapidly...`);
    const startTime = Date.now();

    // Publish messages rapidly
    for (let i = 0; i < messageCount; i++) {
      await this.sendCommand(publisher, `PUBLISH high_freq "Message ${i + 1}"`);
    }

    // Wait for all messages
    await this.waitFor(() => receivedCount === messageCount, 15000);

    const duration = Date.now() - startTime;
    const messagesPerSecond = Math.round((messageCount / duration) * 1000);

    console.log(`   ✅ All ${messageCount} messages delivered in ${duration}ms`);
    console.log(`   📈 Throughput: ${messagesPerSecond} messages/second\n`);

    subscriber.destroy();
    publisher.destroy();
  }

  createClient() {
    return new Promise((resolve, reject) => {
      const client = net.connect(this.serverPort, "127.0.0.1");
      client.setEncoding("utf8");

      client.on("connect", () => {
        resolve(client);
      });

      client.on("error", reject);

      // Skip the welcome message
      client.once("data", () => {});
    });
  }

  sendCommand(client, command) {
    return new Promise((resolve) => {
      client.write(command + "\n");
      client.once("data", resolve);
    });
  }

  waitFor(condition, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (condition()) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error("Timeout waiting for condition"));
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }
}

// Run demo if this file is executed directly
if (require.main === module) {
  const demo = new PubSubDemo();
  demo.runDemo().catch(console.error);
}

module.exports = PubSubDemo;
