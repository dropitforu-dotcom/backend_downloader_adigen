const { execFile } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// ─── DETECT yt-dlp BINARY (Render puts it in /opt/render/.local/bin/) ──
const YTDLP_PATHS = [
  '/opt/render/.local/bin/yt-dlp',       // Render pip --user install
  path.join(process.cwd(), 'yt-dlp'),    // Local binary in project root
  '/usr/local/bin/yt-dlp',               // Global install
  '/usr/bin/yt-dlp',                     // System install
];

let YTDLP_BIN = 'yt-dlp'; // fallback to PATH
for (const p of YTDLP_PATHS) {
  if (fs.existsSync(p)) {
    YTDLP_BIN = p;
    break;
  }
}
console.log('[yt-dlp] Binary:', YTDLP_BIN);

// ─── DETECT ffmpeg ──────────────────────────────────────────────
const FFMPEG_PATHS = [
  path.join(process.cwd(), 'ffmpeg'),
  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
];

let FFMPEG_BIN = 'ffmpeg';
for (const p of FFMPEG_PATHS) {
  if (fs.existsSync(p)) {
    FFMPEG_BIN = p;
    break;
  }
}
try {
  const s = require('ffmpeg-static');
  if (s && fs.existsSync(s)) FFMPEG_BIN = s;
} catch (e) {}
console.log('[yt-dlp] ffmpeg:', FFMPEG_BIN);

// ─── COOKIES ────────────────────────────────────────────────────
const cookiesPath = path.join(process.cwd(), 'cookies.txt');
console.log('[yt-dlp] Cookies Path:', cookiesPath);
console.log('[yt-dlp] Cookies Exists:', fs.existsSync(cookiesPath));

// ─── URL validation ─────────────────────────────────────────────
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

// ─── Safe yt-dlp execution via execFile ─────────────────────────
function runYtdlp(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    console.log('[yt-dlp] CMD:', YTDLP_BIN, args.join(' '));

    execFile(YTDLP_BIN, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: timeout,
      cwd: process.cwd()
    }, (error, stdout, stderr) => {
      if (stderr) console.log('[yt-dlp] stderr:', stderr.substring(0, 500));
      if (stdout) console.log('[yt-dlp] stdout length:', stdout.length);
      if (error) {
        console.error('[yt-dlp] Error:', error.message);
        const err = new Error(stderr || error.message);
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

// ─── Startup check ──────────────────────────────────────────────
(async () => {
  try {
    const v = await runYtdlp(['--version'], 10000);
    console.log('[yt-dlp] Version:', v.trim(), '✓');
  } catch (e) {
    console.error('[yt-dlp] WARNING: yt-dlp not working at startup:', e.message);
  }
})();

// ─── FETCH METADATA ─────────────────────────────────────────────
// Command: yt-dlp --cookies cookies.txt -J --no-playlist "<URL>"
exports.fetchMetadata = async (url) => {
  console.log('[fetchMetadata] URL:', url);

  if (!isValidUrl(url)) throw new Error('Invalid URL format');
  if (!fs.existsSync(cookiesPath)) throw new Error('cookies.txt not found on server');

  const args = ['--cookies', cookiesPath, '-J', '--no-playlist', url];
  const output = await runYtdlp(args);
  const data = JSON.parse(output);

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
exports.downloadFile = async (url, formatId, type) => {
  console.log('[downloadFile] URL:', url, 'Format:', formatId, 'Type:', type);

  if (!isValidUrl(url)) throw new Error('Invalid URL format');
  if (!fs.existsSync(cookiesPath)) throw new Error('cookies.txt not found on server');

  const id = uuidv4();
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const filename = `${type}_${id}.${ext}`;
  const filePath = path.join(process.cwd(), 'downloads', filename);

  let args;
  if (type === 'audio') {
    args = [
      '--cookies', cookiesPath,
      '-x', '--audio-format', 'mp3',
      '--ffmpeg-location', FFMPEG_BIN,
      '--no-playlist',
      '-o', filePath,
      url
    ];
  } else {
    args = [
      '--cookies', cookiesPath,
      '-f', formatId || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', FFMPEG_BIN,
      '--no-playlist',
      '-o', filePath,
      url
    ];
  }

  console.log('[downloadFile] Starting...');
  await runYtdlp(args, 300000);
  console.log('[downloadFile] Done:', filePath);

  if (fs.existsSync(filePath)) return filePath;
  throw new Error('Downloaded file not found');
};
