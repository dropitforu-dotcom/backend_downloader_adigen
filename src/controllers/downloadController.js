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
    
    // Stream file to client
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': type === 'audio' ? 'audio/mpeg' : 'video/mp4',
      'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    
    // Cleanup after sending
    readStream.on('end', () => {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Failed to cleanup file:', err);
      });
    });

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
        
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
        });
    
        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
        
        readStream.on('end', () => {
          fs.unlink(filePath, (err) => {
            if (err) console.error('Failed to cleanup file:', err);
          });
        });
      } catch (error) {
        console.error('Conversion error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to convert media', details: error.message });
        }
      }
};
