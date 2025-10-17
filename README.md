# Upwork Auto Applier - Backend

This is the backend server for the Upwork Auto Applier. Deploy this to Railway, Render, or any Node.js hosting service.

## 🚀 Current Status

✅ **API Ready** - Backend accepts job requests and creates sessions
✅ **Browser Integration** - Full Puppeteer automation with Docker
✅ **Session Management** - Tracks jobs and results
✅ **Deployment Ready** - Dockerized for Render free tier

## Quick Deploy

### Render (Recommended - Free Tier)
1. Connect this repository to Render
2. Select "Docker" as the runtime (auto-detected)
3. Set environment variables:
   - `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
   - `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`
4. Deploy automatically

### Railway
1. Connect this repository to Railway
2. Deploy automatically (Docker support)

## Environment Variables

Set these in your hosting platform:

```env
NODE_ENV=production
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
SESSION_SECRET=your-super-secret-key-here
ALLOWED_ORIGINS=https://console.apify.com,https://apify.com
PORT=3000
```

## API Endpoints

- `GET /` - Health check
- `POST /session` - Create new session
- `GET /session/:id` - Get session status
- `POST /session/:id/start-processing` - Start job processing
- `GET /session/:id/results` - Get job results

## Usage

This backend provides an API for the Upwork Auto Applier actor to:
- Create browser sessions
- Process job applications
- Handle user interactions
- Return results

The actor connects to this backend to get a browser URL for users to interact with.

## How It Works

1. **Docker Base Image** - Uses Puppeteer's official Docker image with pre-installed Chrome
2. **Browser Automation** - Full Puppeteer support for Upwork interaction
3. **Session Management** - Tracks browser sessions and job processing
4. **API Integration** - Connects to Apify actor for job data

## Features

- ✅ **Full Puppeteer Support** - Real browser automation
- ✅ **Upwork Integration** - Job application processing
- ✅ **Session Persistence** - Keep browser alive between batches
- ✅ **Error Handling** - Robust error management
- ✅ **Free Tier Compatible** - Works on Render's free plan