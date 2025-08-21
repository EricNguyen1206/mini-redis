# Mini-Redis Core Service

A high-performance, lightweight Redis-compatible server focused exclusively on core functionality. This service is optimized for maximum throughput and minimal latency without any web interface or monitoring overhead.

## Supported Commands

### Primary Commands (Core Functionality)

#### SET
**Syntax:** `SET key value`

**Description:** Store a key-value pair in the database. This is the fundamental write operation for Mini-Redis.

**Examples:**
```redis
SET user:1 "John Doe"
# Response: OK

SET counter 42
# Response: OK

SET session:abc123 "user_data"
# Response: OK
```

**Return Values:**
- Simple string `OK` on successful storage

#### GET
**Syntax:** `GET key`

**Description:** Retrieve the value of a key from the database. This is the fundamental read operation for Mini-Redis.

**Examples:**
```redis
GET user:1
# Response: "John Doe"

GET counter
# Response: "42"

GET nonexistent
# Response: (nil)
```

**Return Values:**
- Bulk string with the value if key exists
- Null bulk string `(nil)` if key doesn't exist

#### DEL
**Syntax:** `DEL key [key ...]`

**Description:** Delete one or more keys from the database. Returns the number of keys that were actually deleted.

**Examples:**
```redis
DEL user:1
# Response: (integer) 1

DEL key1 key2 key3
# Response: (integer) 2  (if only 2 keys existed)

DEL nonexistent
# Response: (integer) 0
```

**Return Values:**
- Integer representing the number of keys that were successfully deleted

### Pub/Sub Commands (Real-time Messaging)

#### SUBSCRIBE
**Syntax:** `SUBSCRIBE channel [channel ...]`

**Description:** Subscribe to one or more channels for real-time messaging. The client will receive all messages published to subscribed channels.

**Examples:**
```redis
SUBSCRIBE news
# Response: ["subscribe", "news", 1]

SUBSCRIBE news sports weather
# Response:
# ["subscribe", "news", 1]
# ["subscribe", "sports", 2]
# ["subscribe", "weather", 3]
```

**Return Values:**
- Array for each channel: ["subscribe", channel_name, total_subscription_count]

#### UNSUBSCRIBE
**Syntax:** `UNSUBSCRIBE [channel ...]`

**Description:** Unsubscribe from specified channels. If no channels are specified, unsubscribes from all channels.

**Examples:**
```redis
UNSUBSCRIBE news
# Response: ["unsubscribe", "news", 2]

UNSUBSCRIBE
# Response: Unsubscribe confirmations for all subscribed channels
```

**Return Values:**
- Array for each channel: ["unsubscribe", channel_name, remaining_subscription_count]

#### PUBLISH
**Syntax:** `PUBLISH channel message`

**Description:** Publish a message to a channel. All clients subscribed to the channel will receive the message immediately.

**Examples:**
```redis
PUBLISH news "Breaking: New Redis server released!"
# Response: (integer) 3  (3 subscribers received the message)

PUBLISH empty_channel "Hello"
# Response: (integer) 0  (no subscribers)
```

**Return Values:**
- Integer representing the number of subscribers that received the message

### Other Commands (Utility & Management)

#### Connection & Authentication
- `PING [message]` - Test connection, returns PONG or echoes message
- `AUTH [username] password` - Authenticate (always succeeds for compatibility)
- `SELECT database` - Select database (only database 0 supported)
- `INFO [section]` - Get server information and statistics
- `CLIENT SETNAME name` - Set client connection name
- `CLIENT GETNAME` - Get client connection name
- `CLIENT LIST` - List client connections

#### Key Management
- `EXISTS key [key ...]` - Check if keys exist, returns count
- `KEYS pattern` - Find keys matching glob pattern
- `SCAN cursor [MATCH pattern] [COUNT count]` - Iterate keys with pagination
- `TYPE key` - Get key data type (always "string" or "none")
- `DBSIZE` - Get total number of keys in database

#### TTL Operations
- `EXPIRE key seconds` - Set key expiration time
- `TTL key` - Get remaining time to live (-1: no expiration, -2: key not found)


## Configuration

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

## 🐳 Docker Integration

This service is containerized and can be deployed standalone or as part of a larger architecture.

## 📈 Performance Monitoring

The core service includes built-in performance monitoring features:

- I/O multiplexing with 3-priority message queues (high, medium, low)
- Connection health tracking and metrics
- Automatic message batching and backpressure handling
- Performance statistics for queue management

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file for details.
