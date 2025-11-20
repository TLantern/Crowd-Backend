// cleanup_now.js
// Auto-cleanup: Remove duplicates and past events (no confirmation)

import { db } from "./firestore.js";
import { canonicalIdForEvent } from "./utils.js";
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

async function cleanup() {
  console.log("🧹 Auto-cleanup: Removing past events and duplicates...\n");

  const snapshot = await db
    .collection("campus_events_live")
    .where("sourceType", "==", "linktree")
    .get();

  console.log(`📊 Found ${snapshot.size} Linktree events\n`);

  const eventsByCanonicalId = new Map();
  const toDelete = [];

  for (const doc of snapshot.docs) {
    const event = doc.data();
    const docId = doc.id;

    // Delete past events
    if (hasEventPassed(event.startTimeISO, event.endTimeISO)) {
      console.log(`🗑️  Deleting past event: ${event.title}`);
      toDelete.push(docId);
      continue;
    }

    // Check for duplicates
    const canonicalId = canonicalIdForEvent({
      title: event.title,
      startTimeLocal: event.startTimeLocal,
      locationName: event.locationName
    });

    if (!eventsByCanonicalId.has(canonicalId)) {
      eventsByCanonicalId.set(canonicalId, {
        id: docId,
        lastSeenAt: event.lastSeenAt?.toMillis() || event.createdAt?.toMillis() || 0
      });
    } else {
      const original = eventsByCanonicalId.get(canonicalId);
      const currentTime = event.lastSeenAt?.toMillis() || event.createdAt?.toMillis() || 0;

      if (currentTime > original.lastSeenAt) {
        console.log(`♻️  Deleting duplicate (older): ${event.title}`);
        toDelete.push(original.id);
        eventsByCanonicalId.set(canonicalId, { id: docId, lastSeenAt: currentTime });
      } else {
        console.log(`♻️  Deleting duplicate (older): ${event.title}`);
        toDelete.push(docId);
      }
    }
  }

  // Delete in batch
  if (toDelete.length > 0) {
    console.log(`\n🗑️  Deleting ${toDelete.length} events...`);
    const batch = db.batch();
    toDelete.forEach(id => {
      batch.delete(db.collection("campus_events_live").doc(id));
    });
    await batch.commit();
    console.log(`   ✓ Deleted ${toDelete.length} events`);
  } else {
    console.log("\n✓ No events to delete");
  }

  console.log(`\n✅ Cleanup complete! ${eventsByCanonicalId.size} events remaining\n`);
  process.exit(0);
}

cleanup().catch(error => {
  console.error("💥 Error:", error);
  process.exit(1);
});

