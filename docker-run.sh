#!/bin/bash

# Mini-Redis Microservices Docker Management Script
# Manages the Mini-Redis microservices architecture with three services:
# - mini-redis-core: High-performance Redis-compatible server
# - mini-redis-insight: Web UI and monitoring dashboard
# - mini-redis-benchmark: Performance testing tools

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

print_header() {
    echo -e "${PURPLE}=== $1 ===${NC}"
}

print_service() {
    echo -e "${CYAN}[SERVICE]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to build all images
build() {
    print_header "Building Mini-Redis Microservices"
    print_status "Building all service images..."
    docker compose build
    print_success "All services built successfully!"
}

# Function to start core services (core + insight)
start() {
    print_header "Starting Mini-Redis Core Services"
    print_service "Starting mini-redis-core..."
    docker compose up -d mini-redis-core

    print_service "Starting mini-redis-insight..."
    docker compose up -d mini-redis-insight

    print_status "Waiting for services to be ready..."
    sleep 8

    # Check if services are running
    if docker compose ps mini-redis-core | grep -q "Up" && docker compose ps mini-redis-insight | grep -q "Up"; then
        print_success "Mini-Redis microservices are running!"
        print_status "🌐 Web interface: http://localhost:8080"
        print_status "🔌 Redis protocol: localhost:6380"
        print_status "📊 Services: core + insight"
    else
        print_error "Failed to start Mini-Redis services"
        docker compose logs
        exit 1
    fi
}

# Function to start only the core service
start-core() {
    print_header "Starting Mini-Redis Core Only"
    print_service "Starting mini-redis-core..."
    docker compose up -d mini-redis-core

    print_status "Waiting for core service to be ready..."
    sleep 5

    if docker compose ps mini-redis-core | grep -q "Up"; then
        print_success "Mini-Redis core is running!"
        print_status "🔌 Redis protocol: localhost:6380"
    else
        print_error "Failed to start Mini-Redis core"
        docker compose logs mini-redis-core
        exit 1
    fi
}

# Function to run benchmark tests
benchmark() {
    print_header "Running Basic Benchmark Tests"
    print_status "Running basic performance tests..."
    docker compose --profile benchmark up --rm mini-redis-benchmark
    print_success "Basic benchmark completed!"
}

# Function to run stress tests
stress() {
    print_header "Running Stress Tests"
    print_status "Running high-load stress tests..."
    docker compose --profile stress up --rm mini-redis-benchmark-stress
    print_success "Stress tests completed!"
}

# Function to run pub/sub tests
pubsub() {
    print_header "Running Pub/Sub Tests"
    print_status "Running pub/sub performance tests..."
    docker compose --profile pubsub up --rm mini-redis-benchmark-pubsub
    print_success "Pub/Sub tests completed!"
}

# Function to run all benchmark tests
benchmark-all() {
    print_header "Running All Benchmark Tests"
    print_status "Running comprehensive benchmark suite..."
    docker compose --profile benchmark-all up --rm mini-redis-benchmark-all
    print_success "All benchmarks completed!"
}

# Function to start interactive CLI
cli() {
    print_header "Redis CLI"
    print_status "Starting Redis CLI connected to Mini-Redis core..."
    print_warning "Type 'exit' or press Ctrl+C to quit"
    docker compose --profile cli run --rm redis-cli
}

# Function to stop all services
stop() {
    print_header "Stopping All Services"
    print_status "Stopping all Mini-Redis microservices..."
    docker compose down
    print_success "All services stopped!"
}

# Function to view logs
logs() {
    local service=${1:-""}
    if [ -z "$service" ]; then
        print_header "All Service Logs"
        print_status "Showing all service logs (press Ctrl+C to exit)..."
        docker compose logs -f
    else
        print_header "Service Logs: $service"
        print_status "Showing $service logs (press Ctrl+C to exit)..."
        docker compose logs -f "$service"
    fi
}

# Function to show status
status() {
    print_header "Service Status"
    print_status "Mini-Redis microservices status:"
    docker compose ps

    echo ""
    if docker compose ps mini-redis-core | grep -q "Up"; then
        print_success "✅ mini-redis-core: Running (port 6380)"
    else
        print_error "❌ mini-redis-core: Not running"
    fi

    if docker compose ps mini-redis-insight | grep -q "Up"; then
        print_success "✅ mini-redis-insight: Running (port 8080)"
    else
        print_warning "⚠️  mini-redis-insight: Not running"
    fi

    echo ""
    print_status "Access points:"
    print_status "🌐 Web Interface: http://localhost:8080"
    print_status "🔌 Redis Protocol: localhost:6380"
}

# Function to clean up
clean() {
    print_header "Cleaning Up"
    print_status "Cleaning up Docker resources..."
    docker compose down -v --remove-orphans
    docker system prune -f
    print_success "Cleanup completed!"
}

# Function to show help
show_help() {
    print_header "Mini-Redis Microservices Management"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "🏗️  Build Commands:"
    echo "  build              Build all service images"
    echo ""
    echo "🚀 Service Commands:"
    echo "  start              Start core + insight services"
    echo "  start-core         Start only the core Redis service"
    echo "  stop               Stop all services"
    echo "  status             Show service status and health"
    echo ""
    echo "📊 Benchmark Commands:"
    echo "  benchmark          Run basic performance tests"
    echo "  stress             Run high-load stress tests"
    echo "  pubsub             Run pub/sub performance tests"
    echo "  benchmark-all      Run all benchmark scenarios"
    echo ""
    echo "🔧 Utility Commands:"
    echo "  cli                Start interactive Redis CLI"
    echo "  logs [service]     Show logs (all services or specific)"
    echo "  clean              Clean up Docker resources"
    echo "  help               Show this help message"
    echo ""
    echo "📋 Examples:"
    echo "  $0 start                    # Start core + insight services"
    echo "  $0 start-core               # Start only core service"
    echo "  $0 benchmark               # Run performance tests"
    echo "  $0 stress                  # Run stress tests"
    echo "  $0 cli                     # Connect with Redis CLI"
    echo "  $0 logs mini-redis-core    # View core service logs"
    echo ""
    echo "🚀 Quick Start:"
    echo "  $0 build && $0 start && $0 benchmark"
    echo ""
    echo "🏗️  Architecture:"
    echo "  mini-redis-core     - High-performance Redis server (port 6380)"
    echo "  mini-redis-insight  - Web monitoring dashboard (port 8080)"
    echo "  mini-redis-benchmark - Performance testing tools"
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
        start-core)
            build
            start-core
            ;;
        benchmark)
            benchmark
            ;;
        stress)
            stress
            ;;
        pubsub)
            pubsub
            ;;
        benchmark-all)
            benchmark-all
            ;;
        cli)
            cli
            ;;
        stop)
            stop
            ;;
        logs)
            logs "$2"
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
