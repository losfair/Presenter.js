#!/bin/bash

set -e

rm -r dist || true
mkdir dist
npm run build
cp lib/bundle.js dist/index.js

# Build FE
FE_ESBUILD="npx esbuild --bundle --target=es2015 --format=iife --platform=browser --minify"
cp -r fe dist/
$FE_ESBUILD ./fe/view/view.js > ./dist/fe/view/view.js
$FE_ESBUILD ./fe/present/present.js > ./dist/fe/present/present.js

cd dist
tar c . > "../presenter-build.tar"
echo "OK."
