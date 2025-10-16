@echo off
echo 🚀 Starting Upwork Auto Applier External Backend...

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

REM Check if package.json exists
if not exist "package.json" (
    echo ❌ package.json not found. Please run this script from the backend directory.
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies.
        pause
        exit /b 1
    )
)

REM Check if .env exists, if not copy from example
if not exist ".env" (
    echo ⚙️  Creating .env file from template...
    copy env.example .env
    echo 📝 Please edit .env file with your configuration before starting.
    echo 🔧 Required: SESSION_SECRET (generate a random string)
    echo.
    echo Press any key to continue...
    pause >nul
    exit /b 1
)

REM Start the server
echo 🌐 Starting server on port %PORT% (default: 3000)...
echo 📊 WebSocket server on port 8080...
echo 🔗 Open http://localhost:%PORT% to view the interface
echo.
echo Press Ctrl+C to stop the server
echo.

npm start
