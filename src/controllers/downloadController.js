const ytdlpService = require('../services/ytdlpService');
const path = require('path');

// ─── POST /api/info ───────────────────────────────────────────────
exports.getMetadata = async (req, res) => {
  try {
    const { url } = req.body;
    console.log(`[API /info] Request for URL: ${url}`);

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const metadata = await ytdlpService.fetchMetadata(url);
    res.json({ success: true, data: metadata });
  } catch (error) {
    console.error(`[API /info] Error:`, error.message);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || 'yt-dlp execution failed',
        stderr: error.stderr || null,
        message: 'yt-dlp execution failed'
      });
    }
  }
};

// ─── POST /api/download ──────────────────────────────────────────
exports.downloadMedia = async (req, res) => {
  try {
    const { url, formatId, type } = req.body;
    console.log(`[API /download] URL: ${url}, Format: ${formatId}, Type: ${type}`);

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const filePath = await ytdlpService.downloadFile(url, formatId, type);
    const filename = path.basename(filePath);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const downloadUrl = `${protocol}://${host}/downloads/${filename}`;

    res.json({ success: true, data: { download_url: downloadUrl, filename } });
  } catch (error) {
    console.error(`[API /download] Error:`, error.message);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || 'Download failed',
        stderr: error.stderr || null,
        message: 'yt-dlp execution failed'
      });
    }
  }
};

// ─── POST /api/audio ─────────────────────────────────────────────
exports.convertMedia = async (req, res) => {
  try {
    const { url } = req.body;
    console.log(`[API /audio] Request for URL: ${url}`);

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const filePath = await ytdlpService.downloadFile(url, 'bestaudio', 'audio');
    const filename = path.basename(filePath);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const downloadUrl = `${protocol}://${host}/downloads/${filename}`;

    res.json({ success: true, data: { download_url: downloadUrl, filename } });
  } catch (error) {
    console.error(`[API /audio] Error:`, error.message);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || 'Conversion failed',
        stderr: error.stderr || null,
        message: 'yt-dlp execution failed'
      });
    }
  }
};
