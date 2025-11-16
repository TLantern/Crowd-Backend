/**
 * Fetch Linktree Events Cloud Function
 * WARNING: This requires Playwright which is not ideal for Cloud Functions
 * Recommended: Run the scraper locally/on a server and use Cloud Scheduler
 * This is a placeholder for HTTP-triggered cleanup only
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { DateTime } = require("luxon");

const db = admin.firestore();
const TZ = "America/Chicago";

/**
 * Check if an event has passed
 */
function hasEventPassed(startTimeISO, endTimeISO) {
  if (!startTimeISO && !endTimeISO) {
    return false;
  }

  const now = DateTime.now().setZone(TZ);
  const eventTime = endTimeISO || startTimeISO;
  const eventDT = DateTime.fromISO(eventTime);
  
  if (!eventDT.isValid) return false;

  // Event has passed if it ended more than 12 hours ago
  const hoursSinceEnd = now.diff(eventDT, "hours").hours;
  return hoursSinceEnd > 12;
}

/**
 * Clean up past Linktree events
 */
async function cleanupPastLinktreeEvents() {
  console.log("🧹 Cleaning up past Linktree events...");
  
  const linktreeSnapshot = await db
    .collection("campus_events_live")
    .where("sourceType", "==", "linktree")
    .get();

  let deletedCount = 0;
  let keptCount = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of linktreeSnapshot.docs) {
    const event = doc.data();
    
    if (hasEventPassed(event.startTimeISO, event.endTimeISO)) {
      console.log(`  🗑️  Deleting: ${event.title}`);
      batch.delete(doc.ref);
      batchCount++;
      deletedCount++;

      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    } else {
      keptCount++;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`  ✓ Deleted ${deletedCount} past events`);
  console.log(`  ✓ Kept ${keptCount} upcoming events`);

  return { deleted: deletedCount, kept: keptCount };
}

/**
 * Clean up old raw events (>30 days)
 */
async function cleanupOldRawEvents() {
  console.log("🧹 Cleaning up old raw Linktree data...");
  
  const thirtyDaysAgo = DateTime.now().setZone(TZ).minus({ days: 30 }).toJSDate();
  
  const oldRawSnapshot = await db
    .collection("events_from_linktree_raw")
    .where("lastSeenAt", "<", thirtyDaysAgo)
    .limit(500)
    .get();

  if (oldRawSnapshot.empty) {
    console.log("  ✓ No old raw events to clean");
    return { deleted: 0 };
  }

  const batch = db.batch();
  oldRawSnapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  
  console.log(`  ✓ Deleted ${oldRawSnapshot.size} old raw events`);
  return { deleted: oldRawSnapshot.size };
}

/**
 * HTTP Cloud Function: Cleanup past Linktree events
 * Can be triggered by Cloud Scheduler
 * 
 * Note: The scraping part should run on a server with Playwright installed,
 * then trigger this cleanup function via HTTP
 */
exports.cleanupLinktreeEvents = functions.https.onRequest(async (req, res) => {
  try {
    console.log("🚀 Starting Linktree cleanup...");
    
    const cleanupResult = await cleanupPastLinktreeEvents();
    const rawCleanupResult = await cleanupOldRawEvents();

    res.status(200).json({
      success: true,
      message: "Linktree events cleanup completed",
      deletedLiveEvents: cleanupResult.deleted,
      keptLiveEvents: cleanupResult.kept,
      deletedRawEvents: rawCleanupResult.deleted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Cleanup error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Scheduled Cloud Function: Daily cleanup at 3 AM
 * Uncomment to use (requires Firebase Blaze plan)
 */
/*
exports.dailyLinktreeCleanup = functions.pubsub
  .schedule("0 3 * * *")
  .timeZone(TZ)
  .onRun(async (context) => {
    console.log("🚀 Running scheduled Linktree cleanup...");
    
    try {
      await cleanupPastLinktreeEvents();
      await cleanupOldRawEvents();
      console.log("✅ Scheduled cleanup complete");
    } catch (error) {
      console.error("❌ Scheduled cleanup failed:", error);
      throw error;
    }
  });
*/

