# Linktree Events - Automation Guide

## Overview
This guide explains how to set up automatic daily scraping, uploading, and cleanup of Linktree events to Firebase.

## 🎯 What the Daily Pipeline Does

1. **Cleanup Past Events** - Removes events that ended >12 hours ago
2. **Scrape Linktree** - Fetches latest events from Linktree page
3. **Upload to Firebase** - Saves new events, updates existing ones
4. **Cleanup Old Raw Data** - Removes raw data older than 30 days
5. **Reports Statistics** - Shows current event counts and status

## 🚀 Quick Start

### Run Manually
```bash
cd scraper
npm run linktree:daily
```

This runs the complete pipeline: cleanup → scrape → upload → stats

## 🔄 Automated Daily Execution

### Option 1: Server Cron Job (Recommended)

Perfect for VPS, dedicated server, or always-on computer.

#### Setup on Linux/Mac:
```bash
# Edit crontab
crontab -e

# Add this line to run daily at 2 AM Central Time
0 2 * * * cd /path/to/Crowd-Backend/scraper && npm run linktree:daily >> /path/to/logs/linktree_$(date +\%Y\%m\%d).log 2>&1
```

#### Setup on Windows (Task Scheduler):
1. Open Task Scheduler
2. Create Basic Task → "Linktree Daily Scraper"
3. Trigger: Daily at 2:00 AM
4. Action: Start a program
   - Program: `cmd.exe`
   - Arguments: `/c cd C:\path\to\Crowd-Backend\scraper && npm run linktree:daily`
5. Save and test

### Option 2: Cloud Scheduler + Server Webhook

**Step 1: Create a webhook endpoint on your server**

```javascript
// server.js
const express = require('express');
const { exec } = require('child_process');
const app = express();

app.post('/webhook/linktree-daily', (req, res) => {
  // Verify request is from Cloud Scheduler
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }

  // Run the pipeline
  exec('cd /path/to/scraper && npm run linktree:daily', (error, stdout, stderr) => {
    if (error) {
      console.error('Pipeline error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true, output: stdout });
  });
});

app.listen(3000);
```

**Step 2: Deploy Cloud Scheduler**

```bash
# Create Cloud Scheduler job
gcloud scheduler jobs create http linktree-daily-scraper \
  --schedule="0 2 * * *" \
  --uri="https://your-server.com/webhook/linktree-daily" \
  --http-method=POST \
  --headers="Authorization=Bearer YOUR_SECRET_TOKEN" \
  --time-zone="America/Chicago" \
  --location="us-central1"
```

### Option 3: GitHub Actions (Cloud-based)

**Note:** Requires headless browser support in GitHub Actions.

Create `.github/workflows/linktree-daily.yml`:

```yaml
name: Linktree Daily Scraper

on:
  schedule:
    - cron: '0 7 * * *'  # 2 AM Central = 7 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  scrape-and-upload:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd scraper
          npm install
          npx playwright install chromium
      
      - name: Setup Firebase credentials
        run: |
          echo '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}' > scraper/serviceAccountKey.json
      
      - name: Run daily pipeline
        run: |
          cd scraper
          npm run linktree:daily
      
      - name: Cleanup
        if: always()
        run: rm scraper/serviceAccountKey.json
```

## 🧹 Cleanup Rules

### Live Events (`campus_events_live`)
Events are automatically deleted if:
- Event has `endTimeISO` and ended >12 hours ago
- OR event has `startTimeISO` and started >12 hours ago (no end time)

### Raw Events (`events_from_linktree_raw`)
Raw scrape data is deleted if:
- `lastSeenAt` is older than 30 days

## 🔒 Preventing Duplicates

The system prevents duplicates using **canonical IDs**:

```javascript
// Canonical ID = hash(title + startTime + location)
// Events with same title, time, and location are treated as duplicates
```

When a duplicate is detected:
- Updates `lastSeenAt` timestamp (keeps event fresh)
- Updates `imageUrl` if new one is better
- Does NOT create a new event

## 📊 Manual Cleanup

### Clean up past events only:
```javascript
// In scraper directory
node -e "
import { db } from './firestore.js';
const { DateTime } = require('luxon');

const snapshot = await db.collection('campus_events_live')
  .where('sourceType', '==', 'linktree')
  .get();

snapshot.docs.forEach(async doc => {
  const event = doc.data();
  const endTime = event.endTimeISO || event.startTimeISO;
  if (endTime) {
    const eventDT = DateTime.fromISO(endTime);
    const hoursSince = DateTime.now().diff(eventDT, 'hours').hours;
    if (hoursSince > 12) {
      await doc.ref.delete();
      console.log('Deleted:', event.title);
    }
  }
});
"
```

### Clear ALL Linktree events:
```bash
# WARNING: This deletes ALL Linktree events
node -e "
import { db } from './firestore.js';

const snapshot = await db.collection('campus_events_live')
  .where('sourceType', '==', 'linktree')
  .get();

const batch = db.batch();
snapshot.docs.forEach(doc => batch.delete(doc.ref));
await batch.commit();
console.log('Deleted', snapshot.size, 'events');
"
```

## ☁️ Cloud Function Cleanup (Optional)

For projects where scraping runs externally but cleanup should be in Cloud Functions:

### Deploy the cleanup function:
```bash
firebase deploy --only functions:cleanupLinktreeEvents
```

### Test the function:
```bash
curl -X POST https://us-central1-crowd-6193c.cloudfunctions.net/cleanupLinktreeEvents
```

### Schedule with Cloud Scheduler:
```bash
gcloud scheduler jobs create http linktree-cleanup \
  --schedule="0 3 * * *" \
  --uri="https://us-central1-crowd-6193c.cloudfunctions.net/cleanupLinktreeEvents" \
  --http-method=POST \
  --time-zone="America/Chicago"
```

## 📈 Monitoring

### Check pipeline status:
```bash
# View last run
cat /path/to/logs/linktree_$(date +%Y%m%d).log

# Count current events
npm run linktree:daily | grep "Upcoming events"
```

### Firebase Console:
1. Go to Firestore Database
2. Check `campus_events_live` collection
3. Filter: `sourceType == "linktree"`
4. Verify events are current

### Cloud Function Logs:
```bash
firebase functions:log --only cleanupLinktreeEvents
```

## ⚠️ Important Notes

1. **Playwright Requirement**: The scraper needs Playwright (headless browser). This works best on servers, not serverless environments.

2. **Rate Limiting**: The scraper includes delays between requests. Don't run more frequently than once per hour.

3. **Timezone**: All times are in `America/Chicago` (Central Time). Adjust in code if needed.

4. **Event Deduplication**: Based on title+time+location hash. If organizer changes title slightly, it creates a new event.

5. **Image Storage**: Falls back to external URLs if Firebase Storage not configured.

## 🔧 Troubleshooting

### Pipeline fails during scrape:
- Check if Playwright is installed: `npx playwright install chromium`
- Check if Linktree URL is still valid
- Verify page structure hasn't changed

### Duplicates appearing:
- Check if event title/time/location varies between scrapes
- Review canonical ID generation in `utils.js`

### Old events not deleting:
- Verify events have valid `startTimeISO` or `endTimeISO`
- Check timezone configuration
- Run manual cleanup script

### No new events found:
- Check if Linktree page has date patterns in titles
- Update date regex patterns in `scrape_linktree.js`
- Verify Posh.vip page structure

## 📝 Logs and Debugging

Enable detailed logging:
```bash
# In scraper directory
DEBUG=* npm run linktree:daily
```

View Firestore operations:
```bash
# Check what was added/updated
firebase firestore:get campus_events_live --limit 10 --where 'sourceType == "linktree"' --orderBy lastSeenAt desc
```

## 🎯 Best Practices

1. **Test First**: Run manually before automating
2. **Monitor Logs**: Check first few automated runs
3. **Backup Data**: Export Firestore before major changes
4. **Update Regularly**: Keep dependencies updated
5. **Set Alerts**: Monitor for failed runs (Cloud Monitoring)

## 📧 Support

For issues:
1. Check logs first
2. Review Firestore console
3. Test individual scripts:
   - `npm run scrape:linktree`
   - `npm run upload:linktree`
4. Check GitHub Actions logs (if using)

