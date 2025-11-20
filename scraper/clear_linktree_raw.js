// clear_linktree_raw.js
// Delete all documents from events_from_linktree_raw collection

import { db } from "./firestore.js";

const COLLECTION_NAME = "events_from_linktree_raw";
const BATCH_SIZE = 500;

async function deleteCollection() {
  const collectionRef = db.collection(COLLECTION_NAME);
  let deleted = 0;
  let batch = db.batch();
  let batchCount = 0;

  const snapshot = await collectionRef.get();
  
  if (snapshot.empty) {
    console.log(`📭 ${COLLECTION_NAME}: No documents to delete`);
    return 0;
  }

  console.log(`🗑️  Deleting ${snapshot.size} documents from ${COLLECTION_NAME}...`);

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    batchCount++;
    deleted++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`   Deleted ${deleted}/${snapshot.size} documents...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`✅ ${COLLECTION_NAME}: Deleted ${deleted} documents`);
  return deleted;
}

deleteCollection()
  .then((count) => {
    console.log(`\n✨ Cleanup complete! Deleted ${count} documents.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });

