# 🎲 Mini-Redis

A high-performance, Redis-compatible server built with Node.js, featuring advanced I/O multiplexing and 3-priority message queuing.

## Description

Mini-Redis is a lightweight, Redis-compatible server that implements core Redis functionality with modern Node.js architecture. It provides:

- **Redis Protocol Compatibility**: Works with standard Redis clients and tools
- **High-Performance I/O**: Advanced multiplexing with 3-priority message queues (high, medium, low)
- **Pub/Sub Messaging**: Real-time publish/subscribe system with priority support
- **TTL Support**: Automatic key expiration with precise timing
- **Connection Management**: Handles thousands of concurrent connections efficiently
- **Performance Monitoring**: Built-in metrics and health monitoring
- **Docker Ready**: Containerized deployment with health checks

## Folder Structure

```
mini-redis/
├── services/
│   └── mini-redis-core/               # Core Redis service
│       ├── src/                       # Core functionality
│       │   ├── tcp_server.js          # Main TCP server and command handling
│       │   ├── tcp_client.js          # Client connection management
│       │   ├── store.js               # In-memory key-value store with TTL
│       │   ├── pubsub.js              # Pub/sub messaging with priority support
│       │   ├── io_multiflexing.js     # I/O multiplexer with 3-priority queues
│       │   ├── message_handler.js     # Message processing and chunking
│       │   └── resp.js                # Redis protocol (RESP) implementation
│       ├── test/                      # Test files
│       ├── index.js                   # Service entry point
│       ├── package.json               # Dependencies
│       ├── Dockerfile                 # Container definition
│       └── healthcheck.js             # Docker health check
├── docker-compose.yml                 # Container orchestration
├── docker-run.sh                     # Management script
└── README.md                         # This file
```

## Quick Start

### Installation & Setup

```bash
# Clone the repository
git clone https://github.com/EricNguyen1206/mini-redis.git
cd mini-redis

# Install dependencies
cd services/mini-redis-core
npm install
```

### Running the Server

#### Option 1: Direct Node.js

```bash
# Start the Redis server (default port 6380)
cd services/mini-redis-core
node index.js

# Start on custom port
node index.js --port 6379

# Using environment variable
REDIS_PORT=6379 node index.js
```

#### Option 2: Docker

```bash
# Build and run with Docker
cd services/mini-redis-core
docker build -t mini-redis-core .
docker run -p 6380:6380 mini-redis-core

# Or use docker-compose from project root
docker-compose up
```

### Basic Usage Examples

#### Connect with Redis CLI

```bash
# Connect to the server
redis-cli -p 6380

# Test connection
PING
# Response: PONG
```

#### Basic Commands

```redis
# String operations
SET user:1 "John Doe"
GET user:1
# Response: "John Doe"

# Key management
EXISTS user:1
# Response: (integer) 1

DEL user:1
# Response: (integer) 1

# Pattern matching
KEYS user:*
# Response: (empty array)
```

For detailed command documentation, see [Mini-Redis Core Commands](services/mini-redis-core/README.md#supported-commands).

#### TTL Operations

```redis
# Set key with expiration
SET session:abc123 "user_data"
EXPIRE session:abc123 3600

# Check remaining time
TTL session:abc123
# Response: (integer) 3599

# Remove expiration
PERSIST session:abc123
```

#### Pub/Sub Messaging

```redis
# Terminal 1: Subscribe to channels
SUBSCRIBE news

# Terminal 2: Publish messages
PUBLISH news "Breaking news!"

# Terminal 1 receives:
# 1) "message"
# 2) "news"
# 3) "Breaking news!"
```

#### Priority Queue System

The server uses a 3-priority message queue system:

- **High Priority**: System messages, errors (immediate flush)
- **Medium Priority**: Regular pub/sub messages (batched, default)
- **Low Priority**: Metrics, heartbeats (batched, droppable)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
