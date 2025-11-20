// scrape_linktree_daily.js
// Daily cron job wrapper for Linktree scraper
// Runs the scraper, filters past events and duplicates, writes to Firestore

import { scrapeMultipleLinktrees, LINKTREE_URLS, POSH_GROUP_URLS, DIRECT_EVENT_URLS } from "./scrape_linktree.js";

async function runDailyScrape() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Starting daily Linktree scraper`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    const events = await scrapeMultipleLinktrees(LINKTREE_URLS, POSH_GROUP_URLS, DIRECT_EVENT_URLS);
    
    const saved = events.filter(e => e.saved).length;
    const skipped = events.filter(e => e.skipped).length;
    const errors = events.filter(e => e.error).length;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✨ Daily scrape complete!`);
    console.log(`   - Total events found: ${events.length}`);
    console.log(`   - Saved to Firestore: ${saved}`);
    console.log(`   - Skipped (duplicates/past): ${skipped}`);
    console.log(`   - Errors: ${errors}`);
    console.log(`${'='.repeat(60)}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Fatal error in daily scrape:`, error);
    process.exit(1);
  }
}

runDailyScrape();

