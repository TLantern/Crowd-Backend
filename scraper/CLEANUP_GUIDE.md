# Cleanup Guide - Remove Duplicates & Past Events

## 🎯 Quick Commands

### One-Time Cleanup (Now)
```bash
cd scraper
npm run linktree:cleanup-now
```
**What it does:**
- Removes events that ended >12 hours ago
- Removes duplicate events (keeps most recent)
- No confirmation required

### Interactive Cleanup
```bash
npm run linktree:cleanup
```
**What it does:**
- Shows you what will be deleted
- Asks for confirmation
- Detailed summary of changes

### Daily Automated Cleanup
```bash
npm run linktree:daily
```
**What it does:**
- Complete pipeline: cleanup → scrape → upload → cleanup old data
- Runs automatically if you set up cron/scheduler
- Prevents duplicates and removes past events

## 🔄 How It Works

### Past Event Cleanup
Events are automatically deleted if:
- Event has `endTimeISO` and ended >12 hours ago
- OR event has `startTimeISO` (no end time) and started >12 hours ago

**Example:**
```
Party ends: Nov 15 at 2:00 AM
Cleanup time: Nov 15 at 2:01 PM (12+ hours later)
Result: ✅ Deleted
```

### Duplicate Detection
Duplicates are identified by **canonical ID** = hash(title + time + location)

**Same event, different entries:**
```
Event A: "817 & Park" at "9 PM" at "Coopers"
Event B: "817 & Park" at "9 PM" at "Coopers"
Result: ♻️ Duplicate detected - Keep newest, delete oldest
```

## 📊 Current Database Status

Run this to check:
```bash
npm run linktree:cleanup
# Shows how many duplicates/past events exist
```

## ⚠️ Why Duplicates Happen

1. **Before duplicate prevention** - Events added before we implemented the canonical ID system
2. **Manual uploads** - Events uploaded outside the automated pipeline
3. **Title/location changes** - Organizer changes event details slightly

## 🛡️ Prevent Future Issues

### Option 1: Daily Cron (Recommended)
```bash
# Run at 2 AM daily
crontab -e
# Add:
0 2 * * * cd /path/to/scraper && npm run linktree:daily
```

### Option 2: Manual Weekly
```bash
# Run once a week
npm run linktree:cleanup-now
```

### Option 3: Cloud Scheduler
```bash
# Set up Cloud Scheduler to hit your cleanup endpoint
gcloud scheduler jobs create http linktree-cleanup \
  --schedule="0 2 * * *" \
  --uri="YOUR_CLEANUP_URL"
```

## 🔍 Check What's in Firestore

### Via Firebase Console:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select `crowd-6193c` project
3. Click **Firestore Database**
4. Go to `campus_events_live` collection
5. Filter: `sourceType == "linktree"`
6. Check `startTimeISO` to see if events are past

### Via Command Line:
```javascript
// Check for past events
import { db } from './firestore.js';
import { DateTime } from 'luxon';

const snapshot = await db.collection('campus_events_live')
  .where('sourceType', '==', 'linktree')
  .get();

const now = DateTime.now().setZone('America/Chicago');

snapshot.docs.forEach(doc => {
  const event = doc.data();
  const eventTime = DateTime.fromISO(event.endTimeISO || event.startTimeISO);
  const hoursSince = now.diff(eventTime, 'hours').hours;
  
  console.log(`${event.title}: ${hoursSince > 12 ? '❌ PAST' : '✅ ACTIVE'}`);
});
```

## 📝 Cleanup Logs

The cleanup shows:
```
📊 Found 8 Linktree events

🗑️  Deleting past event: 817 And Park
🗑️  Deleting past event: Take Her Thru There

🗑️  Deleting 2 events...
   ✓ Deleted 2 events

✅ Cleanup complete! 6 events remaining
```

## 🚨 Emergency: Clear ALL Linktree Events

**⚠️ WARNING: This deletes everything!**

```bash
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

## 💡 Best Practices

1. **Run cleanup before scraping** - The daily pipeline does this automatically
2. **Check logs regularly** - Make sure cleanup is running
3. **Use canonical IDs** - Always upload through the automated pipeline
4. **Monitor Firestore** - Check event counts weekly
5. **Set up automation** - Don't rely on manual cleanup

## 📞 Troubleshooting

### Duplicates still appearing
- Make sure you're using `npm run linktree:daily` (not manual uploads)
- Check if event title/time/location varies between scrapes
- Verify canonical ID generation in `utils.js`

### Past events not deleting
- Check if events have valid `startTimeISO` or `endTimeISO`
- Verify timezone is set to "America/Chicago"
- Run `npm run linktree:cleanup-now` manually

### All events deleted accidentally
- Check your backup (raw data in `events_from_linktree_raw`)
- Re-run scraper: `npm run scrape:linktree && npm run upload:linktree`

## 🎯 Summary

**For immediate cleanup:**
```bash
npm run linktree:cleanup-now
```

**For daily automation:**
```bash
npm run linktree:daily
```

**For checking status:**
```bash
npm run linktree:cleanup  # Shows what would be deleted
```

