# Upwork Auto Applier - Backend

This is the backend server for the Upwork Auto Applier. Deploy this to Railway, Render, or any Node.js hosting service.

## 🚀 Current Status

✅ **API Ready** - Backend accepts job requests and creates sessions
✅ **Browser Integration** - Full Puppeteer automation optimized for Railway Pro
✅ **Session Management** - Tracks jobs and results
✅ **Deployment Ready** - Optimized for Railway Pro (no Docker needed)

## Quick Deploy

### Railway Pro (Recommended - $5/month)
1. Sign up for [Railway Pro](https://railway.app/pricing)
2. Connect this repository to Railway
3. Deploy automatically (no Docker needed)
4. Set environment variables (optional):
   - `NODE_ENV=production`
   - `SESSION_SECRET=your-secret-key`

### Railway Free Tier
1. Connect this repository to Railway
2. Deploy automatically
3. Note: May have limitations with Puppeteer

## Environment Variables

Set these in your hosting platform (optional for Railway Pro):

```env
NODE_ENV=production
SESSION_SECRET=your-super-secret-key-here
ALLOWED_ORIGINS=https://console.apify.com,https://apify.com
PORT=3000
```

**Note**: Railway Pro handles Puppeteer automatically - no special environment variables needed!

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

1. **Railway Pro Runtime** - Optimized Node.js environment with Puppeteer support
2. **Browser Automation** - Full Puppeteer support for Upwork interaction
3. **Session Management** - Tracks browser sessions and job processing
4. **API Integration** - Connects to Apify actor for job data

## Features

- ✅ **Full Puppeteer Support** - Real browser automation
- ✅ **Upwork Integration** - Job application processing
- ✅ **Session Persistence** - Keep browser alive between batches
- ✅ **Error Handling** - Robust error management
- ✅ **Railway Pro Optimized** - Always-on, reliable hosting
- ✅ **No Docker Complexity** - Simple Node.js deployment