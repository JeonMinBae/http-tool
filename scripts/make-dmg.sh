#!/bin/sh
# Builds the .app and packages it as a plain dmg with hdiutil (no Finder/AppleScript styling).
# Use this when `npm run tauri build` fails at bundle_dmg.sh (e.g. without Finder automation permission).
set -e
cd "$(dirname "$0")/.."
npm run tauri build -- --bundles app
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
ARCH=$(uname -m | sed 's/arm64/aarch64/')
BUNDLE=src-tauri/target/release/bundle
STAGE=$(mktemp -d)
cp -R "$BUNDLE/macos/HTTP Tool.app" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
mkdir -p "$BUNDLE/dmg"
hdiutil create -volname "HTTP Tool" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$BUNDLE/dmg/HTTP Tool_${VERSION}_${ARCH}.dmg"
rm -rf "$STAGE"
