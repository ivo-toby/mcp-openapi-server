#!/bin/bash
# Test script for the Streamable HTTP transport

# Default values
PORT=3000
HOST="127.0.0.1"
PATH="/mcp"
API_BASE_URL=${API_BASE_URL:-"https://api.example.com"}
OPENAPI_SPEC=${OPENAPI_SPEC_PATH:-"https://api.example.com/openapi.json"}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --port) PORT="$2"; shift ;;
    --host) HOST="$2"; shift ;;
    --path) PATH="$2"; shift ;;
    --api-base-url) API_BASE_URL="$2"; shift ;;
    --openapi-spec) OPENAPI_SPEC="$2"; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

# Function to show usage
show_usage() {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  --port PORT         Port number (default: 3000)"
  echo "  --host HOST         Host (default: 127.0.0.1)"
  echo "  --path PATH         Path (default: /mcp)"
  echo "  --api-base-url URL  API base URL"
  echo "  --openapi-spec URL  OpenAPI spec URL"
  exit 1
}

# Check required parameters
if [[ -z "$API_BASE_URL" || -z "$OPENAPI_SPEC" ]]; then
  echo "Error: API_BASE_URL and OPENAPI_SPEC_PATH are required"
  show_usage
fi

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting MCP Server with HTTP transport...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"

# Start the server in the background
node dist/bundle.js \
  --transport http \
  --port $PORT \
  --host $HOST \
  --path $PATH \
  --api-base-url $API_BASE_URL \
  --openapi-spec $OPENAPI_SPEC &

SERVER_PID=$!

# Sleep to let the server start
sleep 2

# Function to cleanup on exit
cleanup() {
  echo -e "\n${RED}Stopping server...${NC}"
  kill $SERVER_PID
  exit 0
}

# Trap ctrl-c
trap cleanup INT

# URL for requests
URL="http://$HOST:$PORT$PATH"

# Initialize request data
INIT_DATA='{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "client": {
      "name": "test-client",
      "version": "1.0.0"
    },
    "protocol": {
      "name": "mcp",
      "version": "2025-03-26"
    }
  }
}'

echo -e "${GREEN}Initializing session...${NC}"
INIT_RESPONSE=$(curl -s -X POST $URL \
  -H "Content-Type: application/json" \
  -d "$INIT_DATA")

# Extract session ID from response headers
SESSION_ID=$(curl -s -i -X POST $URL \
  -H "Content-Type: application/json" \
  -d "$INIT_DATA" | grep -i "Mcp-Session-Id" | awk '{print $2}' | tr -d '\r')

if [ -z "$SESSION_ID" ]; then
  echo -e "${RED}Failed to get session ID${NC}"
  cleanup
fi

echo -e "${GREEN}Session initialized with ID: ${YELLOW}$SESSION_ID${NC}"

# Send initialized notification
echo -e "${GREEN}Sending initialized notification...${NC}"
curl -s -X POST $URL \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialized"
  }'

# List tools
echo -e "${GREEN}Listing tools...${NC}"
curl -s -X POST $URL \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "listTools"
  }'

echo -e "\n${GREEN}Server is running. Open a new terminal and try:${NC}"
echo -e "${YELLOW}curl -N $URL -H \"Mcp-Session-Id: $SESSION_ID\"${NC}"
echo -e "${YELLOW}This will open a streaming connection.${NC}"
echo -e "\n${GREEN}In another terminal, try sending requests:${NC}"
echo -e "${YELLOW}curl -X POST $URL -H \"Content-Type: application/json\" -H \"Mcp-Session-Id: $SESSION_ID\" -d '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"listTools\"}'${NC}"

# Keep the script running
while true; do
  sleep 1
done