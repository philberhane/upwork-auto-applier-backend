const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Disable CSP temporarily to test
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Store active sessions
const sessions = new Map();

// Browser session management
class BrowserSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.browser = null;
    this.page = null;
    this.jobs = [];
    this.results = [];
    this.status = 'waiting_for_browser';
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.isLoggedIn = false;
    this.keepAlive = false;
    this.closeAfterRun = true;
  }

  async launchBrowser() {
    try {
      console.log(`[${this.sessionId}] Launching browser...`);
      
      const launchOptions = {
        headless: false, // Show browser for user interaction
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      };

      this.browser = await puppeteer.launch(launchOptions);
      this.page = await this.browser.newPage();
      
      // Set viewport
      await this.page.setViewport({ width: 1280, height: 720 });
      
      // Navigate to Upwork for login
      await this.page.goto('https://www.upwork.com', { waitUntil: 'networkidle2' });
      
      this.status = 'waiting_for_login';
      console.log(`[${this.sessionId}] Browser launched and navigated to Upwork`);
      
      // Start monitoring for login
      this.startLoginMonitoring();
      
      return true;
    } catch (error) {
      console.error(`[${this.sessionId}] Browser launch failed:`, error);
      this.status = 'error';
      throw error;
    }
  }

  startLoginMonitoring() {
    // Check for login every 5 seconds
    const checkInterval = setInterval(async () => {
      try {
        // Check if we're on Upwork and logged in
        const currentUrl = this.page.url();
        const isOnUpwork = currentUrl.includes('upwork.com');
        
        if (isOnUpwork) {
          // Check for login indicators
          const isLoggedIn = await this.page.evaluate(() => {
            // Look for common login indicators
            return document.querySelector('[data-test="user-menu"]') !== null ||
                   document.querySelector('.user-menu') !== null ||
                   document.querySelector('[data-cy="user-menu"]') !== null ||
                   document.querySelector('.upwork-header-user') !== null ||
                   window.location.href.includes('/nx/') ||
                   document.querySelector('a[href*="/logout"]') !== null;
          });
          
          if (isLoggedIn) {
            console.log(`[${this.sessionId}] Login detected!`);
            this.isLoggedIn = true;
            this.status = 'logged_in';
            clearInterval(checkInterval);
            
            // Start processing jobs
            this.processJobs().catch(error => {
              console.error(`[${this.sessionId}] Job processing failed:`, error);
            });
          }
        }
      } catch (error) {
        console.log(`[${this.sessionId}] Login check error:`, error.message);
      }
    }, 5000);
    
    // Stop monitoring after 10 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!this.isLoggedIn) {
        console.log(`[${this.sessionId}] Login monitoring timeout`);
      }
    }, 600000); // 10 minutes
  }

  async processJobs() {
    try {
      console.log(`[${this.sessionId}] Processing ${this.jobs.length} jobs...`);
      this.status = 'processing';
      
      for (let i = 0; i < this.jobs.length; i++) {
        const job = this.jobs[i];
        
        try {
          console.log(`[${this.sessionId}] Processing job ${i + 1}: ${job.jobUrl}`);
          
          // Navigate to job page
          await this.page.goto(job.jobUrl, { waitUntil: 'networkidle2' });
          
          // Wait a bit for page to load
          await this.page.waitForTimeout(2000);
          
          // Check if we're on Upwork login page
          const isLoginPage = await this.page.$('input[name="username"]') !== null;
          if (isLoginPage) {
            console.log(`[${this.sessionId}] Job ${i + 1}: Login required`);
            this.results.push({
              jobNumber: i + 1,
              jobUrl: job.jobUrl,
              status: 'login_required',
              message: 'Please log in to Upwork first',
              processedAt: new Date().toISOString()
            });
            continue;
          }
          
          // Check if job is still available
          const isJobAvailable = await this.page.$('.job-details') !== null;
          if (!isJobAvailable) {
            console.log(`[${this.sessionId}] Job ${i + 1}: Not available`);
            this.results.push({
              jobNumber: i + 1,
              jobUrl: job.jobUrl,
              status: 'not_available',
              message: 'Job is no longer available',
              processedAt: new Date().toISOString()
            });
            continue;
          }
          
          // Try to apply to job
          const applyButton = await this.page.$('button[data-test="submit-btn"]');
          if (applyButton) {
            console.log(`[${this.sessionId}] Job ${i + 1}: Apply button found`);
            this.results.push({
              jobNumber: i + 1,
              jobUrl: job.jobUrl,
              status: 'ready_to_apply',
              message: 'Job ready for application',
              processedAt: new Date().toISOString()
            });
          } else {
            console.log(`[${this.sessionId}] Job ${i + 1}: No apply button found`);
            this.results.push({
              jobNumber: i + 1,
              jobUrl: job.jobUrl,
              status: 'no_apply_button',
              message: 'No apply button found on job page',
              processedAt: new Date().toISOString()
            });
          }
          
        } catch (jobError) {
          console.error(`[${this.sessionId}] Job ${i + 1} failed:`, jobError);
          this.results.push({
            jobNumber: i + 1,
            jobUrl: job.jobUrl,
            status: 'error',
            message: `Error: ${jobError.message}`,
            processedAt: new Date().toISOString()
          });
        }
      }
      
      this.status = 'completed';
      console.log(`[${this.sessionId}] All jobs processed`);
      
    } catch (error) {
      console.error(`[${this.sessionId}] Job processing failed:`, error);
      this.status = 'error';
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log(`[${this.sessionId}] Browser closed`);
      } catch (error) {
        console.error(`[${this.sessionId}] Error closing browser:`, error);
      }
    }
  }
}

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Upwork Auto Applier Backend',
    status: 'running',
    version: '1.0.1',
    puppeteer: 'enabled',
    csp: 'disabled'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/session', async (req, res) => {
  try {
    const { jobs, applicationPreferences, keepAlive = false, closeAfterRun = true } = req.body;
    
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'Jobs array is required' });
    }
    
    const sessionId = uuidv4();
    const session = new BrowserSession(sessionId);
    
    // Store jobs and preferences
    session.jobs = jobs;
    session.applicationPreferences = applicationPreferences || {};
    session.keepAlive = keepAlive;
    session.closeAfterRun = closeAfterRun;
    
    // Store session
    sessions.set(sessionId, session);
    
    // Launch browser
    await session.launchBrowser();
    
    res.json({
      sessionId,
      status: session.status,
      browserUrl: `${req.protocol}://${req.get('host')}/browser/${sessionId}`,
      message: 'Session created with browser ready!'
    });
    
  } catch (error) {
    console.error('Session creation failed:', error);
    res.status(500).json({ error: 'Failed to create session', details: error.message });
  }
});

app.get('/session/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    sessionId: session.sessionId,
    status: session.status,
    isLoggedIn: session.isLoggedIn,
    jobsCount: session.jobs.length,
    currentJob: session.results.length,
    results: session.results,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    browserUrl: `${req.protocol}://${req.get('host')}/browser/${sessionId}`
  });
});

app.post('/session/:sessionId/start-processing', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.browser) {
      return res.status(400).json({ error: 'Browser not ready' });
    }
    
    // Start processing in background
    session.processJobs().catch(error => {
      console.error(`[${sessionId}] Background processing error:`, error);
    });
    
    res.json({ message: 'Job processing started' });
    
  } catch (error) {
    console.error('Start processing failed:', error);
    res.status(500).json({ error: 'Failed to start processing', details: error.message });
  }
});

app.get('/session/:sessionId/results', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    sessionId,
    status: session.status,
    results: session.results,
    summary: {
      total: session.jobs.length,
      completed: session.results.length,
      pending: session.jobs.length - session.results.length,
      errors: session.results.filter(r => r.status === 'error').length
    }
  });
});

// Browser interface route
app.get('/browser/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).send(`
      <html>
        <head>
          <title>Session Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #1a1a1a; color: white; }
            .error { color: #ff6b6b; }
          </style>
        </head>
        <body>
          <h1 class="error">Session Not Found</h1>
          <p>Session ID: ${sessionId}</p>
          <p>This session may have expired or doesn't exist.</p>
        </body>
      </html>
    `);
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Upwork Auto Applier - Browser Session</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: #1a1a1a; 
            color: white; 
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            padding: 20px; 
            border-radius: 10px; 
            margin-bottom: 20px; 
            text-align: center; 
          }
          .status { 
            background: #2d2d2d; 
            padding: 15px; 
            border-radius: 8px; 
            margin-bottom: 20px; 
          }
          .browser-section { 
            background: #2d2d2d; 
            padding: 20px; 
            border-radius: 8px; 
            text-align: center; 
          }
          .browser-btn { 
            background: #4CAF50; 
            color: white; 
            padding: 15px 30px; 
            border: none; 
            border-radius: 5px; 
            font-size: 16px; 
            cursor: pointer; 
            margin: 10px; 
          }
          .browser-btn:hover { background: #45a049; }
          .instructions { 
            background: #2d2d2d; 
            padding: 15px; 
            border-radius: 8px; 
            margin-top: 20px; 
          }
          .progress { 
            background: #2d2d2d; 
            padding: 15px; 
            border-radius: 8px; 
            margin-top: 20px; 
          }
          .results { 
            background: #2d2d2d; 
            padding: 15px; 
            border-radius: 8px; 
            margin-top: 20px; 
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🚀 Upwork Auto Applier</h1>
          <p>Interactive Browser Backend</p>
        </div>
        
        <div class="status">
          <h3>📊 Session Status: ${session.status}</h3>
          <p><strong>Session ID:</strong> <code>${sessionId}</code></p>
          <p><strong>Created:</strong> ${session.createdAt.toISOString()}</p>
          <p><strong>Last Activity:</strong> ${session.lastActivity.toISOString()}</p>
        </div>
        
        <div class="browser-section">
          <h3>🌐 Interactive Browser</h3>
          <p>The browser is automatically launched and navigated to Upwork. Please log in directly in the browser window.</p>
          <div id="status-message" style="margin-top: 15px;">
            <p style="color: #4CAF50;">✅ Browser is ready! Please log into Upwork in the browser window.</p>
          </div>
        </div>
        
        <div class="instructions">
          <h3>📋 Instructions</h3>
          <ol>
            <li>Look for the browser window that opened automatically</li>
            <li>Log into your Upwork account in that browser</li>
            <li>Handle any Cloudflare or security challenges</li>
            <li>Return to this page to monitor progress</li>
            <li>The system will automatically process your job applications</li>
          </ol>
        </div>
        
        <div class="progress">
          <h3>📊 Job Progress</h3>
          <p>Processing job ${session.results.length} of ${session.jobs.length}</p>
        </div>
        
        <div class="results">
          <h3>📈 Results</h3>
          <div id="results">
            ${session.results.length > 0 ? 
              session.results.map(r => `<p>Job ${r.jobNumber}: ${r.status} - ${r.message}</p>`).join('') : 
              '<p>No results yet...</p>'
            }
          </div>
        </div>
        
        <script>
          // Auto-refresh page every 10 seconds to show updated results
          setInterval(() => {
            location.reload();
          }, 10000);
        </script>
      </body>
    </html>
  `);
});

app.post('/session/:sessionId/keep-alive', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.lastActivity = new Date();
  res.json({ message: 'Session kept alive' });
});

app.post('/session/:sessionId/reuse', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const { jobs, applicationPreferences } = req.body;
    
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'Jobs array is required' });
    }
    
    // Update session with new jobs
    session.jobs = jobs;
    session.applicationPreferences = applicationPreferences || {};
    session.results = [];
    session.status = 'ready';
    session.lastActivity = new Date();
    
    res.json({
      sessionId,
      status: session.status,
      message: 'Session updated with new jobs',
      jobsCount: session.jobs.length
    });
    
  } catch (error) {
    console.error('Session reuse failed:', error);
    res.status(500).json({ error: 'Failed to reuse session', details: error.message });
  }
});

// Cleanup inactive sessions
setInterval(() => {
  const now = new Date();
  const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > inactiveThreshold) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      session.close();
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // Close all browser sessions
  for (const [sessionId, session] of sessions.entries()) {
    console.log(`Closing session: ${sessionId}`);
    await session.close();
  }
  
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Upwork Backend Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Puppeteer enabled with Railway Pro support');
  console.log('CSP updated to allow inline scripts');
});