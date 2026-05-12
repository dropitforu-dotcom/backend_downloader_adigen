const express = require('express');

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
// Fallback to .env
dotenv.config();

const app = require('express')();
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

// Serve static files
app.use('/downloads', express.static(path.join(process.cwd(), 'downloads')));

// Routes
const downloadRoutes = require('./routes/downloadRoutes');
app.use('/api', downloadRoutes);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: "Adigen API Running"
  });
});

app.get('/api/test', (req, res) => {
  res.json({
    success: true
  });
});


// Create required directories if they don't exist
const dirs = ['downloads', 'temp', 'logs'];
dirs.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Auto cleanup job every 30 minutes
setInterval(() => {
  const dirsToClean = ['downloads', 'temp'];
  dirsToClean.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      fs.readdir(dirPath, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          fs.stat(filePath, (err, stats) => {
            if (err) return;
            // Delete files older than 1 hour
            if (now - stats.mtimeMs > 3600000) {
              fs.unlink(filePath, () => {});
            }
          });
        });
      });
    }
  });
}, 1800000);
