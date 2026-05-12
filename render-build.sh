#!/usr/bin/env bash
# exit on error
set -o errexit

apt-get update
apt-get install -y ffmpeg python3-pip
pip install yt-dlp
npm install
