/**
 * AuditFlow Backend - Main Entry Point
 * 
 * Stateless Express API that integrates with Google Drive, Sheets, and Slides
 * to generate audit documentation. No database - Google services are the source of truth.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import auditRoutes from './routes/audit.js';
import checklistRoutes from './routes/checklists.js';
import { initDatabase } from './services/database.js';

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================================================
// MIDDLEWARE
// =============================================================================

// CORS - Allow all origins for production
app.use(cors({
  origin: true, // Allow all origins
  credentials: true
}));

// JSON body parser
app.use(express.json({ limit: '50mb' }));

// Request logging (simple)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (Google OAuth)
app.use('/auth', authRoutes);

// Audit routes (submit, photos)
app.use('/api/audit', auditRoutes);

// Checklist routes (CRUD for checklists via Supabase)
app.use('/api/checklists', checklistRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           AuditFlow Backend API Server                    ║
║═══════════════════════════════════════════════════════════║
║  Port: ${PORT}                                              ║
║  Environment: ${process.env.NODE_ENV || 'development'}                             ║
║  Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}               ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
