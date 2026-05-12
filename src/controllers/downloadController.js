const ytdlpService = require('../services/ytdlpService');
const path = require('path');
const fs = require('fs');

// ─── Clean error message for frontend (never expose internals) ─────
function cleanError(rawMessage) {
  const msg = (rawMessage || '').toLowerCase();

  if (msg.includes('sign in') || msg.includes('not a bot') || msg.includes('cookies')) {
    return 'YouTube requires authentication. Please update cookies.txt on the server.';
  }
  if (msg.includes('not found') || msg.includes('unavailable') || msg.includes('removed')) {
    return 'This video is unavailable or has been removed.';
  }
  if (msg.includes('private')) {
    return 'This video is private and cannot be downloaded.';
  }
  if (msg.includes('geo') || msg.includes('country')) {
    return 'This video is not available in the server region.';
  }
  if (msg.includes('age') || msg.includes('login')) {
    return 'This video requires age verification. Please update cookies.txt on the server.';
  }
  if (msg.includes('unsupported') || msg.includes('no video')) {
    return 'This URL is not supported or contains no downloadable media.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Request timed out. Please try again.';
  }
  if (msg.includes('enoent') || msg.includes('spawn')) {
    return 'Download engine is not available. Please contact support.';
  }

  return 'Unable to process this video. Please try a different URL.';
}

// ─── POST /api/info ────────────────────────────────────────────────
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
      res.status(500).json({ success: false, error: cleanError(error.message) });
    }
  }
};

// ─── POST /api/download ───────────────────────────────────────────
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
      res.status(500).json({ success: false, error: cleanError(error.message) });
    }
  }
};

// ─── POST /api/audio ──────────────────────────────────────────────
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
      res.status(500).json({ success: false, error: cleanError(error.message) });
    }
  }
};
