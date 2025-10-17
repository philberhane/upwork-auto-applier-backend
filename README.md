# Upwork Auto Applier - Backend

This is the backend server for the Upwork Auto Applier. Deploy this to Railway, Render, or any Node.js hosting service.

## 🚀 Current Status

✅ **API Ready** - Backend accepts job requests and creates sessions
🔄 **Browser Integration** - Coming in next update
📊 **Session Management** - Tracks jobs and results
🌐 **Deployment Ready** - Lightweight, fast deployment

## Quick Deploy

### Railway
1. Connect this repository to Railway
2. Deploy automatically

### Render
1. Connect this repository to Render
2. Deploy automatically

## Environment Variables

Set these in your hosting platform:

```env
NODE_ENV=production
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

## Next Steps

1. **Deploy backend** - Get it running on Render/Railway
2. **Test API** - Verify it accepts requests
3. **Add browser functionality** - Integrate Puppeteer
4. **Full automation** - Complete Upwork processing