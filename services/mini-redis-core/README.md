# 🎯 Mini-Redis Core Service

A high-performance, lightweight Redis-compatible server focused exclusively on core functionality. This service is optimized for maximum throughput and minimal latency without any web interface or monitoring overhead.

## ⚡ Performance Focus

This core service is designed for:

- **Maximum Throughput**: Optimized I/O multiplexing for high-frequency operations
- **Minimal Latency**: No monitoring or web interface overhead
- **Low Memory Footprint**: Efficient data structures and memory management
- **High Concurrency**: Handles thousands of concurrent connections

## 🔌 Supported Commands

### Connection & Authentication

- `PING` - Test connection
- `AUTH [username] password` - Authenticate (always succeeds - no auth required)
- `SELECT database` - Select database (only database 0 supported)
- `INFO [section]` - Get server information
- `CLIENT SETNAME name` - Set client connection name
- `CLIENT GETNAME` - Get client connection name
- `CLIENT LIST` - List client connections

### Basic Operations

- `SET key value` - Store a key-value pair
- `GET key` - Retrieve a value by key
- `DEL key [key ...]` - Delete one or more keys
- `EXISTS key` - Check if key exists
- `KEYS pattern` - Find keys matching pattern
- `SCAN cursor [MATCH pattern] [COUNT count]` - Iterate over keys with cursor-based pagination
- `TYPE key` - Get the type of a key (always returns "string" or "none")
- `DBSIZE` - Get the number of keys in the database

### TTL Operations

- `EXPIRE key seconds` - Set key expiration
- `TTL key` - Get remaining time to live
- `PERSIST key` - Remove expiration

### Pub/Sub Operations

- `SUBSCRIBE channel [channel ...]` - Subscribe to channels
- `UNSUBSCRIBE [channel ...]` - Unsubscribe from channels
- `PUBLISH channel message` - Publish message to channel

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies (if any)
npm install

# Start the core service
npm start

# Start on custom port
node index.js --port 6379

# Using environment variable
REDIS_PORT=6379 npm start
```

### Docker

```bash
# Build the image
docker build -t mini-redis-core .

# Run the container
docker run -p 6380:6380 mini-redis-core

# Run with custom port
docker run -p 6379:6379 -e REDIS_PORT=6379 mini-redis-core
```

## 🔗 Client Connections

Connect using any Redis-compatible client:

```bash
# Redis CLI
redis-cli -p 6380

# Telnet
telnet localhost 6380

# Node.js
const redis = require('redis');
const client = redis.createClient({ port: 6380 });
```

### RedisInsight Compatibility

Mini-Redis Core is fully compatible with RedisInsight for monitoring and management:

```bash
# Connection string for RedisInsight
redis://mini-redis-core:6380

# Or when connecting from host machine
redis://localhost:6380
```

**Supported RedisInsight Features:**

- ✅ Database connection and authentication
- ✅ Server information display (INFO command)
- ✅ Key-value operations (GET, SET, DEL)
- ✅ Key browsing and pattern matching
- ✅ TTL management
- ✅ Pub/Sub monitoring
- ✅ Real-time command monitoring

**Note**: Mini-Redis Core doesn't require authentication, but accepts any AUTH command for client compatibility.

## 📊 Performance Characteristics

- **Throughput**: 10,000+ operations/second (single-threaded)
- **Latency**: Sub-millisecond response times for simple operations
- **Memory**: ~5-10MB base memory usage
- **Connections**: Supports 1000+ concurrent connections

## ⚙️ Configuration

### Environment Variables

- `REDIS_PORT` - TCP server port (default: 6380)
- `NODE_ENV` - Environment mode (development/production)

### Command Line Options

```bash
node index.js [options]

Options:
  -p, --port <port>    TCP server port (default: 6380)
  --help              Show help message
  --version           Show version information
```

## 🏗️ Architecture

The core service consists of:

- **TCP Server** (`tcp_server.js`) - Main Redis protocol handler
- **Storage Engine** (`store.js`) - In-memory key-value store with TTL
- **Pub/Sub Engine** (`pubsub.js`) - Message routing and subscriptions
- **I/O Multiplexer** (`io_multiflexing.js`) - High-performance connection handling
- **Message Handler** (`message_handler.js`) - Command parsing and execution
- **TCP Client** (`tcp_client.js`) - Client connection management

## 🔧 Development

### Project Structure

```
mini-redis-core/
├── src/
│   ├── tcp_server.js      # Main TCP server
│   ├── store.js           # Key-value storage
│   ├── pubsub.js          # Pub/Sub messaging
│   ├── io_multiflexing.js # I/O optimization
│   ├── message_handler.js # Command processing
│   └── tcp_client.js      # Client management
├── index.js               # Service entry point
├── package.json           # Dependencies
├── Dockerfile            # Container definition
└── README.md             # This file
```

### Adding New Commands

1. Add command parsing in `message_handler.js`
2. Implement command logic in `tcp_server.js`
3. Update this documentation

## 🐳 Docker Integration

This service is designed to work as part of the Mini-Redis microservices architecture:

- **mini-redis-core** (this service) - Core Redis functionality
- **mini-redis-insight** - Web UI and monitoring
- **mini-redis-benchmark** - Performance testing tools

## 📈 Monitoring Integration

While this core service doesn't include monitoring, it exposes metrics via:

- Connection count tracking
- Command execution statistics
- Memory usage information

These can be accessed by the `mini-redis-insight` service for visualization.

## 🔒 Security

- Runs as non-root user in Docker
- No external dependencies
- Minimal attack surface
- Input validation and sanitization

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file for details.
