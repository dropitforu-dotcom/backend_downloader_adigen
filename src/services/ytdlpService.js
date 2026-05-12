const { execFile } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// ─── Cookies: use process.cwd() (Render-compatible) ─────────────
const cookiesPath = path.join(process.cwd(), 'cookies.txt');
console.log('Cookies Path:', cookiesPath);
console.log('Cookies Exists:', fs.existsSync(cookiesPath));

// ─── Resolve yt-dlp binary ──────────────────────────────────────
function getYtdlpBin() {
  // Check local binary first (downloaded by render-build.sh)
  const local = path.join(process.cwd(), 'yt-dlp');
  if (fs.existsSync(local)) {
    console.log('[yt-dlp] Using local binary:', local);
    return local;
  }
  console.log('[yt-dlp] Using system PATH: yt-dlp');
  return 'yt-dlp';
}

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

const YTDLP = getYtdlpBin();
const FFMPEG = getFfmpegBin();
console.log('[yt-dlp] Binary:', YTDLP);
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

// ─── Run yt-dlp safely via execFile (NO shell, NO injection) ────
function runYtdlp(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    console.log('[yt-dlp] CMD:', YTDLP, args.join(' '));

    execFile(YTDLP, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: timeout,
      cwd: process.cwd()
    }, (error, stdout, stderr) => {
      if (stderr) console.log('[yt-dlp] stderr:', stderr.substring(0, 500));
      if (error) {
        console.error('[yt-dlp] Error:', error.message);
        return reject({ message: stderr || error.message, stderr, stdout });
      }
      resolve(stdout);
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
// Command: yt-dlp --cookies cookies.txt -J "<URL>"
exports.fetchMetadata = async (url) => {
  console.log('[fetchMetadata] URL:', url);

  if (!isValidUrl(url)) {
    throw { message: 'Invalid URL format', stderr: null };
  }

  if (!fs.existsSync(cookiesPath)) {
    throw { message: 'cookies.txt not found on server', stderr: null };
  }

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
// Video: yt-dlp --cookies cookies.txt -f best "<URL>"
// Audio: yt-dlp --cookies cookies.txt -x --audio-format mp3 "<URL>"
exports.downloadFile = async (url, formatId, type) => {
  console.log('[downloadFile] URL:', url, 'Format:', formatId, 'Type:', type);

  if (!isValidUrl(url)) {
    throw { message: 'Invalid URL format', stderr: null };
  }

  if (!fs.existsSync(cookiesPath)) {
    throw { message: 'cookies.txt not found on server', stderr: null };
  }

  const id = uuidv4();
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const filename = `${type}_${id}.${ext}`;
  const filePath = path.join(process.cwd(), 'downloads', filename);

  let args;

  if (type === 'audio') {
    // yt-dlp --cookies cookies.txt -x --audio-format mp3 -o output "<URL>"
    args = [
      '--cookies', cookiesPath,
      '-x', '--audio-format', 'mp3',
      '--ffmpeg-location', FFMPEG,
      '--no-playlist',
      '-o', filePath,
      url
    ];
  } else {
    // yt-dlp --cookies cookies.txt -f <format> --merge-output-format mp4 -o output "<URL>"
    args = [
      '--cookies', cookiesPath,
      '-f', formatId || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
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
