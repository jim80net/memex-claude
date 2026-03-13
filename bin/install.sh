#!/bin/sh
# Downloads the prebuilt skill-router binary for the current platform.
# Usage: ./bin/install.sh [version]
#   version defaults to "latest"
set -e

REPO="jim80net/claude-skill-router"
VERSION="${1:-latest}"
DIR="$(cd "$(dirname "$0")" && pwd)"

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux*)  PLATFORM_OS="linux" ;;
    Darwin*) PLATFORM_OS="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM_OS="win32" ;;
    *)
      echo "Unsupported OS: $OS" >&2
      exit 1
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64) PLATFORM_ARCH="x64" ;;
    aarch64|arm64) PLATFORM_ARCH="arm64" ;;
    *)
      echo "Unsupported architecture: $ARCH" >&2
      exit 1
      ;;
  esac

  echo "${PLATFORM_OS}-${PLATFORM_ARCH}"
}

PLATFORM="$(detect_platform)"
echo "Detected platform: $PLATFORM"

if [ "$PLATFORM_OS" = "win32" ]; then
  ASSET="skill-router-${PLATFORM}.zip"
else
  ASSET="skill-router-${PLATFORM}.tar.gz"
fi

if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
fi

echo "Downloading $URL..."
TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"' EXIT

if command -v curl >/dev/null 2>&1; then
  curl -fSL -o "$TMPFILE" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget -q -O "$TMPFILE" "$URL"
else
  echo "Neither curl nor wget found. Install one and retry." >&2
  exit 1
fi

# Extract to a temp directory first to avoid overwriting the wrapper script.
# The tarball contains a file named "skill-router" (the binary) which would
# clobber bin/skill-router (the shell wrapper) if extracted directly into $DIR.
EXTRACT_DIR="$(mktemp -d)"
trap 'rm -rf "$TMPFILE" "$EXTRACT_DIR"' EXIT

echo "Extracting to $DIR..."
case "$ASSET" in
  *.tar.gz) tar -xzf "$TMPFILE" -C "$EXTRACT_DIR" ;;
  *.zip)    unzip -o "$TMPFILE" -d "$EXTRACT_DIR" ;;
esac

# Move the binary as skill-router.bin so the wrapper script finds it
if [ -f "$EXTRACT_DIR/skill-router" ]; then
  mv "$EXTRACT_DIR/skill-router" "$DIR/skill-router.bin"
  chmod +x "$DIR/skill-router.bin"
elif [ -f "$EXTRACT_DIR/skill-router.exe" ]; then
  mv "$EXTRACT_DIR/skill-router.exe" "$DIR/skill-router.exe"
  chmod +x "$DIR/skill-router.exe" 2>/dev/null || true
fi

# Copy ONNX shared libraries alongside the binary
for lib in "$EXTRACT_DIR"/*.so* "$EXTRACT_DIR"/*.dylib "$EXTRACT_DIR"/*.dll; do
  [ -f "$lib" ] && cp "$lib" "$DIR/"
done

echo "Installed skill-router ($PLATFORM) to $DIR"
