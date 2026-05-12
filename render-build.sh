#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Installing npm dependencies..."
npm install

# Render Node environment might not have ffmpeg by default, so we download static builds
echo "Setting up dependencies for yt-dlp and ffmpeg..."

# Install yt-dlp
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp
chmod a+rx yt-dlp

# Download ffmpeg static binary
echo "Downloading ffmpeg..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz
mv ffmpeg-*-amd64-static/ffmpeg .
mv ffmpeg-*-amd64-static/ffprobe .
rm -rf ffmpeg-*-amd64-static ffmpeg.tar.xz
chmod a+rx ffmpeg ffprobe

echo "Build complete."
