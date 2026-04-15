#!/bin/bash
set -e

echo "Pulling latest changes..."
git pull

echo "Cleaning dist folder..."
[ -d dist ] && rm -r dist

echo "Building for PRODUCTION..."
npm run build -- --mode production

echo "Zipping build..."
cd dist
zip -r ../dist.zip . .well-known
cd ..

echo "Uploading..."
curl -X POST https://deploy.mgdh.in/upload-zip \
  -F "id=69347d6f3c70560aad1760a7" \
  -F "zip=@dist.zip"

echo "Cleaning zip..."
rm dist.zip

echo "🚀 Production Deployment complete 🚀"