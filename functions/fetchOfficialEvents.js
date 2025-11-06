/**
 * Fetch Official Events Cloud Function
 * Fetches UNT calendar events and stores them in Firestore
 * Triggered by Cloud Scheduler weekly
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

const db = admin.firestore();

const OFFICIAL_SOURCE_ORG = "UNT Official";

/**
 * Create deterministic ID for an event based on title, start time, and location
 */
function canonicalIdForEvent(ev) {
  const base = [
    (ev.title || "").toLowerCase().trim(),
    (ev.startTimeLocal || "").toLowerCase().trim(),
    (ev.locationName || "").toLowerCase().trim(),
  ].join("|");

  return crypto.createHash("sha1").update(base).digest("hex");
}

/**
 * Format date/time for display
 */
function formatDateTime(startTime, endTime) {
  if (!startTime) return null;

  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;

  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  const startFormatted = start.toLocaleDateString("en-US", options);

  if (end) {
    const endOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    const endFormatted = end.toLocaleDateString("en-US", endOptions);
    return `${startFormatted} to ${endFormatted}`;
  }

  return startFormatted;
}

/**
 * Format date/time to ISO strings
 */
function formatDateTimeISO(startTime, endTime) {
  if (!startTime) return null;

  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;

  return {
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
  };
}

/**
 * Normalize HTML description by removing HTML tags and entities
 */
function normalizeDescription(htmlDescription) {
  if (!htmlDescription) return "";

  // Convert HTML entities to normal characters
  const htmlEntities = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&rsquo;": "'",
    "&lsquo;": "'",
    "&rdquo;": '"',
    "&ldquo;": '"',
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "...",
    "&copy;": "©",
    "&reg;": "®",
    "&trade;": "™",
    "&bull;": "•",
    "&middot;": "·",
  };

  let normalized = htmlDescription;

  // Replace named HTML entities
  for (const [entity, replacement] of Object.entries(htmlEntities)) {
    normalized = normalized.replace(new RegExp(entity, "g"), replacement);
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
  normalized = normalized.replace(/<[^>]*>/g, "");

  // Clean up whitespace - replace multiple spaces with single space
  normalized = normalized.replace(/\s+/g, " ");

  // Trim leading/trailing whitespace
  normalized = normalized.trim();

  return normalized;
}

/**
 * Fetch official events from UNT calendar API
 */
async function fetchOfficialEvents14d(page = 1, startDate = null, endDate = null) {
  const now = new Date();
  const startDateStr = startDate || now.toISOString().split("T")[0];
  const endDateStr = endDate || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];

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
      contactInfo: ev.contact_info || ev.contact || null,
    });
  }
  return {events: out, hasMore: (data.events?.length || 0) >= 500};
}

/**
 * Write raw official calendar payload to Firestore (debug/audit)
 */
async function writeOfficialRaw(calendarId, payload) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db
      .collection("events_from_official_raw")
      .doc(calendarId)
      .set(
          {
            ...payload,
            createdAt: now,
            lastSeenAt: now,
          },
          {merge: true}
      );
}

/**
 * Write normalized event to Firestore
 */
async function writeNormalizedEvent(normalized, confidenceOverride) {
  const id = canonicalIdForEvent(normalized);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db
      .collection("campus_events_live")
      .doc(id)
      .set(
          {
            ...normalized,
            confidence:
          confidenceOverride ??
          (normalized.sourceType === "instagram" ? 0.5 : 1.0),
            createdAt: now,
            lastSeenAt: now,
          },
          {merge: true}
      );
}

/**
 * Main function to fetch and process official events
 */
async function run() {
  const now = new Date();
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startDateStr = now.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  let allEvents = [];

  // Fetch events for the next 7 days
  console.log(`📅 Fetching events from ${startDateStr} to ${endDateStr}...`);
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await fetchOfficialEvents14d(page, startDateStr, endDateStr);
    const newEvents = result.events.filter((e) =>
      !allEvents.find((existing) => existing.eventId === e.eventId)
    );
    allEvents.push(...newEvents);
    hasMore = result.hasMore && result.events.length > 0;
    page++;
    console.log(`  📄 Page ${page - 1}: ${result.events.length} events, ${newEvents.length} new`);

    if (newEvents.length === 0 || (!hasMore && result.events.length < 100)) {
      break;
    }
  }

  console.log(`📊 Processing ${allEvents.length} events for next 7 days...`);

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
        officialEventUrl: ev.url,
        confidence: 1.0,
      };

      await writeNormalizedEvent(normalized, 1.0);
      firebaseCount++;
    } catch (error) {
      console.error(`❌ Failed to log event ${ev.eventId}:`, error.message);
    }
  }

  console.log(`✅ Logged ${firebaseCount} events to Firebase`);
  console.log(`📊 Total events processed: ${allEvents.length}`);

  return {
    success: true,
    totalEvents: allEvents.length,
    eventsLoggedToFirebase: firebaseCount,
  };
}

/**
 * Cloud Function: HTTP endpoint for fetching official events
 * Can be triggered by Cloud Scheduler
 */
exports.fetchOfficialEvents = functions.https.onRequest(async (req, res) => {
  try {
    console.log("🚀 Starting fetchOfficialEvents function...");
    const result = await run();

    res.status(200).json({
      success: true,
      message: "Successfully fetched and processed official events",
      ...result,
    });
  } catch (error) {
    console.error("❌ Error in fetchOfficialEvents:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

