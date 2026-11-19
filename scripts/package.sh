#!/usr/bin/env bash
# Builds dist/ and zips it as todoist-to-calendar-<version>.zip.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
version=$(node -p "require('./dist/manifest.json').version")
out="todoist-to-calendar-$version.zip"
rm -f "$out"
(cd dist && zip -X -q -r "../$out" . -x '*.DS_Store')
echo "Created $out"
unzip -l "$out"
