#!/bin/bash
# Deploy Firebase Backend
# Interactive deployment script with safety checks

set -e

echo "🚀 Firebase Backend Deployment"
echo "=============================="
echo ""

# Check if firebase CLI is available
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo "⚠️  Not logged in to Firebase. Running 'firebase login'..."
    firebase login
fi

# Show current project
echo "📋 Current project:"
firebase use

echo ""
echo "What do you want to deploy?"
echo "1) Everything (functions + firestore)"
echo "2) Functions only"
echo "3) Firestore only"
echo "4) Cancel"
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo "🚀 Deploying everything..."
        firebase deploy
        ;;
    2)
        echo "⚡ Deploying functions..."
        firebase deploy --only functions
        ;;
    3)
        echo "💾 Deploying firestore..."
        firebase deploy --only firestore
        ;;
    4)
        echo "❌ Cancelled"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Deployment complete!"

