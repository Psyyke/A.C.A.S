#!/bin/sh
# Builds the A.C.A.S Calculation Server installer for this computer's system.
# Linux gets an AppImage (plus a .deb when possible), macOS gets a .dmg and .zip.
# Run it with: sh build.sh
set -eu
cd "$(dirname "$0")"

say() { printf '\n%s\n' "$*"; }
fail() { say "The build stopped: $*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
node_ok() {
    have node && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)" >/dev/null 2>&1
}
fetch() {
    if have curl; then curl -fL --progress-bar -o "$2" "$1"
    elif have wget; then wget -q --show-progress -O "$2" "$1"
    else fail "this needs curl or wget to download Node.js."
    fi
}
sha256() {
    if have sha256sum; then sha256sum "$1" | cut -d' ' -f1
    else shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) fail "this script is for Linux and macOS. On Windows, run build.bat." ;;
esac
case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) fail "there's no Electron build for $(uname -m)." ;;
esac

NODE_DIR="$PWD/.node"
NODE_TMP="$PWD/.node-tmp"
if [ -x "$NODE_DIR/bin/node" ]; then PATH="$NODE_DIR/bin:$PATH"; export PATH; fi

if ! node_ok; then
    say "Node.js 22.12 or newer isn't installed, so grabbing a private copy just for this folder..."
    base=https://nodejs.org/dist/latest-v24.x
    rm -rf "$NODE_TMP"
    mkdir -p "$NODE_TMP"
    fetch "$base/SHASUMS256.txt" "$NODE_TMP/sums.txt"
    line=$(grep -- "-$os-$arch\.tar\.gz\$" "$NODE_TMP/sums.txt" | head -n 1) || true
    [ -n "$line" ] || fail "couldn't find a Node.js download for $os $arch."
    hash=${line%% *}
    file=${line##* }
    fetch "$base/$file" "$NODE_TMP/$file"
    [ "$(sha256 "$NODE_TMP/$file")" = "$hash" ] || fail "the Node.js download didn't match its checksum, so it wasn't used."
    tar -xzf "$NODE_TMP/$file" -C "$NODE_TMP"
    rm -rf "$NODE_DIR"
    mv "$NODE_TMP/${file%.tar.gz}" "$NODE_DIR"
    rm -rf "$NODE_TMP"
    PATH="$NODE_DIR/bin:$PATH"; export PATH
    node_ok || fail "the downloaded Node.js didn't start."
fi

say "Installing build tools..."
if [ -d node_modules ]; then npm install --no-audit --no-fund; else npm ci --no-audit --no-fund; fi

if [ "$os" = darwin ]; then
    say "Building the macOS app..."
    npx --no-install electron-builder --mac --publish never
else
    say "Building the Linux AppImage..."
    npx --no-install electron-builder --linux AppImage --publish never
    # The .deb needs extra system tools on some setups, so it's a nice extra rather than a must.
    say "Trying the .deb package too..."
    npx --no-install electron-builder --linux deb --publish never \
        || say "Skipped the .deb (the AppImage above is ready and works on most Linux systems)."
fi

say "All done! Your installer is in the dist folder: $PWD/dist"
