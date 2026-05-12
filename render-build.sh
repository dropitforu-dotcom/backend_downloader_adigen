#!/usr/bin/env bash
set -o errexit

echo "=== Adigen Backend Build ==="

# 1. npm
echo "[1/3] npm install..."
npm install

# 2. yt-dlp standalone binary
echo "[2/3] Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./yt-dlp
chmod a+rx ./yt-dlp
echo "yt-dlp version: $(./yt-dlp --version)"

# 3. ffmpeg static binary
echo "[3/3] Downloading ffmpeg..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz
FFMPEG_DIR=$(ls -d ffmpeg-*-amd64-static 2>/dev/null | head -n 1)
if [ -n "$FFMPEG_DIR" ]; then
  mv "$FFMPEG_DIR/ffmpeg" ./ffmpeg
  mv "$FFMPEG_DIR/ffprobe" ./ffprobe
  rm -rf "$FFMPEG_DIR" ffmpeg.tar.xz
  chmod a+rx ./ffmpeg ./ffprobe
  echo "ffmpeg: $(./ffmpeg -version | head -n 1)"
fi

echo "=== Build Complete ==="
