#!/usr/bin/env bash
# Serves the built dashboard (run `npm run build` first) on http://127.0.0.1:8088/
cd "$(dirname "$0")" && exec python3 -m http.server 8088 --directory dist --bind 127.0.0.1
