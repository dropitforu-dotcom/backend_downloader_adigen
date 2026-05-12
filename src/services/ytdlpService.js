const { execFile, execSync } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// ─── Cookies Path (relative to this file: src/services/ → ../../cookies.txt) ──
const COOKIES_PATH = path.resolve(__dirname, '..', '..', 'cookies.txt');
console.log('[yt-dlp] Cookies Path:', COOKIES_PATH);
console.log('[yt-dlp] Cookies Exists:', fs.existsSync(COOKIES_PATH));

// ─── ffmpeg Resolution ────────────────────────────────────────────
function getFfmpegPath() {
  const localBin = path.resolve(__dirname, '..', '..', 'ffmpeg');
  if (fs.existsSync(localBin)) return localBin;
  try {
    const s = require('ffmpeg-static');
    if (s) return s;
  } catch (e) {}
  return 'ffmpeg';
}
const FFMPEG = getFfmpegPath();
console.log('[yt-dlp] ffmpeg Path:', FFMPEG);

// ─── Python3 + yt-dlp startup check ──────────────────────────────
try {
  const pyVer = execSync('python3 --version', { encoding: 'utf-8' }).trim();
  console.log(`[yt-dlp] ${pyVer}`);
} catch (e) {
  console.error('[yt-dlp] CRITICAL: python3 is NOT available on this system!');
}

try {
  const ytVer = execSync('python3 -m yt_dlp --version', { encoding: 'utf-8' }).trim();
  console.log(`[yt-dlp] yt-dlp version: ${ytVer}`);
  console.log('[yt-dlp] yt-dlp working ✓');
} catch (e) {
  console.error('[yt-dlp] CRITICAL: python3 -m yt_dlp is NOT available!', e.message);
}

// ─── URL sanitization ────────────────────────────────────────────
function sanitizeUrl(url) {
  // Normalize youtu.be short links
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) {
    return `https://www.youtube.com/watch?v=${shortMatch[1]}`;
  }
  // Normalize YouTube Shorts
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch) {
    return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
  }
  return url;
}

// ─── Run yt-dlp via python3 -m yt_dlp (execFile, NOT exec) ──────
function runYtdlp(userUrl, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const url = sanitizeUrl(userUrl);

    const args = ['-m', 'yt_dlp', '--no-warnings'];

    // Add cookies if file exists
    if (fs.existsSync(COOKIES_PATH)) {
      args.push('--cookies', COOKIES_PATH);
    }

    // Add ffmpeg location
    args.push('--ffmpeg-location', FFMPEG);

    // Add extra args (like --dump-json, -f, etc.)
    args.push(...extraArgs);

    // Add URL last
    args.push(url);

    // Log safely (never log cookie content)
    const safeArgs = args.map(a => a === COOKIES_PATH ? '[cookies.txt]' : a);
    console.log(`[yt-dlp] CMD: python3 ${safeArgs.join(' ')}`);

    execFile('python3', args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 180000,
      cwd: path.resolve(__dirname, '..', '..')
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('[yt-dlp] STDERR:', stderr);
        console.error('[yt-dlp] EXIT CODE:', error.code);
        const err = new Error(stderr || error.message);
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

// ─── Health check export ─────────────────────────────────────────
exports.healthCheck = () => {
  let ytDlpOk = false;
  try {
    execSync('python3 -m yt_dlp --version', { encoding: 'utf-8', timeout: 10000 });
    ytDlpOk = true;
  } catch (e) {}

  return {
    ytDlp: ytDlpOk,
    cookies: fs.existsSync(COOKIES_PATH),
    cookiesPath: COOKIES_PATH,
    ffmpeg: FFMPEG
  };
};

// ─── Fetch Metadata ──────────────────────────────────────────────
exports.fetchMetadata = async (url) => {
  console.log(`[fetchMetadata] URL: ${url}`);

  if (!fs.existsSync(COOKIES_PATH)) {
    const err = new Error('COOKIES_MISSING');
    err.stderr = `cookies.txt not found at: ${COOKIES_PATH}`;
    throw err;
  }

  const output = await runYtdlp(url, ['--dump-json', '--no-playlist']);
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

// ─── Download File ───────────────────────────────────────────────
exports.downloadFile = async (url, formatId, type) => {
  console.log(`[downloadFile] URL: ${url}, Format: ${formatId}, Type: ${type}`);

  if (!fs.existsSync(COOKIES_PATH)) {
    const err = new Error('COOKIES_MISSING');
    err.stderr = `cookies.txt not found at: ${COOKIES_PATH}`;
    throw err;
  }

  const id = uuidv4();
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const filename = `${type}_${id}.${ext}`;
  const filePath = path.resolve(__dirname, '..', '..', 'downloads', filename);

  const extraArgs = [
    '-f', formatId || (type === 'audio' ? 'bestaudio' : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'),
    '-o', filePath,
    '--no-playlist'
  ];

  if (type === 'audio') {
    extraArgs.push('--extract-audio', '--audio-format', 'mp3');
  } else {
    extraArgs.push('--merge-output-format', 'mp4');
  }

  console.log(`[downloadFile] Starting...`);
  await runYtdlp(url, extraArgs);
  console.log(`[downloadFile] Completed: ${filePath}`);

  if (fs.existsSync(filePath)) {
    return filePath;
  }
  throw new Error('Downloaded file not found after yt-dlp execution');
};
