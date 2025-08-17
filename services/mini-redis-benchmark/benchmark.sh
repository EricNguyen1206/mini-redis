#!/bin/bash

# Simple benchmark script for Mini-Redis
echo "🚀 Mini-Redis Benchmark Test"
echo "=============================="

# Check if server is running
if ! curl -s http://localhost:8080/api/performance > /dev/null; then
    echo "❌ Mini-Redis server is not running on localhost:8080"
    echo "Please start the server first with: ./docker-run.sh start"
    exit 1
fi

echo "✅ Mini-Redis server is running"
echo ""

# Test basic operations
echo "📝 Testing SET operations..."
start_time=$(date +%s.%N)
for i in {1..1000}; do
    curl -s -X POST http://localhost:8080/api/command \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"SET benchmark_key_$i value_$i\"}" > /dev/null
done
end_time=$(date +%s.%N)
set_duration=$(echo "$end_time - $start_time" | bc)
set_ops_per_sec=$(echo "scale=2; 1000 / $set_duration" | bc)

echo "✅ 1000 SET operations completed in ${set_duration}s (${set_ops_per_sec} ops/sec)"

# Test GET operations
echo "📖 Testing GET operations..."
start_time=$(date +%s.%N)
for i in {1..1000}; do
    curl -s -X POST http://localhost:8080/api/command \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"GET benchmark_key_$i\"}" > /dev/null
done
end_time=$(date +%s.%N)
get_duration=$(echo "$end_time - $start_time" | bc)
get_ops_per_sec=$(echo "scale=2; 1000 / $get_duration" | bc)

echo "✅ 1000 GET operations completed in ${get_duration}s (${get_ops_per_sec} ops/sec)"

# Test mixed operations
echo "🔄 Testing mixed operations (SET/GET/DEL)..."
start_time=$(date +%s.%N)
for i in {1..300}; do
    # SET
    curl -s -X POST http://localhost:8080/api/command \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"SET mixed_key_$i value_$i\"}" > /dev/null
    
    # GET
    curl -s -X POST http://localhost:8080/api/command \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"GET mixed_key_$i\"}" > /dev/null
    
    # DEL
    curl -s -X POST http://localhost:8080/api/command \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"DEL mixed_key_$i\"}" > /dev/null
done
end_time=$(date +%s.%N)
mixed_duration=$(echo "$end_time - $start_time" | bc)
mixed_ops_per_sec=$(echo "scale=2; 900 / $mixed_duration" | bc)

echo "✅ 900 mixed operations completed in ${mixed_duration}s (${mixed_ops_per_sec} ops/sec)"

# Get performance stats
echo ""
echo "📊 Current Performance Stats:"
if command -v jq &> /dev/null; then
    curl -s http://localhost:8080/api/performance | jq '.'
else
    curl -s http://localhost:8080/api/performance
fi

echo ""
echo "🎯 Benchmark Summary:"
echo "   SET Operations: ${set_ops_per_sec} ops/sec"
echo "   GET Operations: ${get_ops_per_sec} ops/sec"
echo "   Mixed Operations: ${mixed_ops_per_sec} ops/sec"
echo ""
echo "🌐 Check the web interface at http://localhost:8080 for real-time metrics and charts!"
