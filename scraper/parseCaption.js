// parseCaption.js
// Turn IG caption text into structured fields (title, location, time).

import { DateTime } from "luxon";

const TZ = "America/Chicago";

// Extract "7PM", "7:30pm", "19:00"
function extractTime(text) {
  const timeRegex =
    /(\b\d{1,2}(:\d{2})?\s?(am|pm)\b|\b\d{1,2}:\d{2}\b|\b[01]?\d|2[0-3]:[0-5]\d\b)/i;
  const m = text.match(timeRegex);
  return m ? m[0] : null;
}

// Extract explicit date or relative day words
function extractDateWord(text) {
  const explicitMonthDay =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/i;
  const relWords =
    /\b(today|tonight|tomorrow|fri|friday|sat|saturday|sun|sunday|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thurs|thursday)\b/i;

  const m1 = text.match(explicitMonthDay);
  if (m1) return m1[0];

  const m2 = text.match(relWords);
  if (m2) return m2[0];

  return null;
}

// Infer ISO datetime from dateWord + timeWord + postTimestampISO
function inferDateTime(dateWord, timeWord, postTimestampISO) {
  const postTS = DateTime.fromISO(postTimestampISO, { zone: TZ });
  if (!timeWord) return null;

  let hour = null;
  let minute = 0;

  // "7PM", "7:30 pm", "7", "19:00"
  let m = timeWord.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (m) {
    hour = parseInt(m[1], 10);
    minute = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3] ? m[3].toLowerCase() : null;
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
  } else {
    m = timeWord.match(/(\d{1,2}):(\d{2})/);
    if (m) {
      hour = parseInt(m[1], 10);
      minute = parseInt(m[2], 10);
    }
  }

  if (hour === null) return null;

  let eventDate = postTS;

  if (dateWord) {
    const lower = dateWord.toLowerCase();

    if (lower === "today" || lower === "tonight") {
      eventDate = postTS;
    } else if (lower === "tomorrow") {
      eventDate = postTS.plus({ days: 1 });
    } else {
      // weekday path
      const weekdays = {
        sun: 7,
        sunday: 7,
        mon: 1,
        monday: 1,
        tue: 2,
        tues: 2,
        tuesday: 2,
        wed: 3,
        weds: 3,
        wednesday: 3,
        thu: 4,
        thurs: 4,
        thursday: 4,
        fri: 5,
        friday: 5,
        sat: 6,
        saturday: 6
      };

      if (weekdays[lower] !== undefined) {
        const target = weekdays[lower];
        let delta = target - postTS.weekday;
        if (delta < 0) delta += 7;
        if (delta === 0) {
          const passedAlready =
            hour < postTS.hour ||
            (hour === postTS.hour && minute <= postTS.minute);
          if (passedAlready) delta = 7;
        }
        eventDate = postTS.plus({ days: delta });
      } else {
        // explicit "Oct 29"
        const monthNameMatch = lower.match(
          /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/
        );
        if (monthNameMatch) {
          const months = {
            jan: 1,
            feb: 2,
            mar: 3,
            apr: 4,
            may: 5,
            jun: 6,
            jul: 7,
            aug: 8,
            sep: 9,
            sept: 9,
            oct: 10,
            nov: 11,
            dec: 12
          };
          const mname = monthNameMatch[1];
          const dayNum = parseInt(monthNameMatch[2], 10);
          const cand0 = DateTime.fromObject(
            {
              year: postTS.year,
              month: months[mname],
              day: dayNum,
              hour,
              minute
            },
            { zone: TZ }
          );
          const cand =
            cand0 < postTS ? cand0.plus({ years: 1 }) : cand0;
          return cand.toISO();
        }

        // numeric "10/29"
        const md = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
        if (md) {
          const monthNum = parseInt(md[1], 10);
          const dayNum = parseInt(md[2], 10);
          const cand0 = DateTime.fromObject(
            {
              year: postTS.year,
              month: monthNum,
              day: dayNum,
              hour,
              minute
            },
            { zone: TZ }
          );
          const cand =
            cand0 < postTS ? cand0.plus({ years: 1 }) : cand0;
          return cand.toISO();
        }
      }
    }
  }

  const eventDT = eventDate.set({
    hour,
    minute,
    second: 0,
    millisecond: 0
  });
  return eventDT.toISO();
}

function extractLocation(text) {
  // Capture "at Union rm 241" or "@ Union rm 241"
  const locRegex = /(?:@|at)\s+([A-Za-z0-9&.,'()\- ]{3,40})/i;
  const m = text.match(locRegex);
  return m ? m[1].trim() : null;
}

function guessTitle(text) {
  const keywordRegex =
    /\b(game night|party|mixer|interest meeting|info session|open mic|cookout|tailgate|movie night|kickback|bash|halloween|meet and greet|study night)\b/i;
  const m = text.match(keywordRegex);
  if (m) {
    // basic titlecase-ish
    return m[0]
      .toLowerCase()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return text.split(/\s+/).slice(0, 5).join(" ").trim();
}

// main export
export function parseCaption(rawCaption, orgHandle, postTimestampISO) {
  const timeWord = extractTime(rawCaption);
  const dateWord = extractDateWord(rawCaption);
  const startISO = inferDateTime(dateWord, timeWord, postTimestampISO);

  const locationName = extractLocation(rawCaption);
  const title = guessTitle(rawCaption);

  // confidence heuristic
  let confidence = 0;
  if (startISO) confidence += 0.5;
  if (locationName) confidence += 0.2;
  if (title) confidence += 0.2;
  if (confidence > 1) confidence = 1;

  return {
    orgHandle,
    title,
    locationName,
    startTimeLocal: startISO,
    confidence
  };
}
