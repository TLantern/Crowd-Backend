#!/bin/bash
# Wrapper script for fetch_official.js to run from cron
# Ensures proper environment and logging

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Set PATH to include node
export PATH="/usr/local/bin:$PATH"

# Log file location
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/fetch_official_$(date +%Y%m%d_%H%M%S).log"

# Run the script and capture output
echo "=== Fetch Official Events - $(date) ===" >> "$LOG_FILE"
node fetch_official.js >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Successfully completed at $(date)" >> "$LOG_FILE"
else
    echo "❌ Failed with exit code $EXIT_CODE at $(date)" >> "$LOG_FILE"
fi

# Keep only last 10 log files
cd "$LOG_DIR"
ls -t fetch_official_*.log | tail -n +11 | xargs rm -f 2>/dev/null

exit $EXIT_CODE

