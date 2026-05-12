const { execFile } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// ─── PROJECT ROOT (where package.json lives) ──────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ─── Cookies Path Resolution ──────────────────────────────────────
const COOKIES_PATH = path.join(PROJECT_ROOT, 'cookies.txt');
console.log('[yt-dlp] Cookies Path:', COOKIES_PATH);
console.log('[yt-dlp] Cookies Exists:', fs.existsSync(COOKIES_PATH));

// ─── ffmpeg Path Resolution ───────────────────────────────────────
function getFfmpegPath() {
  // Check project root first (downloaded by render-build.sh)
  const localBin = path.join(PROJECT_ROOT, 'ffmpeg');
  if (fs.existsSync(localBin)) return localBin;
  // Try npm ffmpeg-static
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) return ffmpegStatic;
  } catch (e) { /* ignore */ }
  return 'ffmpeg';
}

const FFMPEG = getFfmpegPath();
console.log('[yt-dlp] ffmpeg Path:', FFMPEG);

// ─── Run yt-dlp via python3 -m yt_dlp ────────────────────────────
function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    // Always use python3 -m yt_dlp for Render Linux compatibility
    const fullArgs = ['-m', 'yt_dlp', ...args];

    // Safe log (mask cookies path content)
    const safeLog = fullArgs.map(a =>
      a === COOKIES_PATH ? '[cookies.txt]' : a
    ).join(' ');
    console.log(`[yt-dlp] CMD: python3 ${safeLog}`);

    execFile('python3', fullArgs, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 180000,
      cwd: PROJECT_ROOT
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[yt-dlp] STDERR: ${stderr}`);
        console.error(`[yt-dlp] EXIT CODE: ${error.code}`);
        return reject(new Error(stderr || error.message));
      }
      resolve(stdout);
    });
  });
}

// ─── Base args: cookies + ffmpeg (NO deprecated flags) ────────────
function baseArgs() {
  const args = ['--no-warnings', '--ffmpeg-location', FFMPEG];
  if (fs.existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH);
  }
  return args;
}

// ─── Startup health check ─────────────────────────────────────────
(async () => {
  try {
    const version = await runYtdlp(['--version']);
    console.log(`[yt-dlp] Version: ${version.trim()}`);
  } catch (err) {
    console.error(`[yt-dlp] CRITICAL: python3 -m yt_dlp not available!`, err.message);
  }
})();

// ─── Fetch Metadata ───────────────────────────────────────────────
exports.fetchMetadata = async (url) => {
  console.log(`[fetchMetadata] URL: ${url}`);

  // Verify cookies exist
  if (!fs.existsSync(COOKIES_PATH)) {
    throw new Error('COOKIES_MISSING');
  }

  const args = [
    ...baseArgs(),
    '--dump-json',
    '--no-playlist',
    url
  ];

  const output = await runYtdlp(args);
  const metadata = JSON.parse(output);

  console.log(`[fetchMetadata] Success: "${metadata.title}"`);

  return {
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
};

// ─── Download File ────────────────────────────────────────────────
exports.downloadFile = async (url, formatId, type) => {
  console.log(`[downloadFile] URL: ${url}, Format: ${formatId}, Type: ${type}`);

  if (!fs.existsSync(COOKIES_PATH)) {
    throw new Error('COOKIES_MISSING');
  }

  const id = uuidv4();
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const filename = `${type}_${id}.${ext}`;
  const filePath = path.join(PROJECT_ROOT, 'downloads', filename);

  const args = [
    ...baseArgs(),
    '-f', formatId || (type === 'audio' ? 'bestaudio' : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'),
    '-o', filePath,
    '--no-playlist',
    url
  ];

  if (type === 'audio') {
    args.push('--extract-audio', '--audio-format', 'mp3');
  } else {
    args.push('--merge-output-format', 'mp4');
  }

  console.log(`[downloadFile] Starting...`);
  await runYtdlp(args);
  console.log(`[downloadFile] Completed: ${filePath}`);

  if (fs.existsSync(filePath)) {
    return filePath;
  } else {
    throw new Error('Downloaded file not found after yt-dlp execution');
  }
};
