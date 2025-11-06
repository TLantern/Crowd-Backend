// clear_campus_events.js
// Delete all events from all event collections

import { db } from "./firestore.js";

const COLLECTIONS = [
  "campus_events_live",
  "events_from_instagram_raw",
  "events_from_official_raw",
  "events_from_engage_raw"
];

const BATCH_SIZE = 500;

async function deleteCollection(collectionName) {
  const collectionRef = db.collection(collectionName);
  let deleted = 0;
  let batch = db.batch();
  let batchCount = 0;

  const snapshot = await collectionRef.get();
  
  if (snapshot.empty) {
    console.log(`📭 ${collectionName}: No documents to delete`);
    return 0;
  }

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    batchCount++;
    deleted++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`🗑️  ${collectionName}: Deleted ${deleted} documents...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`✅ ${collectionName}: Deleted ${deleted} documents`);
  return deleted;
}

async function run() {
  console.log("🚀 Starting deletion of all events...\n");

  const results = {};
  let totalDeleted = 0;

  for (const collectionName of COLLECTIONS) {
    try {
      const deleted = await deleteCollection(collectionName);
      results[collectionName] = deleted;
      totalDeleted += deleted;
    } catch (error) {
      console.error(`❌ Error deleting ${collectionName}:`, error.message);
      results[collectionName] = { error: error.message };
    }
  }

  console.log("\n📊 Summary:");
  console.log(JSON.stringify(results, null, 2));
  console.log(`\n✅ Total documents deleted: ${totalDeleted}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
