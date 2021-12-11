#!/bin/bash

set -e

rm -r dist res/fe || true
mkdir -p dist res
npm run build

# Build FE
FE_ESBUILD="npx esbuild --bundle --target=es2015 --format=iife --platform=browser --minify"
cp -r fe res/
$FE_ESBUILD ./fe/view/view.js > ./res/fe/view/view.js
$FE_ESBUILD ./fe/present/present.js > ./res/fe/present/present.js

echo "OK."
