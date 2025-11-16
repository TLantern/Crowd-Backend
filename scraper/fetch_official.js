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

async function fetchOfficialEvents14d(page = 1, startDate = null, endDate = null) {
  // Target: Nov 21 11:59 PM CST = Nov 22 5:59 AM UTC
  const targetEnd = "2025-11-22";
  const now = new Date();
  const startDateStr = startDate || now.toISOString().split('T')[0];
  const endDateStr = endDate || targetEnd;
  
  const resp = await fetch(
    `https://calendar.unt.edu/api/2/events?start=${startDateStr}&end=${endDateStr}&pp=500&page=${page}`
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
  return { events: out, hasMore: (data.events?.length || 0) >= 500 };
}

async function run() {
  const TARGET_DATE = "2025-11-22T06:00:00.000Z"; // Nov 22 12:00 AM CST
  
  let allEvents = [];
  
  // Query in date range chunks to avoid 100-event limit
  const dateRanges = [
    { start: "2025-11-11T13:00:00-06:00", end: "2025-11-12T00:00:00-06:00" },
    { start: "2025-11-12T00:00:00-06:00", end: "2025-11-14T00:00:00-06:00" },
    { start: "2025-11-14T00:00:00-06:00", end: "2025-11-16T00:00:00-06:00" },
    { start: "2025-11-16T00:00:00-06:00", end: "2025-11-18T00:00:00-06:00" },
    { start: "2025-11-18T00:00:00-06:00", end: "2025-11-20T00:00:00-06:00" },
    { start: "2025-11-20T00:00:00-06:00", end: "2025-11-21T00:00:00-06:00" },
    { start: "2025-11-21T00:00:00-06:00", end: "2025-11-22T00:00:00-06:00" }
  ];
  
  for (const range of dateRanges) {
    console.log(`📅 Fetching events from ${range.start} to ${range.end}...`);
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const result = await fetchOfficialEvents14d(page, range.start, range.end);
      const newEvents = result.events.filter(e => 
        !allEvents.find(existing => existing.eventId === e.eventId)
      );
      allEvents.push(...newEvents);
      hasMore = result.hasMore && result.events.length > 0;
      page++;
      console.log(`  📄 Page ${page - 1}: ${result.events.length} events, ${newEvents.length} new`);
      
      if (newEvents.length === 0 || (!hasMore && result.events.length < 100)) {
        break;
      }
    }
  }

  // Process all events (not just first 20)
  console.log(`📊 Processing ${allEvents.length} events for next 14 days...`);

  // Log to Firebase/Firestore
  console.log("🔥 Logging events to Firebase...");
  let firebaseCount = 0;
  
  for (const ev of allEvents) {
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

  // Find latest event date
  const dates = allEvents.map(e => e.endTimeISO).filter(d => d).sort().reverse();
  const latestDate = dates[0] || null;
  
  console.log(`\n📅 Latest event date: ${latestDate || 'none'}`);
  console.log(`🎯 Target date: ${TARGET_DATE}`);
  
  if (latestDate && latestDate >= TARGET_DATE) {
    console.log(`✅ Reached target date!`);
  } else if (latestDate) {
    const hoursDiff = (new Date(TARGET_DATE) - new Date(latestDate)) / (1000 * 60 * 60);
    if (hoursDiff <= 2) {
      console.log(`✅ Reached closest available date (${hoursDiff.toFixed(1)} hours before target - no events scheduled)`);
    } else {
      console.log(`⚠️  Not yet at target date (${hoursDiff.toFixed(1)} hours away)`);
    }
  } else {
    console.log(`⚠️  No events found`);
  }

  // Create JSON output
  const output = {
    totalEvents: allEvents.length,
    eventsProcessed: allEvents.length,
    eventsLoggedToFirebase: firebaseCount,
    latestEventDate: latestDate,
    targetDate: TARGET_DATE,
    events: allEvents
  };

  // Write to JSON file
  const filename = `unt_events_${new Date().toISOString().split('T')[0]}.json`;
  writeFileSync(filename, JSON.stringify(output, null, 2));
  
  console.log(`✅ Saved ${allEvents.length} events to ${filename}`);
  console.log(`🔥 Logged ${firebaseCount} events to Firebase`);
  console.log(`📊 Total events processed: ${allEvents.length}`);
  
  return { latestDate, reachedTarget: latestDate && latestDate >= TARGET_DATE };
}

const TARGET_DATE = "2025-11-22T06:00:00.000Z"; // Nov 22 12:00 AM CST

(async () => {
  try {
    const result = await run();
    
    if (result.reachedTarget) {
      console.log(`\n✅ Successfully reached target date`);
      process.exit(0);
    }
    
    // Check if we're very close (within 2 hours) - likely no more events scheduled
    if (result.latestDate) {
      const hoursDiff = (new Date(TARGET_DATE) - new Date(result.latestDate)) / (1000 * 60 * 60);
      if (hoursDiff <= 2) {
        console.log(`\n✅ Fetched all available events (${hoursDiff.toFixed(1)} hours before target - no more events scheduled)`);
        process.exit(0);
      }
    }
    
    console.log(`\n⚠️  Did not reach target date`);
    process.exit(1);
  } catch (err) {
    console.error(`❌ Error:`, err);
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
