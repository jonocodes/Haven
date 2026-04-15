#!/usr/bin/env bash
# Build the ntfy Go source to a wasip1 WASM binary.
# Run from the wasm/ directory or from the project root via npm run build:wasm.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "→ tidying Go modules..."
CGO_ENABLED=0 go mod tidy

echo "→ compiling ntfy to WASM (wasip1)..."
CGO_ENABLED=0 GOOS=wasip1 GOARCH=wasm go build -o ../ntfy.wasm .

echo "✓ built ntfy.wasm ($(du -sh ../ntfy.wasm | cut -f1))"
