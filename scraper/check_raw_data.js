// Check what's in the raw data collection
import { db } from "./firestore.js";

async function checkRawData() {
  console.log("🔍 Checking raw event data...\n");

  const snapshot = await db
    .collection("events_from_linktree_raw")
    .orderBy("lastSeenAt", "desc")
    .limit(5)
    .get();

  console.log(`📊 Found ${snapshot.size} recent raw events\n`);
  console.log("=" .repeat(80));

  snapshot.docs.forEach((doc, idx) => {
    const data = doc.data();
    console.log(`\n${idx + 1}. ${data.title || "Untitled"}`);
    console.log(`   Source URL: ${data.url || data.sourceUrl || "N/A"}`);
    console.log(`   Date/Time: ${data.eventDetails?.dateTime || "N/A"}`);
    console.log(`   Description snippet: ${(data.eventDetails?.description || "").substring(0, 200)}...`);
    console.log(`   Image: ${data.eventDetails?.primaryImage ? "✅ Yes" : "❌ No"}`);
    console.log(`   Raw ISO times:`);
    console.log(`     - Has startTimeISO: ${data.startTimeISO ? "✅ " + data.startTimeISO : "❌ No"}`);
    console.log(`     - Has endTimeISO: ${data.endTimeISO ? "✅ " + data.endTimeISO : "❌ No"}`);
  });

  console.log("\n" + "=" .repeat(80));
  process.exit(0);
}

checkRawData().catch(error => {
  console.error("💥 Error:", error);
  process.exit(1);
});

