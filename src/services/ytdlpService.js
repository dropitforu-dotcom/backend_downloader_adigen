const { spawn } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const metadataCache = new Map();
const activeMetadataRequests = new Map();
const activeDownloads = new Map();


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

// ─── NOEMBED HELPER ───────────────────────────────────────────────
function fetchNoembed(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(4000, () => {
      req.destroy();
      reject(new Error('Noembed timeout'));
    });
  });
}

// ─── FETCH METADATA ─────────────────────────────────────────────
exports.fetchMetadata = async (url) => {
  console.log('[fetchMetadata] URL:', url);

  if (!isValidUrl(url)) {
    throw { message: 'Invalid URL format', stderr: null };
  }

  // 1. Cache hit
  if (metadataCache.has(url)) {
    console.log('[fetchMetadata] Cache hit for:', url);
    return metadataCache.get(url);
  }

  // 2. Request deduplication
  if (activeMetadataRequests.has(url)) {
    console.log('[fetchMetadata] Deduplicating request for:', url);
    return await activeMetadataRequests.get(url);
  }

  const fetchPromise = (async () => {
    // Try lightweight API first to avoid yt-dlp overhead
    try {
      const json = await fetchNoembed(url);
      if (!json.error && json.title) {
        console.log('[fetchMetadata] Used lightweight Noembed API');
        const data = {
          title: json.title,
          thumbnail: json.thumbnail_url || json.thumbnail || '',
          duration: 0,
          uploader: json.author_name || '',
          platform: json.provider_name || 'Unknown',
          formats: [
            { format_id: 'best', ext: 'mp4', resolution: 'HD', filesize: 0 }
          ]
        };
        metadataCache.set(url, data);
        setTimeout(() => metadataCache.delete(url), 3600000); // 1 hr cache
        return data;
      }
    } catch (e) {
      console.log('[fetchMetadata] Noembed failed, falling back to yt-dlp');
    }

    // Fallback to yt-dlp
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

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (err) {
      console.error('[yt-dlp] JSON parse error:', err.message);
      throw { message: 'This video is temporarily unavailable. Try another video.', stderr: null };
    }

    const data = {
      title: parsed.title || 'Untitled',
      thumbnail: parsed.thumbnail || '',
      duration: parsed.duration || 0,
      uploader: parsed.uploader || '',
      platform: parsed.extractor || 'unknown',
      formats: (parsed.formats || [])
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

    if (data.formats.length === 0) {
      data.formats = [{ format_id: 'best', ext: 'mp4', resolution: 'HD', filesize: 0 }];
    }

    metadataCache.set(url, data);
    setTimeout(() => metadataCache.delete(url), 3600000);
    return data;
  })();

  activeMetadataRequests.set(url, fetchPromise);
  try {
    const result = await fetchPromise;
    activeMetadataRequests.delete(url);
    return result;
  } catch (err) {
    activeMetadataRequests.delete(url);
    throw err;
  }
};

// ─── DOWNLOAD FILE ──────────────────────────────────────────────
exports.downloadFile = async (url, formatId, type) => {
  console.log('[downloadFile] URL:', url, 'Format:', formatId, 'Type:', type);

  if (!isValidUrl(url)) {
    throw { message: 'Invalid URL format', stderr: null };
  }

  const hash = crypto.createHash('md5').update(url + formatId + type).digest('hex');
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const filename = `${type}_${hash}.${ext}`;
  const filePath = path.join(process.cwd(), 'downloads', filename);

  // 1. Static file cache check (Massive CPU/BW saving)
  if (fs.existsSync(filePath)) {
    console.log('[downloadFile] Static cache hit:', filename);
    return filePath;
  }

  // 2. Request deduplication (Prevent identical concurrent downloads)
  const dedupKey = hash;
  if (activeDownloads.has(dedupKey)) {
    console.log('[downloadFile] Deduplicating concurrent download:', filename);
    return await activeDownloads.get(dedupKey);
  }

  const downloadPromise = (async () => {
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

    console.log('[downloadFile] Executing yt-dlp...');
    await runYtdlp(args, 300000); // 5 min timeout
    console.log('[downloadFile] Success:', filePath);

    if (fs.existsSync(filePath)) {
      return filePath;
    }
    throw { message: 'Downloaded file not found', stderr: null };
  })();

  activeDownloads.set(dedupKey, downloadPromise);
  try {
    const result = await downloadPromise;
    activeDownloads.delete(dedupKey);
    return result;
  } catch (err) {
    activeDownloads.delete(dedupKey);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // Cleanup corrupt partials
    throw err;
  }
};
