const ytdlpService = require('../services/ytdlpService');
const path = require('path');

// ─── Convert yt-dlp errors to clean messages ────────────────────
function readableError(err) {
  const msg = (err.message || err.stderr || '').toLowerCase();

  if (msg.includes('cookies.txt not found')) return 'cookies.txt not found on server';
  if (msg.includes('invalid url')) return 'Invalid URL. Please enter a valid video link.';
  if (msg.includes('sign in') || msg.includes('not a bot')) return 'Authentication required. Server cookies need refresh.';
  if (msg.includes('private')) return 'This video is private.';
  if (msg.includes('unavailable') || msg.includes('removed')) return 'This video is unavailable or removed.';
  if (msg.includes('age')) return 'Age-restricted video. Server cookies need refresh.';
  if (msg.includes('rate') || msg.includes('429') || msg.includes('too many')) return 'Rate limited. Please try again later.';
  if (msg.includes('unsupported') || msg.includes('no video')) return 'This URL is not supported.';
  if (msg.includes('timed out') || msg.includes('timeout')) return 'Request timed out. Try again.';
  if (msg.includes('enoent') || msg.includes('spawn')) return 'Download engine not available on server.';

  return 'Unable to process this video. Please try again.';
}

// ─── POST /api/info ─────────────────────────────────────────────
exports.getMetadata = async (req, res) => {
  try {
    const { url } = req.body;
    console.log('[API /info] URL:', url);

    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    const data = await ytdlpService.fetchMetadata(url);
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('[API /info] Error:', error.message);
    res.status(500).json({ success: false, message: readableError(error) });
  }
};

// ─── POST /api/download ────────────────────────────────────────
exports.downloadMedia = async (req, res) => {
  try {
    const { url, formatId, type } = req.body;
    console.log('[API /download] URL:', url, 'Format:', formatId, 'Type:', type);

    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    const filePath = await ytdlpService.downloadFile(url, formatId, type || 'video');
    const filename = path.basename(filePath);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const downloadUrl = `${protocol}://${host}/downloads/${filename}`;

    res.json({ success: true, data: { download_url: downloadUrl, filename } });
  } catch (error) {
    console.error('[API /download] Error:', error.message);
    res.status(500).json({ success: false, message: readableError(error) });
  }
};

// ─── POST /api/audio ───────────────────────────────────────────
exports.convertMedia = async (req, res) => {
  try {
    const { url } = req.body;
    console.log('[API /audio] URL:', url);

    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    const filePath = await ytdlpService.downloadFile(url, 'bestaudio', 'audio');
    const filename = path.basename(filePath);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const downloadUrl = `${protocol}://${host}/downloads/${filename}`;

    res.json({ success: true, data: { download_url: downloadUrl, filename } });
  } catch (error) {
    console.error('[API /audio] Error:', error.message);
    res.status(500).json({ success: false, message: readableError(error) });
  }
};
