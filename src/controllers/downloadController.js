const ytdlpService = require('../services/ytdlpService');
const path = require('path');
const fs = require('fs');

exports.getMetadata = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    
    const metadata = await ytdlpService.fetchMetadata(url);
    res.json({ success: true, data: metadata });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch metadata', details: error.message });
  }
};

exports.downloadMedia = async (req, res) => {
  try {
    const { url, formatId, type } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Download file
    const filePath = await ytdlpService.downloadFile(url, formatId, type);
    
    // Return direct URL
    const filename = path.basename(filePath);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const downloadUrl = `${protocol}://${host}/downloads/${filename}`;

    res.json({ success: true, data: { download_url: downloadUrl, filename } });

  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download media', details: error.message });
    }
  }
};

exports.convertMedia = async (req, res) => {
    // Similar to download, but specifically handles MP3 conversion with ffmpeg
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });
    
        const filePath = await ytdlpService.downloadFile(url, 'bestaudio', 'audio');
        // Return direct URL
        const filename = path.basename(filePath);
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const downloadUrl = `${protocol}://${host}/downloads/${filename}`;

        res.json({ success: true, data: { download_url: downloadUrl, filename } });
      } catch (error) {
        console.error('Conversion error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to convert media', details: error.message });
        }
      }
};
