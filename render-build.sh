#!/usr/bin/env bash
set -o errexit

echo "=== Adigen Backend Build ==="

# 1. Install npm dependencies
echo "[1/3] Installing npm dependencies..."
npm install

# 2. Install/update yt-dlp via pip
echo "[2/3] Installing yt-dlp via pip..."
python3 -m pip install -U yt-dlp
echo "yt-dlp version: $(python3 -m yt_dlp --version)"

# 3. Download ffmpeg static binary
echo "[3/3] Downloading ffmpeg static binary..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz
FFMPEG_DIR=$(ls -d ffmpeg-*-amd64-static 2>/dev/null | head -n 1)
if [ -n "$FFMPEG_DIR" ]; then
  mv "$FFMPEG_DIR/ffmpeg" ./ffmpeg
  mv "$FFMPEG_DIR/ffprobe" ./ffprobe
  rm -rf "$FFMPEG_DIR" ffmpeg.tar.xz
  chmod a+rx ./ffmpeg ./ffprobe
  echo "ffmpeg version: $(./ffmpeg -version | head -n 1)"
else
  echo "WARNING: ffmpeg extraction failed"
fi

echo "=== Build Complete ==="
