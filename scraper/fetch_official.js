// fetch_official.js
// Funnel 2: Official UNT events -> Firestore
// 1. Fetch upcoming 14 days from UNT calendar API / RSS
// 2. Normalize
// 3. Upsert to Firestore (same campus_events_live collection)
// 4. Store raw for audit

import fetch from "node-fetch";
import { writeFileSync } from "fs";
import {
  writeOfficialRaw,
  writeNormalizedEvent
} from "./firestore.js";

// NOTE: You must confirm the real UNT calendar API endpoint.
// Many campuses run Localist. Pattern often looks like:
// https://calendar.unt.edu/api/2/events?days=14&pp=200
//
// We assume JSON response shape:
// { events: [ { event: { id, title, start_time, end_time, url, place: { name } } }, ... ] }

const OFFICIAL_SOURCE_ORG = "UNT Official";

function formatDateTime(startTime, endTime) {
  if (!startTime) return null;
  
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;
  
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  
  const startFormatted = start.toLocaleDateString('en-US', options);
  
  if (end) {
    const endOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    const endFormatted = end.toLocaleDateString('en-US', endOptions);
    return `${startFormatted} to ${endFormatted}`;
  }
  
  return startFormatted;
}

async function fetchOfficialEvents14d() {
  const resp = await fetch(
    "https://calendar.unt.edu/api/2/events?days=14&pp=200"
  );
  if (!resp.ok) {
    throw new Error(
      "Failed to fetch official calendar " + resp.status
    );
  }
  const data = await resp.json();

  const out = [];
  for (const wrapper of data.events ?? []) {
    const ev = wrapper.event ?? {};
    const startTime = ev.event_instances?.[0]?.event_instance?.start;
    const endTime = ev.event_instances?.[0]?.event_instance?.end;
    
    out.push({
      eventId: ev.id?.toString() || ev.url,
      title: ev.title || "",
      organization: OFFICIAL_SOURCE_ORG,
      location: ev.location_name || ev.location || null,
      rawDateTime: formatDateTime(startTime, endTime),
      url: ev.url || ""
    });
  }
  return out;
}

async function run() {
  const events = await fetchOfficialEvents14d();

  // Take only the first 20 events
  const first20Events = events.slice(0, 20);

  // Log to Firebase/Firestore
  console.log("🔥 Logging events to Firebase...");
  let firebaseCount = 0;
  
  for (const ev of first20Events) {
    try {
      // Write raw audit doc
      await writeOfficialRaw(ev.eventId, ev);

      // Build normalized event for live collection
      const normalized = {
        title: ev.title,
        locationName: ev.location,
        startTimeLocal: ev.rawDateTime,
        endTimeLocal: null, // We're storing the formatted datetime in startTimeLocal
        sourceType: "official",
        sourceOrg: ev.organization,
        sourceUrl: ev.url
      };

      await writeNormalizedEvent(normalized, 1.0);
      firebaseCount++;
    } catch (error) {
      console.error(`❌ Failed to log event ${ev.eventId}:`, error.message);
    }
  }

  // Create JSON output
  const output = {
    totalEvents: events.length,
    eventsReturned: first20Events.length,
    eventsLoggedToFirebase: firebaseCount,
    events: first20Events
  };

  // Write to JSON file
  const filename = `unt_events_${new Date().toISOString().split('T')[0]}.json`;
  writeFileSync(filename, JSON.stringify(output, null, 2));
  
  console.log(`✅ Saved ${first20Events.length} events to ${filename}`);
  console.log(`🔥 Logged ${firebaseCount} events to Firebase`);
  console.log(`📊 Total events available: ${events.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
