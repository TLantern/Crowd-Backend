// utils.js
// Shared helpers for ID hashing, sleep, and time parsing.

import crypto from "crypto";
import { DateTime } from "luxon";

const TZ = "America/Chicago";

// Create deterministic ID for a "real world event" so duplicates collapse.
// Inputs that define same event: title + startTimeLocal + locationName.
export function canonicalIdForEvent(ev) {
  const base = [
    (ev.title || "").toLowerCase().trim(),
    (ev.startTimeLocal || "").toLowerCase().trim(),
    (ev.locationName || "").toLowerCase().trim()
  ].join("|");

  return crypto.createHash("sha1").update(base).digest("hex");
}

// Random human-like delay
export function rsleep(minMs, maxMs) {
  const ms =
    Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}

// Check if an event should remain live:
// - keep if start is within next 14 days
// - keep if started less than 12 hours ago
// - else drop
export function shouldKeepEvent(startISO) {
  if (!startISO) return false;
  const now = DateTime.now().setZone(TZ);

  const startDT = DateTime.fromISO(startISO);
  if (!startDT.isValid) return false;

  const hoursSinceStart = now.diff(startDT, "hours").hours;
  const hoursUntilStart = startDT.diff(now, "hours").hours;

  // drop if >12h since start
  if (hoursSinceStart > 12) return false;

  // drop if >14 days ahead
  if (hoursUntilStart > 14 * 24) return false;

  return true;
}
