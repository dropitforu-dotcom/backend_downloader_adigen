const { execFile } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Resolve yt-dlp binary path
// Priority: ./yt-dlp (downloaded by render-build.sh) > system PATH
function getYtdlpPath() {
  const localBin = path.join(process.cwd(), 'yt-dlp');
  if (fs.existsSync(localBin)) {
    console.log(`[yt-dlp] Using local binary: ${localBin}`);
    return localBin;
  }
  console.log(`[yt-dlp] Using system PATH: yt-dlp`);
  return 'yt-dlp';
}

// Resolve ffmpeg path
function getFfmpegPath() {
  const localBin = path.join(process.cwd(), 'ffmpeg');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) return ffmpegStatic;
  } catch (e) { /* ignore */ }
  return 'ffmpeg';
}

const YTDLP = getYtdlpPath();
const FFMPEG = getFfmpegPath();

// Helper: run yt-dlp as a child process with proper error handling
function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    console.log(`[yt-dlp] Running: ${YTDLP} ${args.join(' ')}`);
    
    const proc = execFile(YTDLP, args, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large JSON
      timeout: 120000, // 2 min timeout
      env: { ...process.env, PATH: `${process.cwd()}:${process.env.PATH}` }
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[yt-dlp] stderr: ${stderr}`);
        console.error(`[yt-dlp] error: ${error.message}`);
        return reject(new Error(stderr || error.message));
      }
      resolve(stdout);
    });
  });
}

// Check yt-dlp availability on startup
(async () => {
  try {
    const version = await runYtdlp(['--version']);
    console.log(`[yt-dlp] Version detected: ${version.trim()}`);
    console.log(`[yt-dlp] ffmpeg path: ${FFMPEG}`);
  } catch (err) {
    console.error(`[yt-dlp] CRITICAL: yt-dlp not available!`, err.message);
  }
})();

exports.fetchMetadata = async (url) => {
  console.log(`[fetchMetadata] Fetching for URL: ${url}`);
  
  const args = [
    '--dump-json',
    '--no-warnings',
    '--no-call-home',
    '--prefer-free-formats',
    '--youtube-skip-dash-manifest',
    '--ffmpeg-location', FFMPEG,
    url
  ];

  try {
    const output = await runYtdlp(args);
    const metadata = JSON.parse(output);

    console.log(`[fetchMetadata] Success: ${metadata.title}`);

    const result = {
      title: metadata.title,
      thumbnail: metadata.thumbnail,
      duration: metadata.duration,
      uploader: metadata.uploader,
      platform: metadata.extractor,
      formats: (metadata.formats || []).map(f => ({
        formatId: f.format_id,
        ext: f.ext,
        resolution: f.resolution,
        filesize: f.filesize,
        vcodec: f.vcodec,
        acodec: f.acodec
      })).filter(f => f.vcodec !== 'none' || f.acodec !== 'none')
    };

    return result;
  } catch (err) {
    console.error('[fetchMetadata] Error:', err.message);
    throw new Error(`yt-dlp failed: ${err.message}`);
  }
};

exports.downloadFile = async (url, formatId, type) => {
  console.log(`[downloadFile] URL: ${url}, Format: ${formatId}, Type: ${type}`);
  
  const id = uuidv4();
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const filename = `${type}_${id}.${ext}`;
  const filePath = path.join(process.cwd(), 'downloads', filename);

  const args = [
    '-f', formatId || (type === 'audio' ? 'bestaudio' : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'),
    '-o', filePath,
    '--no-warnings',
    '--no-call-home',
    '--ffmpeg-location', FFMPEG,
    url
  ];

  if (type === 'audio') {
    args.push('--extract-audio', '--audio-format', 'mp3');
  } else {
    args.push('--merge-output-format', 'mp4');
  }

  try {
    console.log(`[downloadFile] Starting download...`);
    await runYtdlp(args);
    console.log(`[downloadFile] Completed: ${filePath}`);

    if (fs.existsSync(filePath)) {
      return filePath;
    } else {
      throw new Error('Downloaded file not found after yt-dlp execution');
    }
  } catch (err) {
    console.error('[downloadFile] Error:', err.message);
    throw new Error(`Download failed: ${err.message}`);
  }
};
