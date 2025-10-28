// cleanup.js
// Remove events from campus_events_live that are either
//  - more than 12h past start
//  - more than 14 days in the future
//
// This keeps feed relevant and prevents infinite growth.

import { db, deleteCampusEventDoc } from "./firestore.js";
import { shouldKeepEvent } from "./utils.js";

async function runCleanup() {
  const snap = await db.collection("campus_events_live").get();

  let deleted = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const startISO = data.startTimeLocal || null;

    if (!shouldKeepEvent(startISO)) {
      await deleteCampusEventDoc(doc.ref);
      deleted += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned: snap.size,
        deleted
      },
      null,
      2
    )
  );
}

runCleanup().catch((err) => {
  console.error(err);
  process.exit(1);
});
