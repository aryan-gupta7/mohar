#!/usr/bin/env bash
# Serves the dashboard on http://127.0.0.1:8088 (static files only; no backend).
cd "$(dirname "$0")" && exec python3 -m http.server 8088 --bind 127.0.0.1
