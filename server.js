const express = require('express');
const puppeteer = require('puppeteer');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Store active sessions
const sessions = new Map();
const browserSessions = new Map();

// Session management
class BrowserSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.jobs = [];
    this.currentJobIndex = 0;
    this.results = [];
    this.status = 'initializing'; // initializing, waiting_for_login, processing, completed, error
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.keepAlive = false; // Keep browser open between batches
    this.closeAfterRun = true; // Close browser after job processing
  }

  async initialize() {
    try {
      console.log(`[${this.sessionId}] Initializing browser...`);
      
      this.browser = await puppeteer.launch({
        headless: 'new', // Always headless for cloud deployment
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-popup-blocking',
          '--disable-extensions',
          '--disable-translate',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--enable-automation',
          '--password-store=basic',
          '--disable-software-rasterizer',
          '--use-gl=swiftshader',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          // Additional args for production
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-client-side-phishing-detection',
          '--disable-default-apps',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--disable-sync',
          '--metrics-recording-only',
          '--no-first-run',
          '--safebrowsing-disable-auto-update',
          '--enable-automation',
          '--password-store=basic',
          '--use-mock-keychain'
        ]
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 720 });
      
      // Set user agent
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      this.status = 'waiting_for_login';
      console.log(`[${this.sessionId}] Browser initialized successfully`);
      
      return true;
    } catch (error) {
      console.error(`[${this.sessionId}] Browser initialization failed:`, error);
      this.status = 'error';
      throw error;
    }
  }

  async navigateToLogin() {
    try {
      console.log(`[${this.sessionId}] Navigating to Upwork login...`);
      await this.page.goto('https://www.upwork.com/ab/account-security/login', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Check if already logged in
      const isLoggedIn = await this.checkLoginStatus();
      if (isLoggedIn) {
        this.isLoggedIn = true;
        this.status = 'processing';
        console.log(`[${this.sessionId}] Already logged in`);
        return true;
      }
      
      console.log(`[${this.sessionId}] Waiting for manual login...`);
      return false;
    } catch (error) {
      console.error(`[${this.sessionId}] Navigation failed:`, error);
      throw error;
    }
  }

  async checkLoginStatus() {
    try {
      // Check for login indicators
      const loginIndicators = await this.page.evaluate(() => {
        // Look for common logged-in elements
        return !!(
          document.querySelector('[data-qa="user-menu"]') ||
          document.querySelector('.user-menu') ||
          document.querySelector('[href*="/freelancers/"]') ||
          document.querySelector('.nav-user') ||
          window.location.href.includes('/nx/') ||
          document.querySelector('[data-test="user-menu"]')
        );
      });
      
      return loginIndicators;
    } catch (error) {
      console.error(`[${this.sessionId}] Login check failed:`, error);
      return false;
    }
  }

  async waitForLogin(timeout = 300000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkInterval = setInterval(async () => {
        try {
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            reject(new Error('Login timeout'));
            return;
          }
          
          const isLoggedIn = await this.checkLoginStatus();
          if (isLoggedIn) {
            this.isLoggedIn = true;
            this.status = 'processing';
            clearInterval(checkInterval);
            console.log(`[${this.sessionId}] Login successful!`);
            resolve(true);
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 2000); // Check every 2 seconds
    });
  }

  async processJobs() {
    try {
      console.log(`[${this.sessionId}] Starting job processing...`);
      
      for (let i = 0; i < this.jobs.length; i++) {
        this.currentJobIndex = i;
        const job = this.jobs[i];
        
        console.log(`[${this.sessionId}] Processing job ${i + 1}/${this.jobs.length}: ${job.jobUrl}`);
        
        try {
          const result = await this.applyToJob(job);
          this.results.push(result);
          console.log(`[${this.sessionId}] Job ${i + 1} completed: ${result.status}`);
        } catch (error) {
          console.error(`[${this.sessionId}] Job ${i + 1} failed:`, error);
          this.results.push({
            jobNumber: i + 1,
            jobUrl: job.jobUrl,
            status: 'failed',
            error: error.message,
            failedAt: new Date().toISOString()
          });
        }
      }
      
      this.status = 'completed';
      console.log(`[${this.sessionId}] All jobs completed`);
      
    } catch (error) {
      console.error(`[${this.sessionId}] Job processing failed:`, error);
      this.status = 'error';
      throw error;
    }
  }

  async applyToJob(job) {
    try {
      // Navigate to job URL
      await this.page.goto(job.jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait a bit for page to load
      await this.page.waitForTimeout(2000);
      
      // Check for Cloudflare
      const hasCloudflare = await this.page.evaluate(() => {
        return !!(
          document.querySelector('#cf-challenge-running') ||
          document.querySelector('.cf-browser-verification') ||
          document.querySelector('[data-ray]') ||
          document.title.includes('Just a moment') ||
          document.body.textContent.includes('Checking your browser')
        );
      });
      
      if (hasCloudflare) {
        console.log(`[${this.sessionId}] Cloudflare detected, waiting for resolution...`);
        // Wait for Cloudflare to be resolved (user needs to solve it manually)
        await this.waitForCloudflareResolution();
      }
      
      // Look for application form elements
      const applicationElements = await this.page.evaluate(() => {
        return {
          hasProposalForm: !!document.querySelector('[data-qa="proposal-textarea"]'),
          hasSubmitButton: !!document.querySelector('[data-qa="submit-proposal"]'),
          hasCoverLetterField: !!document.querySelector('textarea[placeholder*="cover letter"]') ||
                              !!document.querySelector('textarea[placeholder*="proposal"]'),
          hasBidField: !!document.querySelector('input[type="number"]') ||
                       !!document.querySelector('[data-qa="bid-input"]'),
          hasSubmitButton: !!document.querySelector('button[type="submit"]') ||
                          !!document.querySelector('[data-qa="submit"]')
        };
      });
      
      if (!applicationElements.hasProposalForm && !applicationElements.hasCoverLetterField) {
        return {
          jobNumber: this.currentJobIndex + 1,
          jobUrl: job.jobUrl,
          status: 'skipped',
          reason: 'No application form found',
          skippedAt: new Date().toISOString()
        };
      }
      
      // Fill cover letter if field exists
      if (applicationElements.hasCoverLetterField && job.coverLetter) {
        await this.page.evaluate((coverLetter) => {
          const textarea = document.querySelector('textarea[placeholder*="cover letter"]') ||
                          document.querySelector('textarea[placeholder*="proposal"]') ||
                          document.querySelector('[data-qa="proposal-textarea"]');
          if (textarea) {
            textarea.value = coverLetter;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, job.coverLetter);
      }
      
      // Fill bid amount if field exists
      if (applicationElements.hasBidField && job.bidAmount) {
        await this.page.evaluate((bidAmount) => {
          const bidInput = document.querySelector('input[type="number"]') ||
                          document.querySelector('[data-qa="bid-input"]');
          if (bidInput) {
            bidInput.value = bidAmount;
            bidInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, job.bidAmount);
      }
      
      // Submit application
      if (applicationElements.hasSubmitButton) {
        await this.page.click('button[type="submit"]', { timeout: 5000 });
        await this.page.waitForTimeout(3000);
      }
      
      return {
        jobNumber: this.currentJobIndex + 1,
        jobUrl: job.jobUrl,
        status: 'submitted',
        submittedAt: new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(`Job application failed: ${error.message}`);
    }
  }

  async waitForCloudflareResolution(timeout = 120000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkInterval = setInterval(async () => {
        try {
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            reject(new Error('Cloudflare resolution timeout'));
            return;
          }
          
          const hasCloudflare = await this.page.evaluate(() => {
            return !!(
              document.querySelector('#cf-challenge-running') ||
              document.querySelector('.cf-browser-verification') ||
              document.querySelector('[data-ray]') ||
              document.title.includes('Just a moment') ||
              document.body.textContent.includes('Checking your browser')
            );
          });
          
          if (!hasCloudflare) {
            clearInterval(checkInterval);
            console.log(`[${this.sessionId}] Cloudflare resolved`);
            resolve(true);
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 2000);
    });
  }

  async cleanup() {
    try {
      // Only close browser if keepAlive is false or closeAfterRun is true
      if (this.browser && (!this.keepAlive || this.closeAfterRun)) {
        await this.browser.close();
        console.log(`[${this.sessionId}] Browser closed`);
      } else if (this.keepAlive) {
        console.log(`[${this.sessionId}] Browser kept alive for future batches`);
      }
    } catch (error) {
      console.error(`[${this.sessionId}] Cleanup error:`, error);
    }
  }
}

// API Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    currentJob: session.currentJobIndex + 1,
    results: session.results,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity
  });
});

app.post('/session', async (req, res) => {
  try {
    const { jobs, applicationPreferences } = req.body;
    
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'Jobs array is required' });
    }
    
    const sessionId = uuidv4();
    const session = new BrowserSession(sessionId);
    
    // Store jobs and preferences
    session.jobs = jobs;
    session.applicationPreferences = applicationPreferences || {};
    
    // Initialize browser
    await session.initialize();
    
    // Store session
    sessions.set(sessionId, session);
    browserSessions.set(sessionId, session);
    
    // Navigate to login
    await session.navigateToLogin();
    
    res.json({
      sessionId,
      status: session.status,
      browserUrl: `${req.protocol}://${req.get('host')}/browser/${sessionId}`,
      message: 'Session created. Please login to Upwork in the browser window.'
    });
    
  } catch (error) {
    console.error('Session creation failed:', error);
    res.status(500).json({ error: 'Failed to create session', details: error.message });
  }
});

app.post('/session/:sessionId/start-processing', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.status !== 'processing') {
      return res.status(400).json({ error: 'Session not ready for processing' });
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
      submitted: session.results.filter(r => r.status === 'submitted').length,
      skipped: session.results.filter(r => r.status === 'skipped').length,
      failed: session.results.filter(r => r.status === 'failed').length
    }
  });
});

// WebSocket for real-time updates
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe' && data.sessionId) {
        ws.sessionId = data.sessionId;
        console.log(`Client subscribed to session ${data.sessionId}`);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Broadcast updates to subscribed clients
function broadcastUpdate(sessionId, data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.sessionId === sessionId) {
      client.send(JSON.stringify(data));
    }
  });
}

// Cleanup inactive sessions
setInterval(() => {
  const now = new Date();
  const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > inactiveThreshold) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      session.cleanup();
      sessions.delete(sessionId);
      browserSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Keep browser alive between batches
app.post('/session/:sessionId/keep-alive', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Keep browser open for future batches
    session.keepAlive = true;
    session.closeAfterRun = false;
    session.lastActivity = new Date();
    
    console.log(`[${sessionId}] Browser marked to stay alive between batches`);
    
    res.json({ 
      message: 'Browser will stay alive for future batches',
      sessionId,
      keepAlive: true
    });
    
  } catch (error) {
    console.error('Keep alive failed:', error);
    res.status(500).json({ error: 'Failed to keep browser alive', details: error.message });
  }
});

// Reuse existing session for new batch
app.post('/session/:sessionId/reuse', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { jobs, applicationPreferences } = req.body;
    
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.keepAlive) {
      return res.status(400).json({ error: 'Session not marked for reuse' });
    }
    
    // Update session with new jobs
    session.jobs = jobs;
    session.applicationPreferences = applicationPreferences || {};
    session.currentJobIndex = 0;
    session.results = [];
    session.status = 'ready_for_processing';
    session.lastActivity = new Date();
    
    console.log(`[${sessionId}] Session reused for new batch of ${jobs.length} jobs`);
    
    res.json({
      sessionId,
      status: session.status,
      browserUrl: `${req.protocol}://${req.get('host')}/browser/${sessionId}`,
      message: 'Session reused successfully. Browser is ready for new batch.'
    });
    
  } catch (error) {
    console.error('Session reuse failed:', error);
    res.status(500).json({ error: 'Failed to reuse session', details: error.message });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  for (const [sessionId, session] of sessions.entries()) {
    await session.cleanup();
  }
  
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Upwork Backend Server running on port ${PORT}`);
  console.log(`WebSocket server running on port 8080`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
