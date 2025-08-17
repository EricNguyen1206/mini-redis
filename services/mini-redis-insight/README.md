# 📊 Mini-Redis Insight Service

A comprehensive web-based monitoring and management interface for Mini-Redis. This service provides real-time insights, performance monitoring, and interactive command execution by connecting to the `mini-redis-core` service.

## ✨ Features

- **📊 Real-time Dashboard**: Beautiful web interface with Chart.js visualizations
- **⚡ Performance Monitoring**: Live metrics tracking with 60-second rolling windows
- **🔧 Interactive Commands**: Execute Redis commands directly from the web interface
- **📡 Pub/Sub Monitoring**: Track message publishing and subscription activity
- **💾 Data Management**: View, edit, and manage stored keys and values
- **🔄 Live Updates**: WebSocket-based real-time updates
- **📱 Responsive Design**: Works on desktop and mobile devices

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies (if any)
npm install

# Start the insight service (requires mini-redis-core to be running)
npm start

# Start with custom configuration
node index.js --port 8080 --redis-host localhost --redis-port 6380

# Using environment variables
HTTP_PORT=8080 REDIS_HOST=localhost REDIS_PORT=6380 npm start
```

### Docker

```bash
# Build the image
docker build -t mini-redis-insight .

# Run the container (requires mini-redis-core service)
docker run -p 8080:8080 -e REDIS_HOST=mini-redis-core mini-redis-insight

# Run with custom configuration
docker run -p 8080:8080 -e REDIS_HOST=localhost -e REDIS_PORT=6380 mini-redis-insight
```

## 🌐 Web Interface

Access the web interface at `http://localhost:8080` (or your configured port).

### Dashboard Tabs

1. **📊 Data & Commands**
   - View all stored keys and values in a sortable table
   - Execute Redis commands with an interactive form
   - Real-time data updates
   - TTL visualization with color-coded badges

2. **📡 Pub/Sub**
   - Monitor active channels and subscriber counts
   - Send and receive messages in real-time
   - View message history and logs
   - Test pub/sub functionality

3. **⚡ Performance**
   - Real-time performance charts (requests/sec, latency, hit rate)
   - System metrics (connections, memory usage, uptime)
   - 60-second rolling window data
   - Interactive Chart.js visualizations

## ⚙️ Configuration

### Environment Variables

- `HTTP_PORT` - HTTP server port (default: 8080)
- `REDIS_HOST` - Redis core service host (default: mini-redis-core)
- `REDIS_PORT` - Redis core service port (default: 6380)
- `NODE_ENV` - Environment mode (development/production)

### Command Line Options

```bash
node index.js [options]

Options:
  -p, --port <port>           HTTP server port (default: 8080)
  -h, --redis-host <host>     Redis core service host (default: mini-redis-core)
  -r, --redis-port <port>     Redis core service port (default: 6380)
  --help                      Show help message
  --version                   Show version information
```

## 🏗️ Architecture

The insight service consists of:

- **Redis Client** (`redis_client.js`) - TCP connection to mini-redis-core
- **HTTP Handler** (`http_handler.js`) - REST API endpoints
- **WebSocket Handler** (`ws_handler.js`) - Real-time updates
- **Performance Monitor** (`performance_monitor.js`) - Metrics collection
- **Orchestrator** (`orchestrator.js`) - Service coordination
- **Static Files** (`public/`) - Web interface assets

## 🔗 API Endpoints

### REST API

- `GET /` - Web interface (HTML)
- `GET /api/data` - Get all stored keys and values
- `POST /api/command` - Execute Redis command
- `GET /api/performance` - Get performance metrics
- `GET /api/pubsub` - Get pub/sub channel information

### WebSocket

Real-time updates are pushed via WebSocket for:
- Data changes when commands are executed
- Performance metrics updates (every second)
- System status changes

## 🔧 Development

### Project Structure

```
mini-redis-insight/
├── src/
│   ├── redis_client.js        # Redis core connection
│   ├── http_handler.js        # HTTP request handling
│   ├── ws_handler.js          # WebSocket management
│   ├── performance_monitor.js # Metrics collection
│   └── orchestrator.js        # Service orchestration
├── public/
│   └── index.html            # Web interface
├── index.js                  # Service entry point
├── package.json              # Dependencies
├── Dockerfile               # Container definition
└── README.md                # This file
```

### Adding New Features

1. **New API Endpoints**: Add handlers in `http_handler.js`
2. **Real-time Updates**: Extend WebSocket events in `ws_handler.js`
3. **Metrics**: Add new metrics in `performance_monitor.js`
4. **UI Components**: Modify `public/index.html`

## 🐳 Docker Integration

This service is designed to work as part of the Mini-Redis microservices architecture:

- **mini-redis-core** - Core Redis functionality
- **mini-redis-insight** (this service) - Web UI and monitoring
- **mini-redis-benchmark** - Performance testing tools

### Service Dependencies

The insight service requires:
1. `mini-redis-core` service to be running and accessible
2. Network connectivity to the core service
3. Proper environment variables for connection

## 📊 Monitoring Features

### Performance Metrics

- **Cache Performance**: Requests/sec, P99 latency, hit rate
- **System Metrics**: Memory usage, uptime, active connections
- **Real-time Charts**: 60-second rolling window with Chart.js

### Data Visualization

- **Interactive Tables**: Sortable data with search functionality
- **Real-time Updates**: Live data refresh via WebSocket
- **Responsive Design**: Mobile-friendly interface

## 🔒 Security

- Runs as non-root user in Docker
- Input validation and sanitization
- No direct file system access
- Secure WebSocket connections

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file for details.
