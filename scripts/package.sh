#!/usr/bin/env bash
# Construit l'archive prête à déployer : release/homegestion-<version>.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
VERSION="$(node -p "require('./package.json').version")"
STAGE="$(mktemp -d)/homegestion"
mkdir -p "$STAGE/server" "$STAGE/web" release
cp package.json package-lock.json "$STAGE/"
cp -r server/dist "$STAGE/server/" && rm -f "$STAGE"/server/dist/*.test.js
cp -r web/dist "$STAGE/web/"
cp -r deploy "$STAGE/"
tar czf "release/homegestion-$VERSION.tar.gz" -C "$(dirname "$STAGE")" homegestion
echo "release/homegestion-$VERSION.tar.gz"
