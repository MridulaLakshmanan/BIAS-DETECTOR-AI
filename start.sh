#!/bin/bash
# AI Bias Firewall - Unified Startup Script

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "Starting AI Bias Firewall..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    lsof -i :$1 2>/dev/null | grep LISTEN > /dev/null
}

# Start Bias Detector (Python FastAPI)
start_bias_detector() {
    if check_port 5001; then
        echo -e "${YELLOW}Bias Detector already running on port 5001${NC}"
    else
        echo "Starting Bias Detector on port 5001..."
        cd "$ROOT_DIR/bias-detector-tool"
        source venv/bin/activate 2>/dev/null || true
        nohup venv/bin/python detector.py > /tmp/bias-detector.log 2>&1 &
        sleep 2
        if check_port 5001; then
            echo -e "${GREEN}✓ Bias Detector running on http://localhost:5001${NC}"
        else
            echo -e "${RED}✗ Bias Detector failed to start${NC}"
        fi
    fi
}

# Start Backend (Node.js Express)
start_backend() {
    if check_port 3000; then
        echo -e "${YELLOW}Backend already running on port 3000${NC}"
    else
        echo "Starting Backend on port 3000..."
        cd "$ROOT_DIR/backend"
        nohup npm start > /tmp/backend.log 2>&1 &
        sleep 2
        if check_port 3000; then
            echo -e "${GREEN}✓ Backend running on http://localhost:3000${NC}"
        else
            echo -e "${RED}✗ Backend failed to start${NC}"
        fi
    fi
}

# Start Frontend (Vite)
start_frontend() {
    if check_port 5173; then
        echo -e "${YELLOW}Frontend already running on port 5173${NC}"
    else
        echo "Starting Frontend on port 5173..."
        cd "$ROOT_DIR/frontend"
        nohup node node_modules/vite/bin/vite.js > /tmp/frontend.log 2>&1 &
        sleep 2
        if check_port 5173; then
            echo -e "${GREEN}✓ Frontend running on http://localhost:5173${NC}"
        else
            echo -e "${RED}✗ Frontend failed to start${NC}"
        fi
    fi
}

# Start all services
start_bias_detector
start_backend
start_frontend

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AI Bias Firewall is running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Frontend:     http://localhost:5173"
echo "  Backend API:   http://localhost:3000"
echo "  Bias Detector: http://localhost:5001"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for interrupt to keep services running
trap "pkill -f 'node.*vite\|node.*app/index\|python.*detector' 2>/dev/null; echo 'Services stopped'; exit" INT TERM
wait