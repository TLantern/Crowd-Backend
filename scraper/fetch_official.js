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

function formatDateTimeISO(startTime, endTime) {
  if (!startTime) return null;
  
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;
  
  return {
    start: start.toISOString(),
    end: end ? end.toISOString() : null
  };
}

function normalizeDescription(htmlDescription) {
  if (!htmlDescription) return "";
  
  // Convert HTML entities to normal characters
  const htmlEntities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '...',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&bull;': '•',
    '&middot;': '·'
  };
  
  let normalized = htmlDescription;
  
  // Replace named HTML entities
  for (const [entity, replacement] of Object.entries(htmlEntities)) {
    normalized = normalized.replace(new RegExp(entity, 'g'), replacement);
  }
  
  // Replace numeric HTML entities (like &#39; for apostrophe)
  normalized = normalized.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });
  
  // Replace hex HTML entities (like &#x27; for apostrophe)
  normalized = normalized.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  // Strip HTML tags
  normalized = normalized.replace(/<[^>]*>/g, '');
  
  // Clean up whitespace - replace multiple spaces with single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Trim leading/trailing whitespace
  normalized = normalized.trim();
  
  return normalized;
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
    const isoDateTime = formatDateTimeISO(startTime, endTime);
    
    out.push({
      eventId: ev.id?.toString() || ev.url,
      title: ev.title || "",
      description: normalizeDescription(ev.description || ""),
      organization: OFFICIAL_SOURCE_ORG,
      location: ev.location_name || ev.location || null,
      rawDateTime: formatDateTime(startTime, endTime),
      startTimeISO: isoDateTime?.start || null,
      endTimeISO: isoDateTime?.end || null,
      url: ev.url || "",
      imageUrl: ev.image_url || ev.image || null,
      category: ev.category || null,
      tags: ev.tags || [],
      allDay: ev.all_day || false,
      cost: ev.cost || null,
      contactInfo: ev.contact_info || ev.contact || null
    });
  }
  return out;
}

async function run() {
  const events = await fetchOfficialEvents14d();

  // Process all events (not just first 20)
  console.log(`📊 Processing ${events.length} events for next 14 days...`);

  // Log to Firebase/Firestore
  console.log("🔥 Logging events to Firebase...");
  let firebaseCount = 0;
  
  for (const ev of events) {
    try {
      // Write raw audit doc
      await writeOfficialRaw(ev.eventId, ev);

      // Build normalized event for live collection with full data
      const normalized = {
        title: ev.title,
        description: ev.description,
        locationName: ev.location,
        startTimeLocal: ev.rawDateTime,
        startTimeISO: ev.startTimeISO,
        endTimeISO: ev.endTimeISO,
        sourceType: "official",
        sourceOrg: ev.organization,
        sourceUrl: ev.url,
        imageUrl: ev.imageUrl,
        category: ev.category,
        tags: ev.tags,
        allDay: ev.allDay,
        cost: ev.cost,
        contactInfo: ev.contactInfo,
        // Add direct link to official event
        officialEventUrl: ev.url,
        // Add confidence score for official events
        confidence: 1.0
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
    eventsProcessed: events.length,
    eventsLoggedToFirebase: firebaseCount,
    events: events
  };

  // Write to JSON file
  const filename = `unt_events_${new Date().toISOString().split('T')[0]}.json`;
  writeFileSync(filename, JSON.stringify(output, null, 2));
  
  console.log(`✅ Saved ${events.length} events to ${filename}`);
  console.log(`🔥 Logged ${firebaseCount} events to Firebase`);
  console.log(`📊 Total events processed: ${events.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
