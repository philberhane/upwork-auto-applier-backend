# 🚀 Railway Pro Deployment Guide

## Why Railway Pro?

- ✅ **Always-on service** - No spin-downs
- ✅ **Better performance** - More CPU and RAM
- ✅ **Puppeteer support** - Works out of the box
- ✅ **Simple deployment** - No Docker needed
- ✅ **Reliable hosting** - Perfect for production

## Step-by-Step Instructions

### 1. Sign Up for Railway Pro

1. Go to [railway.app](https://railway.app)
2. Click **"Sign Up"** or **"Log In"**
3. Go to [Pricing](https://railway.app/pricing)
4. Click **"Upgrade to Pro"** ($5/month)
5. Complete payment setup

### 2. Create New Project

1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Connect your GitHub account
4. Select repository: `philberhane/upwork-auto-applier-backend`
5. Click **"Deploy Now"**

### 3. Configure Service

Railway will automatically:
- ✅ Detect Node.js runtime
- ✅ Install dependencies
- ✅ Start the server
- ✅ Handle Puppeteer

**No additional configuration needed!**

### 4. Get Your Backend URL

1. Go to your project dashboard
2. Click on your service
3. Go to **"Settings"** → **"Domains"**
4. Copy your Railway URL (e.g., `https://your-app.railway.app`)

### 5. Test the Backend

**Health Check:**
```bash
curl https://your-app.railway.app/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Root Endpoint:**
```bash
curl https://your-app.railway.app/
```

**Expected Response:**
```json
{
  "message": "Upwork Auto Applier Backend",
  "status": "running",
  "version": "1.0.0",
  "puppeteer": "enabled"
}
```

## 🔧 Optional Configuration

### Environment Variables (Optional)

In Railway dashboard → **"Variables"**:

```env
NODE_ENV=production
SESSION_SECRET=your-super-secret-key-here
ALLOWED_ORIGINS=https://console.apify.com,https://apify.com
```

### Custom Domain (Optional)

1. Go to **"Settings"** → **"Domains"**
2. Add your custom domain
3. Configure DNS records
4. Enable SSL (automatic)

## 🎯 Next Steps

### 1. Update Apify Actor

1. Go to your Apify actor
2. Set `backendUrl` to your Railway URL
3. Test with sample job data

### 2. Test Full Workflow

1. Run your Apify actor
2. Check logs for browser URL
3. Verify job processing works

### 3. Monitor Performance

- **Logs**: Available in Railway dashboard
- **Metrics**: CPU, Memory, Response time
- **Uptime**: 99.9% guaranteed

## 💰 Cost Breakdown

- **Railway Pro**: $5/month
- **Always-on service**: No spin-downs
- **Better performance**: More resources
- **Reliable hosting**: Production-ready

## 🚨 Troubleshooting

### Build Fails
- **Issue**: npm install fails
- **Solution**: Check logs, ensure all dependencies are in package.json

### Puppeteer Not Working
- **Issue**: Browser launch fails
- **Solution**: Railway Pro handles this automatically

### Service Not Starting
- **Issue**: Port binding errors
- **Solution**: Ensure PORT environment variable is set

## 📊 Monitoring

- **Real-time logs**: Available in dashboard
- **Performance metrics**: CPU, Memory, Network
- **Error tracking**: Automatic error detection
- **Uptime monitoring**: Built-in health checks

## 🎉 Success!

Your backend is now running on Railway Pro with:
- ✅ **Full Puppeteer support**
- ✅ **Always-on availability**
- ✅ **Production-ready performance**
- ✅ **Simple maintenance**

**Ready for Upwork automation! 🚀**
