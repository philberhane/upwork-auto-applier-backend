const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
// const puppeteer = require('puppeteer-core');
const path = require('path');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// WebSocket server for browser extension communication
const wss = new WebSocket.Server({ server });

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
const extensionConnections = new Map(); // sessionId -> WebSocket connection
const userApiKeys = new Map(); // apiKey -> userInfo
const userUsage = new Map(); // userId -> usage stats

// Mock user data (in production, use a database)
const mockUsers = {
  'free-user-123': { plan: 'free', jobsUsed: 0, jobsLimit: -1 }, // unlimited
  'pro-user-456': { plan: 'pro', jobsUsed: 0, jobsLimit: -1 }, // unlimited
  'business-user-789': { plan: 'business', jobsUsed: 0, jobsLimit: -1 } // unlimited
};

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
      console.log(`[${this.sessionId}] Browser launch requested - Extension mode`);
      
      // In extension mode, we don't launch a browser
      // The user will use their own browser with the extension
      this.status = 'waiting_for_extension';
      console.log(`[${this.sessionId}] Waiting for browser extension connection`);
      
      return true;
    } catch (error) {
      console.error(`[${this.sessionId}] Browser launch failed:`, error);
      this.status = 'error';
      throw error;
    }
  }

  // Check if extension is connected
  isExtensionConnected() {
    return extensionConnections.has(this.sessionId);
  }

  // Update login status
  setLoggedIn(loggedIn) {
    this.isLoggedIn = loggedIn;
    if (loggedIn) {
      this.status = 'logged_in';
      console.log(`[${this.sessionId}] User logged in via extension`);
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
      console.log(`[${this.sessionId}] Processing ${this.jobs.length} jobs via extension...`);
      this.status = 'processing';
      
      // Send jobs to extension for processing
      for (let i = 0; i < this.jobs.length; i++) {
        const job = this.jobs[i];
        
        try {
          console.log(`[${this.sessionId}] Sending job ${i + 1} to extension: ${job.jobUrl}`);
          
          // Generate smart job data and send to extension
          const jobData = generateJobApplicationData(job);
          const success = await sendToExtension(this.sessionId, {
            type: 'job_application',
            jobData: jobData
          });
          
          if (success) {
            this.results.push({
              jobNumber: i + 1,
              jobUrl: job.jobUrl,
              status: 'sent_to_extension',
              message: 'Job sent to browser extension for processing',
              processedAt: new Date().toISOString()
            });
          } else {
            this.results.push({
              jobNumber: i + 1,
              jobUrl: job.jobUrl,
              status: 'extension_not_connected',
              message: 'Browser extension not connected',
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
      console.log(`[${this.sessionId}] All jobs sent to extension`);
      
    } catch (error) {
      console.error(`[${this.sessionId}] Job processing failed:`, error);
      this.status = 'error';
      throw error;
    }
  }

  async close() {
    // In extension mode, no browser to close
    console.log(`[${this.sessionId}] Session closed`);
  }
}

// Authentication middleware
function authenticateUser(req, res, next) {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  // Check if API key is valid (in production, use database)
  const userId = Object.keys(mockUsers).find(id => id === apiKey);
  if (!userId) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  req.user = { id: userId, ...mockUsers[userId] };
  next();
}

// Rate limiting middleware (disabled - unlimited usage)
function checkRateLimit(req, res, next) {
  // No rate limiting - unlimited usage for all users
  next();
}

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Upwork Auto Applier Backend',
    status: 'running',
    version: '1.0.2',
    features: ['api_auth', 'unlimited_usage', 'command_based'],
    csp: 'disabled'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Secure job processing endpoint
app.post('/process-job', authenticateUser, checkRateLimit, async (req, res) => {
  try {
    const { job, sessionId } = req.body;
    const userId = req.user.id;
    
    console.log(`Processing job for user ${userId}:`, job.jobUrl);
    
    // Generate smart job application data (your secret sauce!)
    const jobData = generateJobApplicationData(job);
    
    // Send job data to extension via WebSocket
    const success = await sendToExtension(sessionId, {
      type: 'job_application',
      jobData: jobData
    });
    
    if (!success) {
      return res.status(503).json({ 
        error: 'Extension not connected', 
        message: 'Please ensure the browser extension is installed and connected' 
      });
    }
    
    // Update usage stats
    mockUsers[userId].jobsUsed++;
    
    res.json({
      success: true,
      jobId: job.jobId || uuidv4(),
      message: 'Job sent to browser extension for processing'
    });
    
  } catch (error) {
    console.error('Job processing failed:', error);
    res.status(500).json({ error: 'Job processing failed', details: error.message });
  }
});

// Generate smart job application data (this is your secret sauce!)
function generateJobApplicationData(job) {
  // This is where your AI and intelligence lives - completely hidden from users!
  
  // Analyze the job and generate smart cover letter
  const smartCoverLetter = generateSmartCoverLetter(job);
  
  // Determine the best strategy for this job
  const applicationStrategy = determineApplicationStrategy(job);
  
  // Generate personalized responses
  const screeningResponses = generateScreeningResponses(job);
  
  return {
    jobId: job.jobId,
    jobUrl: job.jobUrl,
    coverLetter: smartCoverLetter,
    strategy: applicationStrategy,
    screeningResponses: screeningResponses,
    timing: {
      delayBeforeApply: 2000,
      delayAfterApply: 3000
    }
  };
}

// Your secret AI logic - completely hidden from users!
function generateSmartCoverLetter(job) {
  // This is where your AI magic happens
  // Users never see this logic - it's all on your backend
  
  const baseTemplate = `Hi there!

I'm excited about this opportunity and I believe I'm the perfect fit for this project. 

Based on your requirements, I can deliver exactly what you need with my expertise in the relevant technologies.

I'm available to start immediately and can provide regular updates throughout the project.

Looking forward to discussing this further!

Best regards,
[Your Name]`;

  // Add job-specific personalization (your secret sauce!)
  if (job.jobUrl.includes('web-development')) {
    return baseTemplate.replace('relevant technologies', 'web development and modern frameworks');
  } else if (job.jobUrl.includes('data-analysis')) {
    return baseTemplate.replace('relevant technologies', 'data analysis and visualization');
  }
  
  return baseTemplate;
}

function determineApplicationStrategy(job) {
  // Your secret strategy logic
  return {
    useProfile: 'default',
    bidAmount: null, // Fixed price job
    priority: 'high'
  };
}

function generateScreeningResponses(job) {
  // Your secret screening question responses
  return {
    availability: 'I can start immediately',
    experience: 'I have extensive experience in this field',
    budget: 'I understand the budget and timeline'
  };
}

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
    
    res.json({
      sessionId,
      status: session.status,
      browserUrl: `${req.protocol}://${req.get('host')}/browser/${sessionId}`,
      websocketUrl: `wss://${req.get('host')}/ws/${sessionId}`,
      message: 'Session created! Install browser extension to continue.'
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
  
  // Check if extension is connected
  const extensionConnected = session.isExtensionConnected();
  
  res.json({
    sessionId: session.sessionId,
    status: session.status,
    isLoggedIn: session.isLoggedIn,
    extensionConnected: extensionConnected,
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
          <h3>🌐 Browser Extension Required</h3>
          <p>To use this service, you need to install the Upwork Auto Applier browser extension.</p>
          <div id="status-message" style="margin-top: 15px;">
            <p style="color: #FF9800;">⚠️ Please install the browser extension to continue.</p>
          </div>
          <div style="margin-top: 15px;">
            <a href="#" id="install-extension" style="
              background: #4CAF50;
              color: white;
              padding: 12px 24px;
              border-radius: 6px;
              text-decoration: none;
              display: inline-block;
              font-weight: bold;
            ">Install Extension</a>
          </div>
        </div>
        
        <div class="instructions">
          <h3>📋 Instructions</h3>
          <ol>
            <li>Install the Upwork Auto Applier browser extension</li>
            <li>Click "Connect to Service" in the extension popup</li>
            <li>Log into your Upwork account in this browser</li>
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

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.pathname.split('/')[2]; // /ws/sessionId
  
  console.log(`🔌 WebSocket connection attempt for session: ${sessionId}`);
  console.log(`📊 Total sessions in memory: ${sessions.size}`);
  console.log(`📋 Available sessions:`, Array.from(sessions.keys()));
  
  // Check if session exists
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`❌ Session ${sessionId} not found, rejecting connection`);
    ws.close(1000, 'Session not found');
    return;
  }
  
  console.log(`✅ Extension connected for session: ${sessionId}`);
  extensionConnections.set(sessionId, ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleExtensionMessage(sessionId, data);
    } catch (error) {
      console.error('Invalid WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`Extension disconnected for session: ${sessionId}`);
    extensionConnections.delete(sessionId);
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for session ${sessionId}:`, error);
    extensionConnections.delete(sessionId);
  });
});

function handleExtensionMessage(sessionId, data) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  switch (data.type) {
    case 'job_applied':
      console.log(`Job application result for session ${sessionId}:`, data);
      // Update session with job result
      if (session.results) {
        const jobResult = {
          jobId: data.jobId,
          status: data.success ? 'applied' : 'failed',
          message: data.success ? 'Successfully applied' : data.error,
          processedAt: new Date().toISOString()
        };
        session.results.push(jobResult);
      }
      break;
      
    case 'login_status':
      console.log(`Login status for session ${sessionId}:`, data.isLoggedIn);
      session.setLoggedIn(data.isLoggedIn);
      if (data.isLoggedIn) {
        // Start processing jobs
        session.processJobs().catch(error => {
          console.error(`Job processing failed for session ${sessionId}:`, error);
        });
      }
      break;
      
    case 'extension_connected':
      console.log(`Extension connected for session ${sessionId}`);
      session.status = 'extension_connected';
      break;
      
    default:
      console.log(`Unknown message type from extension: ${data.type}`);
  }
}

// Send message to extension
function sendToExtension(sessionId, message) {
  const ws = extensionConnections.get(sessionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

server.listen(PORT, () => {
  console.log(`Upwork Backend Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Puppeteer enabled with Railway Pro support');
  console.log('WebSocket server enabled for browser extension');
});