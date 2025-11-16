// cleanup_instagram_firestore.js
// Remove Instagram scraped data from Firestore

import { db } from "./firestore.js";

async function cleanupInstagramData() {
  console.log("🧹 Cleaning up Instagram data from Firestore...\n");

  // Clean up events_from_instagram_raw collection
  console.log("Deleting from events_from_instagram_raw...");
  const rawSnapshot = await db.collection("events_from_instagram_raw").get();
  const rawBatch = db.batch();
  let rawCount = 0;
  
  rawSnapshot.forEach((doc) => {
    rawBatch.delete(doc.ref);
    rawCount++;
  });
  
  if (rawCount > 0) {
    await rawBatch.commit();
    console.log(`✅ Deleted ${rawCount} documents from events_from_instagram_raw`);
  } else {
    console.log("ℹ️  No documents found in events_from_instagram_raw");
  }

  // Clean up campus_events_live collection (only Instagram events)
  console.log("\nDeleting Instagram events from campus_events_live...");
  const liveSnapshot = await db
    .collection("campus_events_live")
    .where("sourceType", "==", "instagram")
    .get();
  
  const liveBatch = db.batch();
  let liveCount = 0;
  
  liveSnapshot.forEach((doc) => {
    liveBatch.delete(doc.ref);
    liveCount++;
  });
  
  if (liveCount > 0) {
    await liveBatch.commit();
    console.log(`✅ Deleted ${liveCount} Instagram events from campus_events_live`);
  } else {
    console.log("ℹ️  No Instagram events found in campus_events_live");
  }

  console.log("\n✨ Cleanup complete!");
}

cleanupInstagramData()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error during cleanup:", error);
    process.exit(1);
  });

