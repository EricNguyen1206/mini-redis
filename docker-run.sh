#!/bin/bash

# Mini-Redis Docker Management Script
# This script helps manage the Mini-Redis Docker containers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to build the image
build() {
    print_status "Building Mini-Redis Docker image..."
    docker compose build
    print_success "Build completed!"
}

# Function to start the server
start() {
    print_status "Starting Mini-Redis server with monitoring..."
    docker compose up -d mini-redis

    print_status "Waiting for server to be ready..."
    sleep 5

    # Check if container is running
    if docker compose ps mini-redis | grep -q "Up"; then
        print_success "Mini-Redis server is running!"
        print_status "Web interface: http://localhost:8080"
        print_status "Redis protocol: localhost:6380"
        print_status "Use 'docker compose logs mini-redis' to view logs"
    else
        print_error "Failed to start Mini-Redis server"
        docker compose logs mini-redis
        exit 1
    fi
}

# Function to run benchmark tests
benchmark() {
    print_status "Running Redis benchmark tests against Mini-Redis..."
    docker compose --profile benchmark up redis-benchmark
    print_success "Benchmark tests completed!"
}

# Function to start interactive CLI
cli() {
    print_status "Starting Redis CLI connected to Mini-Redis..."
    print_warning "Type 'exit' or press Ctrl+C to quit"
    docker compose --profile cli run --rm redis-cli
}

# Function to stop all services
stop() {
    print_status "Stopping all services..."
    docker compose down
    print_success "All services stopped!"
}

# Function to view logs
logs() {
    print_status "Showing Mini-Redis logs (press Ctrl+C to exit)..."
    docker compose logs -f mini-redis
}

# Function to show status
status() {
    print_status "Service status:"
    docker compose ps

    if docker compose ps mini-redis | grep -q "Up"; then
        echo ""
        print_status "Health check:"
        docker compose exec mini-redis node -e "
            const net = require('net');
            const client = net.connect(6380, 'localhost', () => {
                client.write('PING\\n');
                client.on('data', (data) => {
                    console.log('✅ Server responding:', data.toString().trim());
                    client.end();
                    process.exit(0);
                });
            });
            client.on('error', (err) => {
                console.log('❌ Server not responding:', err.message);
                process.exit(1);
            });
        " 2>/dev/null || print_warning "Server health check failed"
    fi
}

# Function to clean up
clean() {
    print_status "Cleaning up Docker resources..."
    docker compose down -v --remove-orphans
    docker system prune -f
    print_success "Cleanup completed!"
}

# Function to show help
show_help() {
    echo "Mini-Redis Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build      Build the Mini-Redis Docker image"
    echo "  start      Start Mini-Redis server with monitoring"
    echo "  benchmark  Run Redis benchmark tests"
    echo "  cli        Start interactive Redis CLI"
    echo "  stop       Stop all services"
    echo "  logs       Show server logs"
    echo "  status     Show service status and health"
    echo "  clean      Clean up Docker resources"
    echo "  help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start the server"
    echo "  $0 benchmark               # Run performance tests"
    echo "  $0 cli                     # Connect with Redis CLI"
    echo "  $0 logs                    # View server logs"
    echo ""
    echo "Quick start:"
    echo "  $0 build && $0 start && $0 benchmark"
}

# Main script logic
main() {
    check_docker
    
    case "${1:-help}" in
        build)
            build
            ;;
        start)
            build
            start
            ;;
        benchmark)
            benchmark
            ;;
        cli)
            cli
            ;;
        stop)
            stop
            ;;
        logs)
            logs
            ;;
        status)
            status
            ;;
        clean)
            clean
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
