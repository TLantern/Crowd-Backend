// Fix database - Remove all problematic Linktree events and start fresh
import { db } from "./firestore.js";
import { DateTime } from "luxon";

const TZ = "America/Chicago";

async function fixDatabase() {
  console.log("🔧 Fixing Linktree events database...\n");

  // Get all Linktree events
  const snapshot = await db
    .collection("campus_events_live")
    .where("sourceType", "==", "linktree")
    .get();

  console.log(`📊 Found ${snapshot.size} Linktree events\n`);

  const toDelete = [];
  const toKeep = [];

  for (const doc of snapshot.docs) {
    const event = doc.data();
    let shouldDelete = false;
    let reason = "";

    // Check 1: Missing dates
    if (!event.startTimeISO && !event.endTimeISO) {
      shouldDelete = true;
      reason = "No date information";
    }
    // Check 2: Past event (ended >12 hours ago)
    else if (event.endTimeISO || event.startTimeISO) {
      const now = DateTime.now().setZone(TZ);
      const eventTime = DateTime.fromISO(event.endTimeISO || event.startTimeISO);
      if (eventTime.isValid) {
        const hoursSince = now.diff(eventTime, "hours").hours;
        if (hoursSince > 12) {
          shouldDelete = true;
          reason = `Past event (ended ${Math.round(hoursSince)}h ago)`;
        }
      }
    }

    if (shouldDelete) {
      toDelete.push({
        id: doc.id,
        title: event.title || "Untitled",
        reason
      });
    } else {
      toKeep.push({
        id: doc.id,
        title: event.title || "Untitled",
        hasImage: !!event.imageUrl
      });
    }
  }

  // Show what will be done
  console.log("=" .repeat(70));
  console.log("CLEANUP PLAN");
  console.log("=" .repeat(70));
  console.log(`🗑️  Events to DELETE: ${toDelete.length}`);
  console.log(`✅ Events to KEEP: ${toKeep.length}`);
  console.log("=" .repeat(70) + "\n");

  if (toDelete.length > 0) {
    console.log("🗑️  DELETING:");
    toDelete.forEach((event, idx) => {
      console.log(`${idx + 1}. ${event.title} - ${event.reason}`);
    });
    console.log();
  }

  if (toKeep.length > 0) {
    console.log("✅ KEEPING:");
    toKeep.forEach((event, idx) => {
      const imageStatus = event.hasImage ? "✅ Has image" : "⚠️  No image";
      console.log(`${idx + 1}. ${event.title} - ${imageStatus}`);
    });
    console.log();
  }

  // Delete events
  if (toDelete.length > 0) {
    console.log("🗑️  Deleting events...");
    const batch = db.batch();
    toDelete.forEach(event => {
      batch.delete(db.collection("campus_events_live").doc(event.id));
    });
    await batch.commit();
    console.log(`   ✓ Deleted ${toDelete.length} events\n`);
  }

  console.log("=" .repeat(70));
  console.log("✨ DATABASE FIXED!");
  console.log("=" .repeat(70));
  console.log(`🗑️  Deleted: ${toDelete.length}`);
  console.log(`✅ Remaining: ${toKeep.length}`);
  console.log("=" .repeat(70) + "\n");

  if (toKeep.length === 0) {
    console.log("📋 Database is now empty. Run scraper to add fresh events:");
    console.log("   npm run linktree:daily");
  } else if (toKeep.some(e => !e.hasImage)) {
    console.log("⚠️  Some remaining events have no images.");
    console.log("   Run daily pipeline to update:");
    console.log("   npm run linktree:daily");
  } else {
    console.log("✅ Database is clean! All events have proper data.");
  }

  process.exit(0);
}

fixDatabase().catch(error => {
  console.error("💥 Error:", error);
  process.exit(1);
});

