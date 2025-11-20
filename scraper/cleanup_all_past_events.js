// cleanup_all_past_events.js
// Remove ALL past events from ALL sources

import { db } from "./firestore.js";
import { DateTime } from "luxon";

const TZ = "America/Chicago";

function hasEventPassed(startTimeISO, endTimeISO) {
  if (!startTimeISO && !endTimeISO) return false;
  const now = DateTime.now().setZone(TZ);
  const eventTime = endTimeISO || startTimeISO;
  const eventDT = DateTime.fromISO(eventTime);
  if (!eventDT.isValid) return false;
  const hoursSinceEnd = now.diff(eventDT, "hours").hours;
  return hoursSinceEnd > 12;
}

async function cleanupAllPastEvents() {
  console.log("🧹 Cleaning up ALL past events from ALL sources...\n");

  const snapshot = await db
    .collection("campus_events_live")
    .get();

  console.log(`📊 Total events: ${snapshot.size}\n`);

  const toDelete = [];
  const bySource = new Map();

  for (const doc of snapshot.docs) {
    const event = doc.data();
    const source = event.sourceType || "unknown";

    if (!bySource.has(source)) {
      bySource.set(source, { total: 0, past: 0 });
    }
    bySource.get(source).total++;

    if (hasEventPassed(event.startTimeISO, event.endTimeISO)) {
      toDelete.push({
        id: doc.id,
        title: event.title,
        source: source
      });
      bySource.get(source).past++;
    }
  }

  console.log("=" .repeat(70));
  console.log("BREAKDOWN BY SOURCE");
  console.log("=" .repeat(70));
  for (const [source, counts] of bySource.entries()) {
    console.log(`${source}: ${counts.total} total, ${counts.past} past`);
  }
  console.log("=" .repeat(70) + "\n");

  console.log(`🗑️  Deleting ${toDelete.length} past events...\n`);

  // Delete in batches
  const batchSize = 500;
  let deletedCount = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = db.batch();
    const batchItems = toDelete.slice(i, i + batchSize);
    
    batchItems.forEach(event => {
      batch.delete(db.collection("campus_events_live").doc(event.id));
    });
    
    await batch.commit();
    deletedCount += batchItems.length;
    console.log(`   ✓ Deleted ${deletedCount} / ${toDelete.length}`);
  }

  console.log("\n" + "=" .repeat(70));
  console.log("✨ CLEANUP COMPLETE!");
  console.log("=" .repeat(70));
  console.log(`🗑️  Deleted: ${deletedCount} past events`);
  console.log(`✅ Remaining: ${snapshot.size - deletedCount} events`);
  console.log("=" .repeat(70) + "\n");

  process.exit(0);
}

cleanupAllPastEvents().catch(error => {
  console.error("💥 Error:", error);
  process.exit(1);
});

