// linktree_daily_pipeline.js
// Complete daily pipeline: Scrape → Upload → Cleanup past events

import { spawn } from "child_process";
import { db } from "./firestore.js";
import { DateTime } from "luxon";

const TZ = "America/Chicago";

/**
 * Run a command and return promise
 */
function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔧 Running: ${command} ${args.join(" ")}`);
    
    const proc = spawn(command, args, {
      stdio: "inherit",
      shell: true
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Check if an event has passed
 */
function hasEventPassed(startTimeISO, endTimeISO) {
  if (!startTimeISO && !endTimeISO) {
    // No date info - keep for manual review
    return false;
  }

  const now = DateTime.now().setZone(TZ);
  
  // Use end time if available, otherwise start time
  const eventTime = endTimeISO || startTimeISO;
  const eventDT = DateTime.fromISO(eventTime);
  
  if (!eventDT.isValid) return false;

  // Event has passed if it ended more than 12 hours ago
  const hoursSinceEnd = now.diff(eventDT, "hours").hours;
  return hoursSinceEnd > 12;
}

/**
 * Clean up past events from Firestore
 */
async function cleanupPastEvents() {
  console.log("\n🧹 Cleaning up past events...");
  
  try {
    // Get all Linktree events
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
        console.log(`  🗑️  Deleting past event: ${event.title}`);
        batch.delete(doc.ref);
        batchCount++;
        deletedCount++;

        // Firestore batch limit is 500 operations
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
      } else {
        keptCount++;
      }
    }

    // Commit remaining deletes
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`  ✓ Deleted ${deletedCount} past events`);
    console.log(`  ✓ Kept ${keptCount} upcoming/active events`);

    return { deleted: deletedCount, kept: keptCount };
  } catch (error) {
    console.error(`  ✗ Cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Clean up old raw events (older than 30 days)
 */
async function cleanupOldRawEvents() {
  console.log("\n🧹 Cleaning up old raw event data...");
  
  try {
    const thirtyDaysAgo = DateTime.now().setZone(TZ).minus({ days: 30 }).toJSDate();
    
    const oldRawSnapshot = await db
      .collection("events_from_linktree_raw")
      .where("lastSeenAt", "<", thirtyDaysAgo)
      .get();

    if (oldRawSnapshot.empty) {
      console.log(`  ✓ No old raw events to clean up`);
      return { deleted: 0 };
    }

    const batch = db.batch();
    let count = 0;

    for (const doc of oldRawSnapshot.docs) {
      batch.delete(doc.ref);
      count++;
      
      if (count >= 500) break; // Batch limit
    }

    await batch.commit();
    
    console.log(`  ✓ Deleted ${count} old raw events (>30 days)`);
    return { deleted: count };
  } catch (error) {
    console.error(`  ✗ Raw cleanup failed: ${error.message}`);
    return { deleted: 0 };
  }
}

/**
 * Get statistics
 */
async function getStatistics() {
  console.log("\n📊 Event Statistics:");
  
  try {
    const liveSnapshot = await db
      .collection("campus_events_live")
      .where("sourceType", "==", "linktree")
      .get();

    const rawSnapshot = await db
      .collection("events_from_linktree_raw")
      .get();

    console.log(`  📅 Live Linktree events: ${liveSnapshot.size}`);
    console.log(`  📦 Raw events in database: ${rawSnapshot.size}`);

    // Count upcoming vs past
    let upcoming = 0;
    let past = 0;
    const now = DateTime.now().setZone(TZ);

    for (const doc of liveSnapshot.docs) {
      const event = doc.data();
      if (event.startTimeISO) {
        const eventDT = DateTime.fromISO(event.startTimeISO);
        if (eventDT.isValid && eventDT > now) {
          upcoming++;
        } else {
          past++;
        }
      }
    }

    console.log(`  ⏩ Upcoming events: ${upcoming}`);
    if (past > 0) {
      console.log(`  ⚠️  Past events (should be cleaned): ${past}`);
    }

    return { live: liveSnapshot.size, raw: rawSnapshot.size, upcoming, past };
  } catch (error) {
    console.error(`  ✗ Stats failed: ${error.message}`);
    return null;
  }
}

/**
 * Main pipeline
 */
async function main() {
  console.log("=" .repeat(60));
  console.log("🚀 LINKTREE DAILY PIPELINE");
  console.log("=" .repeat(60));
  console.log(`📅 Started at: ${DateTime.now().setZone(TZ).toLocaleString(DateTime.DATETIME_FULL)}`);
  console.log("=" .repeat(60));

  const startTime = Date.now();

  try {
    // Step 1: Clean up past events FIRST (before scraping new ones)
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: CLEANUP PAST EVENTS");
    console.log("=".repeat(60));
    const cleanupResult = await cleanupPastEvents();
    await cleanupOldRawEvents();

    // Step 2: Scrape Linktree
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: SCRAPING LINKTREE");
    console.log("=".repeat(60));
    await runCommand("node", ["scrape_linktree.js"]);

    // Step 3: Upload to Firebase
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: UPLOADING TO FIREBASE");
    console.log("=".repeat(60));
    await runCommand("node", ["upload_linktree_to_firebase.js"]);

    // Step 4: Get final statistics
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: FINAL STATISTICS");
    console.log("=".repeat(60));
    const stats = await getStatistics();

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n" + "=".repeat(60));
    console.log("✨ PIPELINE COMPLETE!");
    console.log("=".repeat(60));
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`🗑️  Deleted: ${cleanupResult.deleted} past events`);
    console.log(`✅ Current: ${stats?.live || 0} live events`);
    console.log(`⏩ Upcoming: ${stats?.upcoming || 0} events`);
    console.log("=".repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("💥 PIPELINE FAILED");
    console.error("=".repeat(60));
    console.error(error);
    process.exit(1);
  }
}

// Run the pipeline
main();

