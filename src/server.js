const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load env
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config();

const app = express();
const cors = require('cors');

// ─── CORS ───────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://adigen.media',
    'https://www.adigen.media',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// ─── Static files (downloads) ───────────────────────────────────
app.use('/downloads', express.static(path.join(process.cwd(), 'downloads')));

// ─── API Routes ─────────────────────────────────────────────────
const downloadRoutes = require('./routes/downloadRoutes');
app.use('/api', downloadRoutes);

// ─── Root ───────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Adigen API Running' });
});

// ─── Test ───────────────────────────────────────────────────────
app.get('/api/test', (req, res) => {
  res.json({ success: true });
});

// ─── Create directories ────────────────────────────────────────
['downloads', 'temp', 'logs'].forEach(dir => {
  const p = path.join(process.cwd(), dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ─── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[server] Running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  console.log(`[server] CORS: http://localhost:5173, https://adigen.media`);
});

// ─── Auto cleanup every 30 min ─────────────────────────────────
setInterval(() => {
  ['downloads', 'temp'].forEach(dir => {
    const p = path.join(process.cwd(), dir);
    if (!fs.existsSync(p)) return;
    fs.readdir(p, (err, files) => {
      if (err) return;
      const now = Date.now();
      files.forEach(f => {
        const fp = path.join(p, f);
        fs.stat(fp, (e, s) => {
          if (e) return;
          if (now - s.mtimeMs > 3600000) fs.unlink(fp, () => {});
        });
      });
    });
  });
}, 1800000);
