# Linktree Events Scraper & Firebase Integration

## Overview
This pipeline scrapes event data from Linktree pages (specifically Posh.vip event links) and uploads them to Firebase Firestore with images.

## Features
- ✅ Scrapes Linktree pages for event links with dates
- ✅ Extracts detailed event information from Posh.vip pages
- ✅ Captures event images from multiple sources (Open Graph, Schema.org, img tags)
- ✅ Parses Cloudflare CDN URLs to get original image paths
- ✅ Deduplicates images and prioritizes highest quality
- ✅ Uploads events to Firestore `campus_events_live` collection
- ✅ Saves raw scrape data to `events_from_linktree_raw` collection
- ✅ Fallback to external image URLs if Firebase Storage not configured

## Quick Start

### 1. Scrape Linktree
```bash
npm run scrape:linktree
```

This will:
- Open a browser and navigate to the configured Linktree URL
- Find all links with dates in their titles
- Scrape each Posh.vip event page for details
- Extract event images from multiple sources
- Save results to `linktree_scrape_YYYY-MM-DD.json`

### 2. Upload to Firebase
```bash
npm run upload:linktree
```

This will:
- Read the most recent `linktree_scrape_*.json` file
- Download event images
- Attempt to upload to Firebase Storage (or use external URLs if Storage not configured)
- Save events to Firestore `campus_events_live` collection
- Save raw data to `events_from_linktree_raw` collection

### 3. Run Complete Daily Pipeline
```bash
npm run linktree:daily
```

This will:
- Clean up past events (ended >12 hours ago)
- Scrape Linktree for new events
- Upload to Firebase (prevents duplicates)
- Clean up old raw data (>30 days)
- Show statistics

**See [AUTOMATION_GUIDE.md](./AUTOMATION_GUIDE.md) for setting up daily automation.**

### 4. Upload a Specific File
```bash
node upload_linktree_to_firebase.js linktree_scrape_2025-11-16.json
```

## Configuration

### Update Linktree URL
Edit `scrape_linktree.js` line 450:
```javascript
const LINKTREE_URL = "https://linktr.ee/richcreatives";
```

### Firebase Storage (Optional)
If you want to host images on Firebase Storage instead of using external URLs:

1. Enable Firebase Storage in Firebase Console
2. The script will automatically upload images to `linktree_events/` folder
3. Images will be publicly accessible

**Note:** The script works without Storage enabled - it will use external Posh.vip image URLs as fallback.

## Data Structure

### Firestore: `campus_events_live` Collection
```javascript
{
  title: "Event Title",
  description: "Full event description",
  locationName: "Venue Name",
  address: "123 Street, City, TX 12345",
  startTimeLocal: "Sat, Nov 15 at 9:00 PM - 2:00 AM (CST)",
  startTimeISO: "2025-11-15T21:00:00-06:00",
  endTimeISO: "2025-11-16T02:00:00-06:00",
  sourceType: "linktree",
  sourceOrg: "Venue/Organizer Name",
  sourceUrl: "https://posh.vip/e/event-slug",
  imageUrl: "https://storage.googleapis.com/.../image.jpg", // or external URL
  additionalInfo: ["Early arrival suggested", "Security Enforced"],
  confidence: 0.7,
  createdAt: Timestamp,
  lastSeenAt: Timestamp
}
```

### Firestore: `events_from_linktree_raw` Collection
Contains complete raw scrape data including:
- All extracted images with metadata
- Original Linktree title
- All event details from Posh.vip
- Upload timestamps

### JSON Output File Structure
```javascript
{
  "scrapedAt": "2025-11-16T23:43:56.208Z",
  "sourceUrl": "https://linktr.ee/richcreatives",
  "totalLinksFound": 12,
  "linksWithDates": 3,
  "uniqueLinks": 3,
  "events": [
    {
      "title": "Event Title",
      "url": "https://posh.vip/e/event-slug",
      "normalizedUrl": "https://posh.vip/e/event-slug",
      "eventDetails": {
        "title": "Event Title",
        "venue": "Venue Name",
        "dateTime": "Sat, Nov 15 at 9:00 PM - 2:00 AM (CST)",
        "description": "Event description...",
        "address": "123 Street, City, TX 12345",
        "additionalInfo": ["Early arrival suggested"],
        "images": [
          {
            "url": "https://posh.vip/cdn-cgi/image/...",
            "originalUrl": "https://posh-images-...s3.amazonaws.com/...",
            "source": "schema.org",
            "width": 1080,
            "height": 800
          }
        ],
        "primaryImage": "https://posh.vip/..."
      }
    }
  ]
}
```

## Image Extraction

The scraper extracts images from multiple sources in priority order:
1. **Schema.org JSON-LD** - Structured event data (highest priority)
2. **Open Graph meta tags** - Social media preview images
3. **img tags** - Direct image elements (filtered for event posters)

### Features:
- Parses Cloudflare CDN URLs to extract original image paths
- Deduplicates images (same image at different sizes)
- Prioritizes highest quality/resolution
- Selects best image as `primaryImage`

## Automation

### Cloud Scheduler (Recommended)
Set up a Cloud Scheduler job to run daily:

```bash
# Create Cloud Scheduler job
gcloud scheduler jobs create http linktree-scraper \
  --schedule="0 2 * * *" \
  --uri="YOUR_CLOUD_FUNCTION_URL" \
  --http-method=GET \
  --time-zone="America/Chicago"
```

### Local Cron Job
```bash
# Add to crontab (runs daily at 2 AM)
0 2 * * * cd /path/to/scraper && npm run scrape:linktree && npm run upload:linktree
```

## Troubleshooting

### "The specified bucket does not exist"
Firebase Storage is not enabled. The script will automatically use external image URLs instead. To enable Storage:
1. Go to Firebase Console → Storage
2. Click "Get Started"
3. Re-run the upload script

### No events found
- Check the Linktree URL is correct
- Verify the page has links with dates in their titles
- Check date patterns in `scrape_linktree.js` lines 9-20

### Images not extracting
- Posh.vip page structure may have changed
- Check browser console for errors
- Update selectors in `scrapePoshEvent` function

## Files

- `scrape_linktree.js` - Main scraper script (Playwright-based)
- `upload_linktree_to_firebase.js` - Upload script for Firebase
- `firestore.js` - Firebase Admin SDK initialization
- `utils.js` - Shared utility functions
- `linktree_scrape_*.json` - Output files

## Dependencies

```json
{
  "@playwright/test": "^1.48.0",
  "firebase-admin": "^12.6.0",
  "node-fetch": "^3.3.2",
  "luxon": "^3.5.0"
}
```

## Notes

- Scraper uses headless browser (Playwright) to handle dynamic content
- Respects delays between requests to avoid rate limiting
- Events are deduplicated by canonical ID (title + time + location)
- Confidence score is 0.7 for Linktree events (vs 1.0 for official sources)

