#!/bin/bash
# Setup daily cron job for Linktree scraper
# This script sets up a cron job to run the scraper daily at 2 AM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRAPER_DIR="$PROJECT_DIR/scraper"
CRON_LOG="$PROJECT_DIR/logs/linktree_scraper.log"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Get the full path to node (use which node or specify path)
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Create the cron job entry
# Runs daily at 2:00 AM
CRON_SCHEDULE="0 2 * * *"
CRON_COMMAND="cd $SCRAPER_DIR && $NODE_PATH linktree_daily_pipeline.js >> $CRON_LOG 2>&1"

# Check if cron job already exists
CRON_EXISTS=$(crontab -l 2>/dev/null | grep -c "linktree_daily_pipeline.js" 2>/dev/null || echo "0")
# Ensure it's a clean integer (remove any whitespace/newlines)
CRON_EXISTS=$(echo "$CRON_EXISTS" | tr -d '[:space:]')
# Default to 0 if empty or not a number
if [ -z "$CRON_EXISTS" ] || ! [[ "$CRON_EXISTS" =~ ^[0-9]+$ ]]; then
    CRON_EXISTS=0
fi

if [ "$CRON_EXISTS" -gt 0 ]; then
    echo "⚠️  Cron job already exists. Removing old entry..."
    crontab -l 2>/dev/null | grep -v "linktree_daily_pipeline.js" | crontab -
fi

# Add the new cron job
(crontab -l 2>/dev/null; echo "$CRON_SCHEDULE $CRON_COMMAND") | crontab -

echo "✅ Cron job installed successfully!"
echo ""
echo "📋 Details:"
echo "   Schedule: Daily at 2:00 AM"
echo "   Script: $SCRAPER_DIR/linktree_daily_pipeline.js"
echo "   Log file: $CRON_LOG"
echo ""
echo "📸 This pipeline includes:"
echo "   - Event scraping from Linktree/Posh.vip"
echo "   - Image download and upload to Firebase Storage"
echo "   - Automatic cleanup of past events"
echo ""
echo "To view your cron jobs:"
echo "   crontab -l"
echo ""
echo "To remove this cron job:"
echo "   crontab -l | grep -v 'linktree_daily_pipeline.js' | crontab -"
echo ""
echo "To view logs:"
echo "   tail -f $CRON_LOG"

