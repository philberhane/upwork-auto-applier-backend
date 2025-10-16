# Upwork Auto Applier - Backend

This is the backend server for the Upwork Auto Applier. Deploy this to Railway, Render, or any Node.js hosting service.

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

## Usage

This backend provides an API for the Upwork Auto Applier actor to:
- Create browser sessions
- Process job applications
- Handle user interactions
- Return results

The actor connects to this backend to get a browser URL for users to interact with.