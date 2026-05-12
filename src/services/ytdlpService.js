const { execFile } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// ─── Binary Resolution ──────────────────────────────────────────────
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

// ─── Cookies Resolution ─────────────────────────────────────────────
function getCookiesPath() {
  const cookiesPath = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    console.log(`[yt-dlp] Cookies file found: ${cookiesPath}`);
    return cookiesPath;
  }
  console.warn(`[yt-dlp] WARNING: cookies.txt not found at ${cookiesPath}`);
  console.warn(`[yt-dlp] YouTube may block requests with "Sign in to confirm you're not a bot"`);
  return null;
}

const YTDLP = getYtdlpPath();
const FFMPEG = getFfmpegPath();
const COOKIES = getCookiesPath();

// ─── Core yt-dlp executor ───────────────────────────────────────────
function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    // Log command without exposing cookie file content
    const safeArgs = args.map(a => a.includes('cookies') ? '[cookies]' : a);
    console.log(`[yt-dlp] Running: ${YTDLP} ${safeArgs.join(' ')}`);

    execFile(YTDLP, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 180000, // 3 min timeout
      env: { ...process.env, PATH: `${process.cwd()}:${process.env.PATH}` }
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[yt-dlp] stderr: ${stderr}`);
        console.error(`[yt-dlp] exit code: ${error.code}`);
        return reject(new Error(stderr || error.message));
      }
      resolve(stdout);
    });
  });
}

// ─── Build base args (cookies + ffmpeg, no deprecated flags) ────────
function baseArgs() {
  const args = [
    '--no-warnings',
    '--prefer-free-formats',
    '--ffmpeg-location', FFMPEG,
  ];
  if (COOKIES) {
    args.push('--cookies', COOKIES);
  }
  return args;
}

// ─── Startup health check ──────────────────────────────────────────
(async () => {
  try {
    const version = await runYtdlp(['--version']);
    console.log(`[yt-dlp] Version: ${version.trim()}`);
    console.log(`[yt-dlp] ffmpeg:  ${FFMPEG}`);
    console.log(`[yt-dlp] cookies: ${COOKIES || 'NOT FOUND'}`);
  } catch (err) {
    console.error(`[yt-dlp] CRITICAL: yt-dlp not available!`, err.message);
  }
})();

// ─── Fetch Metadata ────────────────────────────────────────────────
exports.fetchMetadata = async (url) => {
  console.log(`[fetchMetadata] URL: ${url}`);

  const args = [
    ...baseArgs(),
    '--dump-json',
    url
  ];

  try {
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
  } catch (err) {
    console.error('[fetchMetadata] Error:', err.message);
    throw err;
  }
};

// ─── Download File ─────────────────────────────────────────────────
exports.downloadFile = async (url, formatId, type) => {
  console.log(`[downloadFile] URL: ${url}, Format: ${formatId}, Type: ${type}`);

  const id = uuidv4();
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const filename = `${type}_${id}.${ext}`;
  const filePath = path.join(process.cwd(), 'downloads', filename);

  const args = [
    ...baseArgs(),
    '-f', formatId || (type === 'audio' ? 'bestaudio' : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'),
    '-o', filePath,
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
    throw err;
  }
};
