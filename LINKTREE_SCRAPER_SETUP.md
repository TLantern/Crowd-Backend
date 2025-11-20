# Linktree Scraper - Daily Cron Job Setup

This guide explains how to set up a daily cron job to automatically scrape Linktree pages and posh.vip group pages, filter out past events and duplicates, and save new events to Firestore.

## Features

- ✅ Scrapes multiple Linktree pages
- ✅ Scrapes posh.vip group pages
- ✅ Filters out past events (only keeps events within 14 days or started less than 12 hours ago)
- ✅ Prevents duplicates (checks Firestore before saving)
- ✅ Saves events to Firestore `campus_events_live` collection
- ✅ Runs daily via cron job

## Prerequisites

1. **Node.js installed** (v18+)
2. **Firebase service account key** (`scraper/serviceAccountKey.json`)
3. **All dependencies installed**: `npm install` in the `scraper` directory

## Quick Setup

### Option 1: Automated Setup (Recommended)

Run the setup script:

```bash
chmod +x scripts/setup_linktree_cron.sh
./scripts/setup_linktree_cron.sh
```

This will:
- Create a logs directory
- Set up a daily cron job at 2:00 AM
- Configure logging to `logs/linktree_scraper.log`

### Option 2: Manual Setup

1. **Make the script executable:**
   ```bash
   chmod +x scraper/scrape_linktree_daily.js
   ```

2. **Add to crontab:**
   ```bash
   crontab -e
   ```

3. **Add this line (runs daily at 2:00 AM):**
   ```
   0 2 * * * cd /path/to/Crowd-Backend/scraper && /usr/local/bin/node scrape_linktree_daily.js >> /path/to/Crowd-Backend/logs/linktree_scraper.log 2>&1
   ```
   
   Replace paths with your actual project paths.

## Cron Schedule Options

The default schedule is `0 2 * * *` (2:00 AM daily). You can customize:

- `0 2 * * *` - Daily at 2:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight
- `0 2 * * 1` - Every Monday at 2:00 AM

## Monitoring

### View Logs

```bash
# View recent logs
tail -f logs/linktree_scraper.log

# View last 100 lines
tail -n 100 logs/linktree_scraper.log

# Search for errors
grep -i error logs/linktree_scraper.log
```

### Check Cron Job Status

```bash
# List all cron jobs
crontab -l

# Check if cron service is running (Linux)
sudo systemctl status cron

# Check if cron service is running (macOS)
sudo launchctl list | grep cron
```

### Test Manually

Run the scraper manually to test:

```bash
cd scraper
node scrape_linktree_daily.js
```

## Configuration

### Update URLs to Scrape

Edit `scraper/scrape_linktree.js`:

```javascript
const LINKTREE_URLS = [
  "https://linktr.ee/richcreatives",
  "https://linktr.ee/dallaspoolparty",
  "https://linktr.ee/thecliqpromos"
];

const POSH_GROUP_URLS = [
  "https://posh.vip/g/quality-crazy-promotions-2"
];
```

### Change Schedule

Edit the cron job:

```bash
crontab -e
```

Update the schedule in the format: `minute hour day month weekday`

## Troubleshooting

### Cron Job Not Running

1. **Check cron service is running:**
   ```bash
   # Linux
   sudo systemctl status cron
   
   # macOS
   sudo launchctl list | grep cron
   ```

2. **Check cron logs:**
   ```bash
   # Linux
   grep CRON /var/log/syslog
   
   # macOS
   grep CRON /var/log/system.log
   ```

3. **Verify paths are absolute** in crontab (cron doesn't use your shell's PATH)

### Script Fails with "Node not found"

Use full path to node in crontab:

```bash
which node
# Use the full path in your cron job
```

### Firestore Authentication Errors

Ensure `scraper/serviceAccountKey.json` exists and has proper permissions:

```bash
ls -la scraper/serviceAccountKey.json
```

### Browser/Playwright Issues

The scraper uses Playwright which requires a browser. If running on a headless server:

1. Install dependencies:
   ```bash
   cd scraper
   npx playwright install chromium
   ```

2. Ensure the script runs with `headless: true` (already configured)

## Removing the Cron Job

```bash
crontab -l | grep -v 'scrape_linktree_daily.js' | crontab -
```

Or edit directly:

```bash
crontab -e
# Remove the line with scrape_linktree_daily.js
```

## How It Works

1. **Scraping**: The script scrapes all configured Linktree and posh.vip group pages
2. **Date Parsing**: Extracts and parses event dates/times to ISO format
3. **Filtering**: Removes events that:
   - Have no valid date
   - Started more than 12 hours ago
   - Are more than 14 days in the future
4. **Deduplication**: Checks Firestore for existing events using canonical ID (title + startTime + location)
5. **Saving**: Writes new events to `campus_events_live` collection in Firestore

## Event Data Structure

Events are saved with this structure:

```javascript
{
  title: "Event Title",
  locationName: "Venue Name",
  startTimeLocal: "2025-11-20T18:00:00.000-06:00",
  endTimeLocal: "2025-11-20T23:00:00.000-06:00",
  sourceType: "linktree",
  sourceOrg: "Linktree Event",
  sourceUrl: "https://posh.vip/...",
  description: "Event description...",
  address: "123 Main St, City, ST 12345",
  confidence: 1.0,
  createdAt: Timestamp,
  lastSeenAt: Timestamp
}
```

## Support

For issues or questions, check:
- Logs: `logs/linktree_scraper.log`
- Firestore console for saved events
- Cron system logs for execution issues

