# 🚀 Render Deployment Guide

## Step-by-Step Instructions

### 1. Create New Web Service on Render

1. Go to [render.com](https://render.com) and sign in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository:
   - Paste: `https://github.com/philberhane/upwork-auto-applier-backend`
   - Click **"Continue"**

### 2. Configure Service Settings

**Basic Settings:**
- **Name**: `upwork-auto-applier-backend` (or your preferred name)
- **Region**: `Ohio (US East)` (recommended)
- **Branch**: `main`
- **Runtime**: `Docker` (auto-detected)

**Build & Deploy:**
- **Build Command**: (leave empty - Docker handles this)
- **Start Command**: (leave empty - Docker handles this)

### 3. Set Environment Variables

Click **"Advanced"** and add these environment variables:

```env
NODE_ENV=production
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
SESSION_SECRET=your-super-secret-key-here
ALLOWED_ORIGINS=https://console.apify.com,https://apify.com
PORT=3000
```

### 4. Deploy

1. Click **"Create Web Service"**
2. Wait for deployment (5-10 minutes)
3. Your backend will be available at: `https://your-app-name.onrender.com`

## ✅ Verification

### Test the API:

1. **Health Check**: `GET https://your-app-name.onrender.com/health`
2. **Root Endpoint**: `GET https://your-app-name.onrender.com/`

Expected response:
```json
{
  "message": "Upwork Auto Applier Backend",
  "status": "running",
  "version": "1.0.0",
  "puppeteer": "enabled"
}
```

### Test with Apify Actor:

1. Go to your Apify actor
2. Set `backendUrl` to your Render URL
3. Run the actor with job data
4. Check the logs for browser URL

## 🔧 Troubleshooting

### Build Fails
- **Issue**: Docker build timeout
- **Solution**: Wait and retry, or check logs for specific errors

### Puppeteer Not Working
- **Issue**: Chrome not found
- **Solution**: Verify environment variables are set correctly

### Service Spins Down
- **Issue**: Free tier spins down after 15 minutes
- **Solution**: Use [Uptime Robot](https://uptimerobot.com) to ping every 5 minutes

## 📊 Monitoring

- **Logs**: Available in Render dashboard
- **Metrics**: CPU, Memory, Response time
- **Uptime**: Check service status

## 🎯 Next Steps

1. **Get your backend URL** from Render
2. **Update your Apify actor** with the backend URL
3. **Test the full workflow** with real job data
4. **Set up monitoring** to keep service alive

## 💡 Pro Tips

- **Free Tier Limits**: 750 hours/month, spins down after 15 min inactivity
- **Keep Alive**: Use Uptime Robot or similar service
- **Scaling**: Upgrade to paid plan for always-on service
- **Custom Domain**: Available on paid plans

---

**Your backend is now ready for Upwork automation! 🎉**
