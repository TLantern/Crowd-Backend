// Check ALL events in campus_events_live (not just Linktree)
import { db } from "./firestore.js";
import { DateTime } from "luxon";

const TZ = "America/Chicago";

async function checkAllEvents() {
  console.log("🔍 Checking ALL events in campus_events_live...\n");

  // Get ALL events
  const snapshot = await db
    .collection("campus_events_live")
    .get();

  console.log(`📊 Total events in database: ${snapshot.size}\n`);

  const now = DateTime.now().setZone(TZ);
  const events = [];
  const bySource = new Map();
  const duplicateTitles = new Map();

  for (const doc of snapshot.docs) {
    const event = doc.data();
    
    // Track by source
    const source = event.sourceType || "unknown";
    if (!bySource.has(source)) {
      bySource.set(source, 0);
    }
    bySource.set(source, bySource.get(source) + 1);

    // Track duplicates by title
    const title = event.title?.toLowerCase() || "untitled";
    if (!duplicateTitles.has(title)) {
      duplicateTitles.set(title, []);
    }
    duplicateTitles.get(title).push({
      id: doc.id,
      source: event.sourceType,
      hasImage: !!event.imageUrl
    });

    // Check if past
    let status = "UNKNOWN";
    let timeInfo = "No time data";
    
    if (event.endTimeISO || event.startTimeISO) {
      const eventTime = DateTime.fromISO(event.endTimeISO || event.startTimeISO);
      if (eventTime.isValid) {
        const hoursSince = now.diff(eventTime, "hours").hours;
        if (hoursSince > 12) {
          status = "❌ PAST";
          timeInfo = `Ended ${Math.round(hoursSince)}h ago`;
        } else if (hoursSince > 0) {
          status = "🔄 RECENT";
          timeInfo = `Ended ${Math.round(hoursSince)}h ago`;
        } else {
          status = "✅ UPCOMING";
          const hoursUntil = Math.abs(hoursSince);
          timeInfo = `In ${Math.round(hoursUntil)}h`;
        }
      }
    }

    events.push({
      id: doc.id,
      title: event.title || "Untitled",
      status,
      timeInfo,
      source: event.sourceType || "unknown",
      hasImage: !!event.imageUrl,
      imageUrl: event.imageUrl
    });
  }

  // Show breakdown by source
  console.log("=" .repeat(80));
  console.log("EVENTS BY SOURCE");
  console.log("=" .repeat(80));
  for (const [source, count] of bySource.entries()) {
    console.log(`${source}: ${count} events`);
  }

  // Show duplicates
  console.log("\n" + "=" .repeat(80));
  console.log("DUPLICATE CHECK (BY TITLE)");
  console.log("=" .repeat(80));
  
  let duplicateCount = 0;
  for (const [title, instances] of duplicateTitles.entries()) {
    if (instances.length > 1) {
      console.log(`\n⚠️  "${title}" appears ${instances.length} times:`);
      instances.forEach(inst => {
        console.log(`   - ${inst.id.substring(0, 20)}... (${inst.source}) ${inst.hasImage ? '🖼️' : '❌'}`);
      });
      duplicateCount++;
    }
  }
  
  if (duplicateCount === 0) {
    console.log("✅ No duplicates found by title");
  }

  // Show past events
  const pastEvents = events.filter(e => e.status === "❌ PAST");
  if (pastEvents.length > 0) {
    console.log("\n" + "=" .repeat(80));
    console.log("PAST EVENTS (SHOULD BE DELETED)");
    console.log("=" .repeat(80));
    pastEvents.forEach((event, idx) => {
      console.log(`${idx + 1}. ${event.title} (${event.source})`);
      console.log(`   ${event.timeInfo}`);
      console.log(`   Image: ${event.hasImage ? '✅' : '❌'}`);
    });
  }

  // Show events without images
  const noImageEvents = events.filter(e => !e.hasImage);
  if (noImageEvents.length > 0) {
    console.log("\n" + "=" .repeat(80));
    console.log("EVENTS WITHOUT IMAGES");
    console.log("=" .repeat(80));
    noImageEvents.forEach((event, idx) => {
      console.log(`${idx + 1}. ${event.title} (${event.source}) - ${event.status}`);
    });
  }

  // Summary
  const upcomingEvents = events.filter(e => e.status === "✅ UPCOMING");
  
  console.log("\n" + "=" .repeat(80));
  console.log("SUMMARY");
  console.log("=" .repeat(80));
  console.log(`📅 Total events: ${events.length}`);
  console.log(`❌ Past events: ${pastEvents.length}`);
  console.log(`✅ Upcoming events: ${upcomingEvents.length}`);
  console.log(`🖼️  Events without images: ${noImageEvents.length}`);
  console.log(`♻️  Duplicate titles: ${duplicateCount}`);
  console.log("=" .repeat(80));

  if (pastEvents.length > 0 || duplicateCount > 0) {
    console.log("\n⚠️  ACTION NEEDED:");
    console.log("   Run: npm run linktree:cleanup-now");
    console.log("   This will remove past events and duplicates");
  }

  process.exit(0);
}

checkAllEvents().catch(error => {
  console.error("💥 Error:", error);
  process.exit(1);
});

