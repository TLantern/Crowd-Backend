// cleanup_duplicates_and_past.js
// One-time cleanup: Remove duplicates and past events from Firestore

import { db } from "./firestore.js";
import { canonicalIdForEvent } from "./utils.js";
import { DateTime } from "luxon";

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

  const hoursSinceEnd = now.diff(eventDT, "hours").hours;
  return hoursSinceEnd > 12;
}

/**
 * Main cleanup function
 */
async function cleanup() {
  console.log("🧹 Starting cleanup of duplicates and past events...\n");

  // Get all Linktree events
  const snapshot = await db
    .collection("campus_events_live")
    .where("sourceType", "==", "linktree")
    .get();

  console.log(`📊 Found ${snapshot.size} total Linktree events in database\n`);

  const eventsByCanonicalId = new Map();
  const pastEvents = [];
  const duplicates = [];

  // Analyze all events
  for (const doc of snapshot.docs) {
    const event = doc.data();
    const docId = doc.id;

    // Check if event has passed
    if (hasEventPassed(event.startTimeISO, event.endTimeISO)) {
      pastEvents.push({ id: docId, title: event.title, time: event.startTimeISO || event.endTimeISO });
      continue;
    }

    // Calculate canonical ID
    const canonicalId = canonicalIdForEvent({
      title: event.title,
      startTimeLocal: event.startTimeLocal,
      locationName: event.locationName
    });

    if (!eventsByCanonicalId.has(canonicalId)) {
      // First occurrence - keep this one
      eventsByCanonicalId.set(canonicalId, {
        id: docId,
        title: event.title,
        createdAt: event.createdAt,
        lastSeenAt: event.lastSeenAt
      });
    } else {
      // Duplicate found
      const original = eventsByCanonicalId.get(canonicalId);
      
      // Keep the one with the most recent lastSeenAt, or earliest createdAt if no lastSeenAt
      const originalTime = original.lastSeenAt?.toMillis() || original.createdAt?.toMillis() || 0;
      const currentTime = event.lastSeenAt?.toMillis() || event.createdAt?.toMillis() || 0;

      if (currentTime > originalTime) {
        // Current event is newer, delete the old one
        duplicates.push({
          id: original.id,
          title: original.title,
          reason: "duplicate (older)"
        });
        eventsByCanonicalId.set(canonicalId, {
          id: docId,
          title: event.title,
          createdAt: event.createdAt,
          lastSeenAt: event.lastSeenAt
        });
      } else {
        // Original is newer or same, delete current
        duplicates.push({
          id: docId,
          title: event.title,
          reason: "duplicate (older)"
        });
      }
    }
  }

  // Display findings
  console.log("=" .repeat(60));
  console.log("CLEANUP SUMMARY");
  console.log("=" .repeat(60));
  console.log(`📅 Total events found: ${snapshot.size}`);
  console.log(`⏰ Past events (ended >12h ago): ${pastEvents.length}`);
  console.log(`♻️  Duplicate events: ${duplicates.length}`);
  console.log(`✅ Events to keep: ${eventsByCanonicalId.size}`);
  console.log("=" .repeat(60) + "\n");

  // Show past events to delete
  if (pastEvents.length > 0) {
    console.log("⏰ PAST EVENTS TO DELETE:");
    pastEvents.forEach((event, idx) => {
      console.log(`${idx + 1}. ${event.title}`);
      console.log(`   Time: ${event.time || 'Unknown'}`);
    });
    console.log();
  }

  // Show duplicates to delete
  if (duplicates.length > 0) {
    console.log("♻️  DUPLICATE EVENTS TO DELETE:");
    duplicates.forEach((event, idx) => {
      console.log(`${idx + 1}. ${event.title} (${event.reason})`);
    });
    console.log();
  }

  // Ask for confirmation
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    rl.question(`\n⚠️  Delete ${pastEvents.length + duplicates.length} events? (yes/no): `, resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
    console.log("\n❌ Cleanup cancelled.");
    process.exit(0);
  }

  // Delete past events
  console.log("\n🗑️  Deleting past events...");
  const batch1 = db.batch();
  let count1 = 0;
  
  for (const event of pastEvents) {
    const docRef = db.collection("campus_events_live").doc(event.id);
    batch1.delete(docRef);
    count1++;
    
    if (count1 >= 500) break; // Batch limit
  }
  
  if (count1 > 0) {
    await batch1.commit();
    console.log(`   ✓ Deleted ${count1} past events`);
  }

  // Delete duplicates
  console.log("🗑️  Deleting duplicate events...");
  const batch2 = db.batch();
  let count2 = 0;
  
  for (const event of duplicates) {
    const docRef = db.collection("campus_events_live").doc(event.id);
    batch2.delete(docRef);
    count2++;
    
    if (count2 >= 500) break; // Batch limit
  }
  
  if (count2 > 0) {
    await batch2.commit();
    console.log(`   ✓ Deleted ${count2} duplicate events`);
  }

  // Final summary
  console.log("\n" + "=" .repeat(60));
  console.log("✨ CLEANUP COMPLETE!");
  console.log("=" .repeat(60));
  console.log(`🗑️  Total deleted: ${count1 + count2}`);
  console.log(`✅ Events remaining: ${eventsByCanonicalId.size}`);
  console.log("=" .repeat(60));
  
  console.log("\n💡 To prevent duplicates in the future:");
  console.log("   Run: npm run linktree:daily");
  console.log("   Or set up daily automation (see AUTOMATION_GUIDE.md)\n");

  process.exit(0);
}

// Run cleanup
cleanup().catch(error => {
  console.error("💥 Error during cleanup:", error);
  process.exit(1);
});

