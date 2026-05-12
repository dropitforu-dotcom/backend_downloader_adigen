#!/usr/bin/env bash
set -o errexit

echo "=== Adigen Backend Build ==="

# Install npm dependencies first
echo "[1/3] Installing npm dependencies..."
npm install

# Download yt-dlp standalone binary (no pip/python needed)
echo "[2/3] Downloading yt-dlp binary..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./yt-dlp
chmod a+rx ./yt-dlp
echo "yt-dlp version: $(./yt-dlp --version)"

# Download ffmpeg static binary
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
  echo "WARNING: ffmpeg extraction failed, trying npm ffmpeg-static fallback..."
fi

echo "=== Build Complete ==="
