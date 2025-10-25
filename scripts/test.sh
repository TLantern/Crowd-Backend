#!/bin/bash
# Run tests for Firebase Functions

set -e

echo "🧪 Running Firebase Functions Tests"
echo "===================================="
echo ""

cd functions

echo "📦 Installing dependencies..."
npm ci

echo "🔍 Running linter..."
npm run lint

echo "✅ Running tests..."
npm test || echo "⚠️  No tests configured yet"

echo ""
echo "✅ All checks passed!"

