#!/bin/bash

set -e

rm -r dist || true
mkdir dist
npm run build
cp lib/bundle.js dist/
cd dist
tar c . > "../presenter-build.tar"
echo "OK."
