const express = require('express');
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

// Simple session management (without browser for now)
class SimpleSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.jobs = [];
    this.results = [];
    this.status = 'waiting_for_browser'; // waiting_for_browser, processing, completed, error
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.message = 'Backend API is ready. Browser functionality will be added in the next update.';
  }

  async processJobs() {
    try {
      console.log(`[${this.sessionId}] Processing jobs...`);
      this.status = 'processing';
      
      for (let i = 0; i < this.jobs.length; i++) {
        const job = this.jobs[i];
        
        // Simulate job processing
        const result = {
          jobNumber: i + 1,
          jobUrl: job.jobUrl,
          status: 'pending_browser',
          message: 'Waiting for browser integration',
          processedAt: new Date().toISOString()
        };
        
        this.results.push(result);
        console.log(`[${this.sessionId}] Job ${i + 1} queued: ${job.jobUrl}`);
      }
      
      this.status = 'completed';
      console.log(`[${this.sessionId}] All jobs queued for browser processing`);
      
    } catch (error) {
      console.error(`[${this.sessionId}] Job processing failed:`, error);
      this.status = 'error';
      throw error;
    }
  }
}

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Upwork Auto Applier Backend',
    status: 'running',
    version: '1.0.0',
    note: 'Backend API is ready. Browser functionality coming soon!'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/session', async (req, res) => {
  try {
    const { jobs, applicationPreferences } = req.body;
    
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'Jobs array is required' });
    }
    
    const sessionId = uuidv4();
    const session = new SimpleSession(sessionId);
    
    // Store jobs and preferences
    session.jobs = jobs;
    session.applicationPreferences = applicationPreferences || {};
    
    // Store session
    sessions.set(sessionId, session);
    
    res.json({
      sessionId,
      status: session.status,
      browserUrl: `${req.protocol}://${req.get('host')}/browser/${sessionId}`,
      message: 'Session created. Backend API is ready!'
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
    isLoggedIn: false, // Will be true when browser is integrated
    jobsCount: session.jobs.length,
    currentJob: 0,
    results: session.results,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    message: session.message
  });
});

app.post('/session/:sessionId/start-processing', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Start processing in background
    session.processJobs().catch(error => {
      console.error(`[${sessionId}] Background processing error:`, error);
    });
    
    res.json({ message: 'Job processing started (simulation mode)' });
    
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
      pending: session.results.filter(r => r.status === 'pending_browser').length,
      completed: 0,
      failed: 0
    }
  });
});

// Cleanup inactive sessions
setInterval(() => {
  const now = new Date();
  const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > inactiveThreshold) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Upwork Backend Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Note: Backend API is ready. Browser functionality will be added in the next update.');
});