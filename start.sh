#!/bin/bash

# Upwork Auto Applier - External Backend Startup Script

echo "🚀 Starting Upwork Auto Applier External Backend..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Please run this script from the backend directory."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env exists, if not copy from example
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file from template..."
    cp env.example .env
    echo "📝 Please edit .env file with your configuration before starting."
    echo "🔧 Required: SESSION_SECRET (generate a random string)"
    exit 1
fi

# Start the server
echo "🌐 Starting server on port ${PORT:-3000}..."
echo "📊 WebSocket server on port 8080..."
echo "🔗 Open http://localhost:${PORT:-3000} to view the interface"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start
