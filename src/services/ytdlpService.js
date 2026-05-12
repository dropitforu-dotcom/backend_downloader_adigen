const { spawn } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

exports.fetchMetadata = (url) => {
  return new Promise((resolve, reject) => {
    // Use python3 -m yt_dlp to avoid PATH issues when installed via pip
    const ytDlp = spawn('python3', ['-m', 'yt_dlp', '-j', url]);
    
    let output = '';
    let errorOutput = '';

    ytDlp.on('error', (err) => {
      reject(new Error('yt-dlp error: ' + err.message));
    });

    ytDlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytDlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytDlp.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(errorOutput || 'yt-dlp exited with error code ' + code));
      }
      try {
        const metadata = JSON.parse(output);
        
        // Extract relevant info
        const result = {
          title: metadata.title,
          thumbnail: metadata.thumbnail,
          duration: metadata.duration,
          uploader: metadata.uploader,
          platform: metadata.extractor,
          formats: metadata.formats.map(f => ({
            formatId: f.format_id,
            ext: f.ext,
            resolution: f.resolution,
            filesize: f.filesize,
            vcodec: f.vcodec,
            acodec: f.acodec
          })).filter(f => f.vcodec !== 'none' || f.acodec !== 'none')
        };
        resolve(result);
      } catch (err) {
        reject(new Error('Failed to parse yt-dlp output'));
      }
    });
  });
};

exports.downloadFile = (url, formatId, type) => {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    const ext = type === 'audio' ? 'mp3' : 'mp4';
    const filename = `${type}_${id}.${ext}`;
    const filePath = path.join(process.cwd(), 'downloads', filename);

    const args = [
        '-f', formatId || (type === 'audio' ? 'bestaudio' : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'),
        '-o', filePath,
        url
    ];

    if (type === 'audio') {
        args.push('--extract-audio', '--audio-format', 'mp3');
    } else {
        args.push('--merge-output-format', 'mp4');
    }

    const ytDlp = spawn('python3', ['-m', 'yt_dlp', ...args]);

    let errorOutput = '';

    ytDlp.on('error', (err) => {
      reject(new Error('yt-dlp error: ' + err.message));
    });

    ytDlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytDlp.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(errorOutput || 'yt-dlp exited with error code ' + code));
      }
      if (fs.existsSync(filePath)) {
          resolve(filePath);
      } else {
          reject(new Error('Downloaded file not found'));
      }
    });
  });
};
