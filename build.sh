#!/bin/bash

set -e

rm -r dist || true
mkdir dist
npm run build
cp lib/bundle.js dist/index.js

# Build FE
cp -r fe dist/
npx esbuild --target=es2015 --minify ./fe/view/view.js > ./dist/fe/view/view.js

cd dist
tar c . > "../presenter-build.tar"
echo "OK."
