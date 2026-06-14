import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB } from './db/index.js';
import apiRouter from './routes/api.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS — allow configured frontend origin in production, all origins in dev
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : true; // allow all in development

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Parse incoming JSON requests
app.use(express.json({ limit: '10mb' }));

// Health check route (used by Render)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// API Routes
app.use('/api', apiRouter);

// Initialize DB and start server
const startServer = async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(` LedgerMate Server running on port ${PORT}`);
      console.log(`=========================================`);
    });
  } catch (err) {
    console.error('Failed to start server due to database error:', err.message);
    process.exit(1);
  }
};

startServer();

