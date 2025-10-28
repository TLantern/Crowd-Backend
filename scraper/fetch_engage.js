// fetch_engage.js
// Crawl UNT Engage (CampusLabs) orgs and their events
// Push normalized events into Firestore

import { chromium } from "@playwright/test";
import { DateTime } from "luxon";
import {
  writeNormalizedEvent
} from "./firestore.js";
import { rsleep } from "./utils.js";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

const BASE = "https://unt.campuslabs.com/engage";

// How far out we care. We still run cleanup after.
const MAX_ORGS = 500; // safety cap
const MAX_EVENTS_PER_ORG = 50;
const MAX_TOTAL_EVENTS = 10; // Limit total events for testing

const TZ = "America/Chicago";

// Local storage for raw events
const RAW_EVENTS_DIR = "./raw_events";
const RAW_EVENTS_FILE = join(RAW_EVENTS_DIR, "engage_events.json");

// Ensure raw events directory exists
if (!existsSync(RAW_EVENTS_DIR)) {
  mkdirSync(RAW_EVENTS_DIR, { recursive: true });
}

// Load existing raw events
let rawEvents = [];
if (existsSync(RAW_EVENTS_FILE)) {
  try {
    const data = JSON.parse(readFileSync(RAW_EVENTS_FILE, 'utf8'));
    rawEvents = Array.isArray(data) ? data : [];
  } catch (e) {
    console.log("⚠️  Could not load existing raw events, starting fresh");
    rawEvents = [];
  }
}

// Save raw events to local file
function saveRawEvent(eventId, rawPayload) {
  const timestamp = new Date().toISOString();
  const eventData = {
    eventId,
    ...rawPayload,
    scrapedAt: timestamp
  };
  
  // Check if event already exists and update it
  const existingIndex = rawEvents.findIndex(e => e.eventId === eventId);
  if (existingIndex >= 0) {
    rawEvents[existingIndex] = eventData;
  } else {
    rawEvents.push(eventData);
  }
  
  // Save to file
  writeFileSync(RAW_EVENTS_FILE, JSON.stringify(rawEvents, null, 2));
}

// --- date/time parser ---
// Improved regex-based parsing for various UNT Engage date formats
function parseEngageDateRange(humanText) {
  if (!humanText) return { startISO: null, endISO: null };

  // Clean up the text - remove extra whitespace and normalize
  const cleanText = humanText.replace(/\s+/g, ' ').trim();
  
  // Regex patterns for different date/time formats found in UNT Engage
  const patterns = [
    // Pattern 1: "Wednesday, October 29 2025 at 6:30 PM CDT to\nWednesday, October 29 2025 at 8:00 PM CDT" (multiline)
    {
      regex: /([A-Za-z]+day),\s*([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\s+at\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+[A-Z]+\s+to\s*[^\w]*([A-Za-z]+day),\s*[A-Za-z]+\s+\d{1,2}\s+\d{4}\s+at\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+[A-Z]+/i,
      groups: ['day', 'month', 'dayNum', 'year', 'startTime', 'startPeriod', 'endDay', 'endTime', 'endPeriod'],
      format: 'multiline_range'
    },
    // Pattern 2: "Wednesday, October 29 2025 at 6:30 PM CDT to Wednesday, October 29 2025 at 8:00 PM CDT" (single line)
    {
      regex: /([A-Za-z]+day),\s*([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\s+at\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+[A-Z]+\s+to\s+[A-Za-z]+day,\s*[A-Za-z]+\s+\d{1,2}\s+\d{4}\s+at\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+[A-Z]+/i,
      groups: ['day', 'month', 'dayNum', 'year', 'startTime', 'startPeriod', 'endTime', 'endPeriod'],
      format: 'full_range'
    },
    // Pattern 3: "Wednesday, October 29 2025 at 6:30 PM CDT to 8:00 PM CDT" (same day range)
    {
      regex: /([A-Za-z]+day),\s*([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\s+at\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+[A-Z]+\s+to\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+[A-Z]+/i,
      groups: ['day', 'month', 'dayNum', 'year', 'startTime', 'startPeriod', 'endTime', 'endPeriod'],
      format: 'same_day_range'
    },
    // Pattern 4: "Wednesday, October 29 2025 at 6:30 PM CDT" (single time)
    {
      regex: /([A-Za-z]+day),\s*([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\s+at\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+[A-Z]+/i,
      groups: ['day', 'month', 'dayNum', 'year', 'startTime', 'startPeriod'],
      format: 'single_time'
    },
    // Pattern 5: "October 29, 2025 at 6:30 PM to 8:00 PM" (no day of week)
    {
      regex: /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+to\s+(\d{1,2}:\d{2})\s+(AM|PM)/i,
      groups: ['month', 'dayNum', 'year', 'startTime', 'startPeriod', 'endTime', 'endPeriod'],
      format: 'no_day_range'
    },
    // Pattern 6: "October 29, 2025 at 6:30 PM" (no day of week, single time)
    {
      regex: /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}:\d{2})\s+(AM|PM)/i,
      groups: ['month', 'dayNum', 'year', 'startTime', 'startPeriod'],
      format: 'no_day_single'
    }
  ];

  // Try each pattern until we find a match
  for (const pattern of patterns) {
    const match = cleanText.match(pattern.regex);
    if (match) {
      const groups = {};
      pattern.groups.forEach((name, index) => {
        groups[name] = match[index + 1];
      });

      // Build ISO strings based on the matched pattern
      if (pattern.format === 'multiline_range') {
        const startISO = buildISOFromGroups(groups, 'start');
        const endISO = buildISOFromGroups(groups, 'end');
        return { startISO, endISO };
      } else if (pattern.format === 'full_range') {
        const startISO = buildISOFromGroups(groups, 'start');
        const endISO = buildISOFromGroups(groups, 'end');
        return { startISO, endISO };
      } else if (pattern.format === 'same_day_range') {
        const startISO = buildISOFromGroups(groups, 'start');
        const endISO = buildISOFromGroups(groups, 'end');
        return { startISO, endISO };
      } else if (pattern.format === 'single_time') {
        const startISO = buildISOFromGroups(groups, 'start');
        return { startISO, endISO: null };
      } else if (pattern.format === 'no_day_range') {
        const startISO = buildISOFromGroups(groups, 'start');
        const endISO = buildISOFromGroups(groups, 'end');
        return { startISO, endISO };
      } else if (pattern.format === 'no_day_single') {
        const startISO = buildISOFromGroups(groups, 'start');
        return { startISO, endISO: null };
      }
    }
  }

  // Fallback: try to extract any date and time separately
  const dateMatch = cleanText.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  const timeMatches = cleanText.match(/(\d{1,2}:\d{2})\s+(AM|PM)/gi);
  
  if (dateMatch && timeMatches && timeMatches.length > 0) {
    const groups = {
      month: dateMatch[1],
      dayNum: dateMatch[2],
      year: dateMatch[3],
      startTime: timeMatches[0].replace(/\s+(AM|PM)/i, ''),
      startPeriod: timeMatches[0].match(/(AM|PM)/i)[0]
    };
    
    const startISO = buildISOFromGroups(groups, 'start');
    const endISO = timeMatches.length > 1 ? buildISOFromGroups({
      ...groups,
      startTime: timeMatches[1].replace(/\s+(AM|PM)/i, ''),
      startPeriod: timeMatches[1].match(/(AM|PM)/i)[0]
    }, 'start') : null;
    
    return { startISO, endISO };
  }

  return { startISO: null, endISO: null };
}

// Helper function to build ISO string from extracted groups
function buildISOFromGroups(groups, type) {
  const timeKey = type === 'start' ? 'startTime' : 'endTime';
  const periodKey = type === 'start' ? 'startPeriod' : 'endPeriod';
  
  if (!groups.month || !groups.dayNum || !groups.year || !groups[timeKey] || !groups[periodKey]) {
    return null;
  }

  try {
    const dateStr = `${groups.month} ${groups.dayNum}, ${groups.year}`;
    const timeStr = `${groups[timeKey]} ${groups[periodKey]}`;
    
    const candidate = DateTime.fromFormat(
      `${dateStr} ${timeStr}`,
      "LLLL d, yyyy h:mm a",
      { zone: TZ }
    );

    if (candidate.isValid) {
      return candidate.toISO();
    }

    // Try without minutes
    const candidate2 = DateTime.fromFormat(
      `${dateStr} ${timeStr}`,
      "LLLL d, yyyy h a",
      { zone: TZ }
    );

    return candidate2.isValid ? candidate2.toISO() : null;
  } catch (error) {
    console.log(`Date parsing error: ${error.message}`);
    return null;
  }
}

// --- scraping helpers ---

async function getOrgCards(page) {
  // Navigate to org directory and collect org slugs + names.
  await page.goto(`${BASE}/organizations`, { waitUntil: "networkidle" });
  await rsleep(2000, 3000);

  // Scroll / paginate if necessary.
  // Engage often lazy-loads more orgs when you scroll.
  let prevCount = 0;
  let attempts = 0;
  const maxAttempts = 20; // Increased to allow more pagination attempts
  
  while (attempts < maxAttempts) {
    // First try scrolling to load more content
    await page.mouse.wheel(0, 2000);
    await rsleep(1000, 1500);
    
    // Check if pagination button exists and click it
    try {
      const paginationButton = await page.$("#react-app > div > div > div > div.MuiGrid-root.MuiGrid-container.MuiGrid-spacing-xs-3 > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-12.MuiGrid-grid-sm-12.MuiGrid-grid-md-9.MuiGrid-grid-lg-9 > div > div:nth-child(2) > div.outlinedButton > button > div > div > span");
      if (paginationButton) {
        console.log("🔄 Clicking pagination button to load more organizations...");
        await paginationButton.click();
        await rsleep(2000, 3000);
      }
    } catch (e) {
      // Button not found or not clickable, continue with scrolling
    }
    
    // Count current organizations
    const cardsNow = await page.$$eval(
      "a[href*='/engage/organization/']",
      (as) => as.map((a) => a.getAttribute("href"))
    );
    
    console.log(`📊 Found ${cardsNow.length} organizations so far...`);
    
    // If no new organizations loaded, break
    if (cardsNow.length === prevCount) {
      console.log("📋 No more organizations to load");
      break;
    }
    
    prevCount = cardsNow.length;
    attempts++;
  }

  // Extract org URLs and names.
  // We'll grab all anchors to /engage/organization/<slug>
  const orgs = await page.$$eval(
    "a[href*='/engage/organization/']",
    (as) => {
      const out = [];
      for (const a of as) {
        const href = a.getAttribute("href") || "";
        // href like "/engage/organization/progressive-black-student-organization"
        const parts = href.split("/").filter(Boolean);
        const slug = parts[parts.length - 1];
        const name = a.innerText?.trim() || slug;
        // Filter out false positives like nested links
        if (href.includes("/engage/organization/") && slug && slug !== "organizations") {
          out.push({ slug, name, href });
        }
      }
      return out;
    }
  );

  // Dedupe slugs
  const deduped = [];
  const seen = new Set();
  for (const o of orgs) {
    if (!seen.has(o.slug)) {
      seen.add(o.slug);
      deduped.push(o);
    }
  }

  return deduped.slice(0, MAX_ORGS);
}

async function getOrgEventLinks(page, slug) {
  // Go to org's events tab
  const url = `${BASE}/organization/${slug}/events`;
  await page.goto(url, { waitUntil: "networkidle" });
  await rsleep(1500, 2500);

  // Scroll a bit to load all events
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 1500);
    await rsleep(500, 800);
  }

  // Grab event links
  // Typical selector: anchors with /engage/event/<id>
  const eventLinks = await page.$$eval(
    "a[href*='/engage/event/']",
    (as) => {
      const urls = [];
      for (const a of as) {
        const href = a.getAttribute("href") || "";
        if (href.includes("/engage/event/")) {
          urls.push(href);
        }
      }
      return Array.from(new Set(urls));
    }
  );

  return eventLinks.slice(0, MAX_EVENTS_PER_ORG);
}

async function scrapeEventDetail(page, eventHref, fallbackOrgName) {
  // eventHref might be relative like "/engage/event/11432990"
  const fullUrl = eventHref.startsWith("http")
    ? eventHref
    : `https://unt.campuslabs.com${eventHref}`;

  await page.goto(fullUrl, { waitUntil: "networkidle" });
  await rsleep(1500, 2500);

  // Extract fields. You will likely adjust selectors after inspecting real DOM.
  // title: often h1 or [data-testid='event-name'] etc
  const title = await page.$eval("h1, h2", (el) => el.innerText.trim());

  // org/host: often somewhere near "Hosted by ..."
  let orgName = fallbackOrgName;
  try {
    const hostText = await page.$$eval(
      "a[href*='/engage/organization/'], div",
      (nodes) =>
        nodes
          .map((n) => n.innerText.trim())
          .filter((t) => /hosted by/i.test(t) || /presented by/i.test(t))[0]
    );
    if (hostText) {
      // e.g. "Hosted by Medically Dedicated Students Organization"
      const m = hostText.match(/Hosted by\s+(.*)/i);
      if (m && m[1]) {
        orgName = m[1].trim();
      }
    }
  } catch {
    // keep fallback
  }

  // Extract description first to get date/time and location from it
  let description = "";
  try {
    const descriptionSelectors = [
      "[data-testid='event-description']",
      ".event-description",
      ".description",
      "[class*='description']",
      ".event-details",
      ".details"
    ];

    for (const selector of descriptionSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.innerText();
          if (text && text.length > 10) {
            description = text.trim();
            break;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: look for longer text blocks that might be descriptions
    if (!description) {
      description = await page.$$eval("div, p", (nodes) => {
        for (const n of nodes) {
          const txt = n.innerText.trim();
          if (
            txt.length > 50 &&
            txt.length < 2000 &&
            !/hosted by|presented by/i.test(txt) // Not organization info
          ) {
            return txt;
          }
        }
        return "";
      });
    }
  } catch (e) {
    console.log(`  ⚠️  Could not extract description: ${e.message}`);
  }

  // Extract date/time from description using regex
  let dtRaw = "";
  if (description) {
    // Look for date/time patterns in the description - get more complete text
    const dateTimeMatch = description.match(/Date and Time\s*([^]*?)(?:\n\s*Location|Description|$)/i);
    if (dateTimeMatch) {
      dtRaw = dateTimeMatch[1].trim();
    } else {
      // Fallback: look for any date/time pattern in description with more context
      const timePattern = /[A-Za-z]+day, [A-Za-z]+ \d{1,2} \d{4} at \d{1,2}:\d{2} (AM|PM)[^]*?(?:\n\s*[A-Z]|Location|Description|$)/i;
      const match = description.match(timePattern);
      if (match) {
        dtRaw = match[0].trim();
      }
    }
    
    // Clean up raw date/time - remove "Add To Google Calendar | iCal/Outlook" and similar text
    dtRaw = dtRaw.replace(/\s*Add To Google Calendar\s*\|\s*iCal\/Outlook.*$/i, '').trim();
  }

  const { startISO, endISO } = parseEngageDateRange(dtRaw);

  // Extract location using UNT building list
  let locationName = "";
  const untBuildings = [
    "University Union",
    "Willis Library", 
    "Business Leadership Building",
    "Sage Hall",
    "DATCU Stadium",
    "Discovery Park",
    "The Syndicate",
    "Kerr Hall",
    "Joe Greene Hall",
    "Denton Square",
    "Clark Hall",
    "Pohl Recreation Center",
    "UNT Music Building",
    "Art Building",
    "UNT Coliseum"
  ];

  try {
    // First try to get location from specific selectors
    const locationSelectors = [
      "[data-testid='event-location']",
      ".event-location",
      ".location",
      "[class*='location']"
    ];

    let locationText = "";
    for (const selector of locationSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.innerText();
          if (text && text.length > 0 && text.length < 200) {
            locationText = text.trim();
            break;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // If no specific location element found, search in description
    if (!locationText && description) {
      const locationMatch = description.match(/Location\s*([^]*?)(?:\n|Description|$)/i);
      if (locationMatch) {
        locationText = locationMatch[1].trim();
      }
    }

    // Fallback: search all text for location patterns
    if (!locationText) {
      locationText = await page.$$eval("div, p, span", (nodes) => {
        for (const n of nodes) {
          const txt = n.innerText.trim();
          if (
            txt.length > 0 &&
            txt.length < 200 &&
            /building|hall|center|room|rm|ballroom|union|lab|suite|library/i.test(txt)
          ) {
            return txt;
          }
        }
        return "";
      });
    }

    // Match against UNT building list
    if (locationText) {
      for (const building of untBuildings) {
        if (locationText.toLowerCase().includes(building.toLowerCase())) {
          locationName = building;
          break;
        }
      }
      
      // If no exact match, try partial matches
      if (!locationName) {
        for (const building of untBuildings) {
          const buildingWords = building.toLowerCase().split(' ');
          const textWords = locationText.toLowerCase().split(/\s+/);
          
          // Check if most words from building name are in the text
          const matches = buildingWords.filter(word => 
            textWords.some(textWord => textWord.includes(word) || word.includes(textWord))
          );
          
          if (matches.length >= Math.ceil(buildingWords.length * 0.6)) {
            locationName = building;
            break;
          }
        }
      }
    }
  } catch (e) {
    console.log(`  ⚠️  Could not extract location: ${e.message}`);
  }

  // Build normalized event object
  const normalized = {
    title,
    locationName: locationName || null,
    startTimeLocal: startISO,
    endTimeLocal: endISO,
    sourceType: "engage",
    sourceOrg: orgName || fallbackOrgName || "UNT Org",
    sourceUrl: fullUrl
  };

  // Build raw payload for audit
  // eventId from URL last segment
  const parts = fullUrl.split("/").filter(Boolean);
  const eventId = parts[parts.length - 1];

  const rawPayload = {
    eventId,
    title,
    orgName: normalized.sourceOrg,
    dtRaw,
    startISO,
    endISO,
    locationName: normalized.locationName,
    url: fullUrl
  };

  return { eventId, normalized, rawPayload };
}

async function run() {
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
  });

  const page = await context.newPage();

  // 1. get org list
  const orgs = await getOrgCards(page);

  // 2. for each org get events
  let totalEvents = 0;

  for (const { slug, name } of orgs) {
    if (totalEvents >= MAX_TOTAL_EVENTS) {
      console.log(`\n🛑 Reached maximum of ${MAX_TOTAL_EVENTS} events. Stopping.`);
      break;
    }

    console.log(`\n🏢 Processing org: ${name} (${slug})`);
    const eventLinks = await getOrgEventLinks(page, slug);
    console.log(`📅 Found ${eventLinks.length} events`);

    for (const link of eventLinks) {
      if (totalEvents >= MAX_TOTAL_EVENTS) {
        console.log(`\n🛑 Reached maximum of ${MAX_TOTAL_EVENTS} events. Stopping.`);
        break;
      }

      try {
        const { eventId, normalized, rawPayload } = await scrapeEventDetail(
          page,
          link,
          name
        );

        // save raw event locally
        saveRawEvent(eventId, rawPayload);

        // write normalized to campus_events_live
        await writeNormalizedEvent(normalized, 1.0);

        totalEvents += 1;
        console.log(`  ✅ Scraped: ${normalized.title} (${totalEvents}/${MAX_TOTAL_EVENTS})`);
        if (rawPayload.dtRaw) {
          console.log(`     📅 Raw Date/Time: ${rawPayload.dtRaw.substring(0, 100)}...`);
        }
        if (normalized.locationName) {
          console.log(`     📍 Location: ${normalized.locationName}`);
        }

        // polite delay so we don't hammer Engage
        await rsleep(800, 1500);
      } catch (error) {
        console.log(`  ❌ Error scraping event: ${error.message}`);
      }
    }

    // light delay between orgs
    await rsleep(1000, 2000);
  }

  await browser.close();

  console.log(
    JSON.stringify(
      {
        orgsScanned: orgs.length,
        totalEventsPushed: totalEvents,
        rawEventsSavedLocally: rawEvents.length,
        localFile: RAW_EVENTS_FILE
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
