const ytdlpService = require('../services/ytdlpService');
const path = require('path');
const fs = require('fs');

exports.getMetadata = async (req, res) => {
  try {
    const { url } = req.body;
    console.log(`[API /info] Received request for URL: ${url}`);
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    const metadata = await ytdlpService.fetchMetadata(url);
    res.json({ success: true, data: metadata });
  } catch (error) {
    console.error(`[API /info] Error:`, error.message);
    console.error(`[API /info] Stack:`, error.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch metadata' });
    }
  }
};

exports.downloadMedia = async (req, res) => {
  try {
    const { url, formatId, type } = req.body;
    console.log(`[API /download] Received request - URL: ${url}, Format: ${formatId}, Type: ${type}`);
    
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
    console.error(`[API /download] Stack:`, error.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Failed to download media' });
    }
  }
};

exports.convertMedia = async (req, res) => {
  try {
    const { url } = req.body;
    console.log(`[API /audio] Received request for URL: ${url}`);
    
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
    console.error(`[API /audio] Stack:`, error.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Failed to convert media' });
    }
  }
};
