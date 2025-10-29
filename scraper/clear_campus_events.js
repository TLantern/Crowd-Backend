// clear_campus_events.js
// Clear all documents from campus_events_live collection

import { db } from "./firestore.js";

async function clearCampusEvents() {
  console.log("🗑️  Clearing campus_events_live collection...");
  
  const collectionRef = db.collection("campus_events_live");
  const snapshot = await collectionRef.get();
  
  if (snapshot.empty) {
    console.log("✅ Collection is already empty.");
    return;
  }
  
  console.log(`📊 Found ${snapshot.size} documents to delete...`);
  
  // Delete in batches of 500 (Firestore limit)
  const batchSize = 500;
  let deletedCount = 0;
  
  const deleteInBatches = async (docs) => {
    const batch = db.batch();
    
    docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    deletedCount += docs.length;
    console.log(`🔄 Deleted ${deletedCount}/${snapshot.size} documents...`);
  };
  
  let batch = [];
  for (const doc of snapshot.docs) {
    batch.push(doc);
    
    if (batch.length === batchSize) {
      await deleteInBatches(batch);
      batch = [];
    }
  }
  
  // Delete remaining documents
  if (batch.length > 0) {
    await deleteInBatches(batch);
  }
  
  console.log(`✅ Successfully cleared ${deletedCount} documents from campus_events_live collection.`);
}

clearCampusEvents().catch((err) => {
  console.error("❌ Error clearing collection:", err);
  process.exit(1);
});
