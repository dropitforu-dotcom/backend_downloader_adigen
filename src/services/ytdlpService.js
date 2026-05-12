const { spawn } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');


// ─── Resolve yt-dlp binary ──────────────────────────────────────
const YTDLP_BIN = fs.existsSync('/opt/render/.local/bin/yt-dlp')
  ? '/opt/render/.local/bin/yt-dlp'
  : 'yt-dlp';
console.log('[yt-dlp] Binary:', YTDLP_BIN);

// ─── Resolve ffmpeg binary ──────────────────────────────────────
function getFfmpegBin() {
  const local = path.join(process.cwd(), 'ffmpeg');
  if (fs.existsSync(local)) return local;
  try {
    const s = require('ffmpeg-static');
    if (s) return s;
  } catch (e) {}
  return 'ffmpeg';
}

const FFMPEG = getFfmpegBin();
console.log('[yt-dlp] ffmpeg:', FFMPEG);

// ─── Validate URL (prevent command injection) ───────────────────
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

// ─── Run yt-dlp safely via spawn (NO shell, NO injection) ────
function runYtdlp(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    console.log('[yt-dlp] CMD:', YTDLP_BIN, args.join(' '));

    const child = spawn(YTDLP_BIN, args, {
      cwd: process.cwd(),
      timeout: timeout
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('error', (error) => {
      console.error('[yt-dlp] spawn error:', error.message);
      reject({ message: error.message, stderr: stderrData, stdout: stdoutData });
    });

    child.on('close', (code) => {
      console.log('[yt-dlp] exit code:', code, 'stdout:', stdoutData.length, 'stderr:', stderrData.length);
      if (code !== 0) {
        return reject({ message: stderrData || 'Process exited with code ' + code, stderr: stderrData, stdout: stdoutData });
      }
      resolve(stdoutData);
    });
  });
}

// ─── Startup version check ──────────────────────────────────────
(async () => {
  try {
    const v = await runYtdlp(['--version'], 10000);
    console.log('[yt-dlp] Version:', v.trim());
  } catch (e) {
    console.error('[yt-dlp] WARNING: yt-dlp not available at startup');
  }
})();

// ─── FETCH METADATA ─────────────────────────────────────────────
// Command: yt-dlp --user-agent "Mozilla/5.0" --extractor-retries 3 -J --no-playlist "<URL>"
exports.fetchMetadata = async (url) => {
  console.log('[fetchMetadata] URL:', url);

  if (!isValidUrl(url)) {
    throw { message: 'Invalid URL format', stderr: null };
  }

  const args = [
    '--user-agent', 'Mozilla/5.0',
    '--extractor-retries', '3',
    '-J',
    '--no-playlist',
    url
  ];

  const output = await runYtdlp(args);
  
  if (!output || output.trim() === '') {
    throw { message: 'Unable to fetch video details.', stderr: null };
  }

  let data;
  try {
    data = JSON.parse(output);
  } catch (err) {
    console.error('[yt-dlp] JSON parse error:', err.message);
    throw { message: 'This video is temporarily unavailable. Try another video.', stderr: null };
  }

  console.log('[fetchMetadata] Success:', data.title);

  return {
    title: data.title || 'Untitled',
    thumbnail: data.thumbnail || '',
    duration: data.duration || 0,
    uploader: data.uploader || '',
    platform: data.extractor || 'unknown',
    formats: (data.formats || [])
      .filter(f => f.vcodec !== 'none' || f.acodec !== 'none')
      .map(f => ({
        formatId: f.format_id,
        ext: f.ext,
        resolution: f.resolution || 'audio only',
        filesize: f.filesize || f.filesize_approx || 0,
        vcodec: f.vcodec,
        acodec: f.acodec
      }))
  };
};

// ─── DOWNLOAD FILE ──────────────────────────────────────────────
// Video: yt-dlp --user-agent "Mozilla/5.0" --extractor-retries 3 -f best "<URL>"
// Audio: yt-dlp --user-agent "Mozilla/5.0" --extractor-retries 3 -x --audio-format mp3 "<URL>"
exports.downloadFile = async (url, formatId, type) => {
  console.log('[downloadFile] URL:', url, 'Format:', formatId, 'Type:', type);

  if (!isValidUrl(url)) {
    throw { message: 'Invalid URL format', stderr: null };
  }

  const id = uuidv4();
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const filename = `${type}_${id}.${ext}`;
  const filePath = path.join(process.cwd(), 'downloads', filename);

  let args;

  if (type === 'audio') {
    args = [
      '--user-agent', 'Mozilla/5.0',
      '--extractor-retries', '3',
      '-x', '--audio-format', 'mp3',
      '--ffmpeg-location', FFMPEG,
      '--no-playlist',
      '-o', filePath,
      url
    ];
  } else {
    args = [
      '--user-agent', 'Mozilla/5.0',
      '--extractor-retries', '3',
      '-f', 'best',
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', FFMPEG,
      '--no-playlist',
      '-o', filePath,
      url
    ];
  }

  console.log('[downloadFile] Starting...');
  await runYtdlp(args, 300000); // 5 min timeout for downloads
  console.log('[downloadFile] Done:', filePath);

  if (fs.existsSync(filePath)) {
    return filePath;
  }
  throw { message: 'Downloaded file not found', stderr: null };
};
