#!/bin/bash

# Configuration
APP_NAME="Messenger.app"
SOURCE_PATH="src-tauri/target/release/bundle/macos/$APP_NAME"
DEST_PATH="/Applications/$APP_NAME"

echo "🚀 Starting Deployment Flow..."

# 1. Close the app if it's running
if pgrep -x "Messenger" > /dev/null; then
    echo "📦 Closing running Messenger instance..."
    pkill -x "Messenger"
    sleep 1
fi

# 2. Build the app
echo "🏗️  Building Tauri App for Release..."
source "$HOME/.cargo/env"
npm run tauri build

# 3. Verify build success
if [ ! -d "$SOURCE_PATH" ]; then
    echo "❌ Build failed! App not found at $SOURCE_PATH"
    exit 1
fi

# 4. Copy to Applications
echo "🚚 Deploying to /Applications..."
rm -rf "$DEST_PATH"
cp -R "$SOURCE_PATH" "$DEST_PATH"

echo "✅ Successfully deployed to /Applications!"
echo "✨ You can now launch Messenger from your Applications folder or via Spotlight."
