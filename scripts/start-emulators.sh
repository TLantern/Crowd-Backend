#!/bin/bash
# Start Firebase Emulators
# Ensures Java is in PATH and starts all emulators

set -e

echo "🔥 Starting Firebase Emulators..."

# Add Java to PATH if needed
if ! command -v java &> /dev/null; then
    if [ -d "/opt/homebrew/opt/openjdk@17" ]; then
        export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
        echo "✅ Added Java 17 to PATH"
    else
        echo "⚠️  Java not found. Install with: brew install openjdk@17"
        exit 1
    fi
fi

# Start emulators
firebase emulators:start --project crowd-6193c

echo "✅ Emulators started!"
echo "📊 Emulator UI: http://localhost:4000"
echo "⚡ Functions: http://localhost:5001"
echo "💾 Firestore: http://localhost:8080"
echo "🔐 Auth: http://localhost:9099"

