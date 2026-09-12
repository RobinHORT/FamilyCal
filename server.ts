import 'dotenv/config';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db.js';
import { router as apiRouter } from './server/routes/api.js';

async function startServer() {
  // 1. Initialize SQLite Database & Tables
  initDatabase();

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // 2. Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Request logger
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.path}`);
    }
    next();
  });

  // 3. Mount API Routes under both /api and /api/v1 for comprehensive compatibility
  app.use('/api', apiRouter);
  app.use('/api/v1', apiRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'Yimly FamilyCal',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // 4. Vite Frontend Middleware or Production Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 5. Start Listening on Host 0.0.0.0:3000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✨ Yimly FamilyCal server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Yimly FamilyCal server:', err);
  process.exit(1);
});
