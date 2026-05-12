const express = require('express');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config(); // Fallback to .env

// ─── Python3 check on startup ────────────────────────────────────
try {
  const pyVer = execSync('python3 --version', { encoding: 'utf-8' }).trim();
  console.log(`[startup] ${pyVer} ✓`);
} catch (e) {
  console.error('[startup] CRITICAL: Python3 is missing on this system!');
}

try {
  const ytVer = execSync('python3 -m yt_dlp --version', { encoding: 'utf-8' }).trim();
  console.log(`[startup] yt-dlp ${ytVer} ✓`);
} catch (e) {
  console.error('[startup] CRITICAL: yt-dlp not available via python3 -m yt_dlp');
}

const app = express();
const corsMiddleware = require('cors');

app.use(corsMiddleware({
  origin: [
    'http://localhost:5173',
    'https://adigen.media',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Serve downloaded files
app.use('/downloads', express.static(path.join(process.cwd(), 'downloads')));

// ─── Routes ──────────────────────────────────────────────────────
const downloadRoutes = require('./routes/downloadRoutes');
app.use('/api', downloadRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Adigen API Running' });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ success: true });
});

// ─── Health check with yt-dlp and cookies status ─────────────────
app.get('/health', (req, res) => {
  const ytdlpService = require('./services/ytdlpService');
  const health = ytdlpService.healthCheck();
  res.json({
    success: true,
    ytDlp: health.ytDlp,
    cookies: health.cookies,
    cookiesPath: health.cookiesPath,
    ffmpeg: health.ffmpeg
  });
});

// ─── Create required directories ────────────────────────────────
const dirs = ['downloads', 'temp', 'logs'];
dirs.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// ─── Start server ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[startup] Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`[startup] CORS allowed: http://localhost:5173, https://adigen.media`);
});

// ─── Auto cleanup every 30 minutes ──────────────────────────────
setInterval(() => {
  ['downloads', 'temp'].forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      fs.readdir(dirPath, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          fs.stat(filePath, (err, stats) => {
            if (err) return;
            if (now - stats.mtimeMs > 3600000) {
              fs.unlink(filePath, () => {});
            }
          });
        });
      });
    }
  });
}, 1800000);
