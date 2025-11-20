// Check current Firestore status
import { db } from "./firestore.js";
import { DateTime } from "luxon";

const TZ = "America/Chicago";

async function checkStatus() {
  console.log("🔍 Checking Firestore database status...\n");

  // Get all Linktree events
  const snapshot = await db
    .collection("campus_events_live")
    .where("sourceType", "==", "linktree")
    .get();

  console.log(`📊 Total Linktree events in database: ${snapshot.size}\n`);

  const now = DateTime.now().setZone(TZ);
  const events = [];
  const duplicateTitles = new Map();

  for (const doc of snapshot.docs) {
    const event = doc.data();
    
    // Track duplicates by title
    const title = event.title?.toLowerCase() || "untitled";
    if (!duplicateTitles.has(title)) {
      duplicateTitles.set(title, []);
    }
    duplicateTitles.get(title).push(doc.id);

    // Check if past
    let status = "UNKNOWN";
    let timeInfo = "No time data";
    
    if (event.endTimeISO || event.startTimeISO) {
      const eventTime = DateTime.fromISO(event.endTimeISO || event.startTimeISO);
      if (eventTime.isValid) {
        const hoursSince = now.diff(eventTime, "hours").hours;
        if (hoursSince > 12) {
          status = "❌ PAST";
          timeInfo = `Ended ${Math.round(hoursSince)} hours ago`;
        } else if (hoursSince > 0) {
          status = "🔄 RECENT";
          timeInfo = `Ended ${Math.round(hoursSince)} hours ago`;
        } else {
          status = "✅ UPCOMING";
          const hoursUntil = Math.abs(hoursSince);
          timeInfo = `In ${Math.round(hoursUntil)} hours`;
        }
      }
    }

    events.push({
      id: doc.id,
      title: event.title || "Untitled",
      status,
      timeInfo,
      startTime: event.startTimeISO || "N/A",
      endTime: event.endTimeISO || "N/A",
      imageUrl: event.imageUrl || "❌ NO IMAGE",
      hasImage: !!event.imageUrl,
      location: event.locationName || "N/A"
    });
  }

  // Show all events
  console.log("=" .repeat(80));
  console.log("ALL EVENTS IN DATABASE");
  console.log("=" .repeat(80));
  events.forEach((event, idx) => {
    console.log(`\n${idx + 1}. ${event.title}`);
    console.log(`   Status: ${event.status} (${event.timeInfo})`);
    console.log(`   Start: ${event.startTime}`);
    console.log(`   End: ${event.endTime}`);
    console.log(`   Location: ${event.location}`);
    console.log(`   Image: ${event.hasImage ? '✅ ' + event.imageUrl.substring(0, 60) + '...' : '❌ NO IMAGE'}`);
    console.log(`   Doc ID: ${event.id.substring(0, 20)}...`);
  });

  // Check for duplicates
  console.log("\n" + "=" .repeat(80));
  console.log("DUPLICATE CHECK");
  console.log("=" .repeat(80));
  
  let duplicateCount = 0;
  for (const [title, ids] of duplicateTitles.entries()) {
    if (ids.length > 1) {
      console.log(`\n⚠️  "${title}" appears ${ids.length} times:`);
      ids.forEach(id => console.log(`   - ${id}`));
      duplicateCount++;
    }
  }
  
  if (duplicateCount === 0) {
    console.log("✅ No duplicates found by title");
  } else {
    console.log(`\n⚠️  Total titles with duplicates: ${duplicateCount}`);
  }

  // Summary
  const pastEvents = events.filter(e => e.status === "❌ PAST");
  const upcomingEvents = events.filter(e => e.status === "✅ UPCOMING");
  const noImageEvents = events.filter(e => !e.hasImage);

  console.log("\n" + "=" .repeat(80));
  console.log("SUMMARY");
  console.log("=" .repeat(80));
  console.log(`📅 Total events: ${events.length}`);
  console.log(`❌ Past events (should be deleted): ${pastEvents.length}`);
  console.log(`✅ Upcoming events: ${upcomingEvents.length}`);
  console.log(`🖼️  Events without images: ${noImageEvents.length}`);
  console.log(`♻️  Duplicate titles: ${duplicateCount}`);
  console.log("=" .repeat(80));

  if (pastEvents.length > 0) {
    console.log("\n⚠️  ACTION NEEDED: Run cleanup to remove past events");
    console.log("   Command: npm run linktree:cleanup-now");
  }

  if (noImageEvents.length > 0) {
    console.log("\n⚠️  ISSUE: Some events don't have images");
    console.log("   These events are missing images:");
    noImageEvents.forEach(e => console.log(`   - ${e.title}`));
  }

  if (duplicateCount > 0) {
    console.log("\n⚠️  ACTION NEEDED: Remove duplicate events");
    console.log("   Command: npm run linktree:cleanup-now");
  }

  process.exit(0);
}

checkStatus().catch(error => {
  console.error("💥 Error:", error);
  process.exit(1);
});

