// scrape_linktree.js
// Scrape Linktree page and extract links from buttons that have dates in their titles

import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";
import { rsleep, canonicalIdForEvent, shouldKeepEvent } from "./utils.js";
import { writeNormalizedEvent, writeLinktreeRaw, db } from "./firestore.js";
import { DateTime } from "luxon";

const TZ = "America/Chicago";

// Date detection patterns - looking for month names, day numbers, and years
const DATE_PATTERNS = [
  // "Nov 12, 2025" or "Nov 12th, 2025" or "November 12, 2025"
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/i,
  // "Nov 12" or "November 12"
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  // "Wed, Nov 12" or "Wednesday, Nov 12"
  /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?/i,
  // "11/12/2025" or "11/12/25"
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
  // "2025-11-12"
  /\b\d{4}-\d{1,2}-\d{1,2}\b/
];

function hasDate(text) {
  if (!text) return false;
  return DATE_PATTERNS.some(pattern => pattern.test(text));
}

// Parse posh.vip date/time strings to ISO format
// Handles formats like "Sat, Nov 15 at 9:00 PM - 2:00 AM (CST)"
function parsePoshDateTime(dateTimeStr) {
  if (!dateTimeStr) return { startISO: null, endISO: null };

  const cleanText = dateTimeStr.replace(/\s+/g, ' ').trim();
  
  // Pattern: "Sat, Nov 15 at 9:00 PM - 2:00 AM (CST)"
  const rangePattern = /([A-Za-z]{3}),?\s+([A-Za-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)?\s+at\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s+(AM|PM)/i;
  const rangeMatch = cleanText.match(rangePattern);
  
  if (rangeMatch) {
    const [, , month, day, startHour, startMin, startPeriod, endHour, endMin, endPeriod] = rangeMatch;
    
    // Get current year, assume same year unless date has passed
    const now = DateTime.now().setZone(TZ);
    const currentYear = now.year;
    
    const months = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
    };
    
    const monthNum = months[month.toLowerCase().substring(0, 3)];
    if (!monthNum) return { startISO: null, endISO: null };
    
    let startH = parseInt(startHour, 10);
    const startM = parseInt(startMin, 10);
    if (startPeriod.toLowerCase() === 'pm' && startH < 12) startH += 12;
    if (startPeriod.toLowerCase() === 'am' && startH === 12) startH = 0;
    
    let endH = parseInt(endHour, 10);
    const endM = parseInt(endMin, 10);
    if (endPeriod.toLowerCase() === 'pm' && endH < 12) endH += 12;
    if (endPeriod.toLowerCase() === 'am' && endH === 12) endH = 0;
    
    // If end time is before start time, it's next day
    let endDay = parseInt(day, 10);
    if (endH < startH || (endH === startH && endM < startM)) {
      endDay += 1;
    }
    
    try {
      let startDT = DateTime.fromObject({
        year: currentYear,
        month: monthNum,
        day: parseInt(day, 10),
        hour: startH,
        minute: startM
      }, { zone: TZ });
      
      // If date has passed this year, try next year
      if (startDT < now) {
        startDT = startDT.plus({ years: 1 });
      }
      
      let endDT = DateTime.fromObject({
        year: startDT.year,
        month: monthNum,
        day: endDay,
        hour: endH,
        minute: endM
      }, { zone: TZ });
      
      // Adjust end date if it's before start
      if (endDT < startDT) {
        endDT = endDT.plus({ days: 1 });
      }
      
      return {
        startISO: startDT.isValid ? startDT.toISO() : null,
        endISO: endDT.isValid ? endDT.toISO() : null
      };
    } catch (error) {
      console.log(`Date parsing error: ${error.message}`);
      return { startISO: null, endISO: null };
    }
  }
  
  // Try simpler pattern: "Sat, Nov 15 at 9:00 PM"
  const singlePattern = /([A-Za-z]{3}),?\s+([A-Za-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)?\s+at\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i;
  const singleMatch = cleanText.match(singlePattern);
  
  if (singleMatch) {
    const [, , month, day, hour, min, period] = singleMatch;
    const now = DateTime.now().setZone(TZ);
    const currentYear = now.year;
    
    const months = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
    };
    
    const monthNum = months[month.toLowerCase().substring(0, 3)];
    if (!monthNum) return { startISO: null, endISO: null };
    
    let h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    if (period.toLowerCase() === 'pm' && h < 12) h += 12;
    if (period.toLowerCase() === 'am' && h === 12) h = 0;
    
    try {
      let startDT = DateTime.fromObject({
        year: currentYear,
        month: monthNum,
        day: parseInt(day, 10),
        hour: h,
        minute: m
      }, { zone: TZ });
      
      if (startDT < now) {
        startDT = startDT.plus({ years: 1 });
      }
      
      return {
        startISO: startDT.isValid ? startDT.toISO() : null,
        endISO: null
      };
    } catch (error) {
      return { startISO: null, endISO: null };
    }
  }
  
  return { startISO: null, endISO: null };
}

// Check if event already exists in Firestore
async function eventExists(normalized) {
  const id = canonicalIdForEvent(normalized);
  const doc = await db.collection("campus_events_live").doc(id).get();
  return doc.exists;
}

async function scrapePoshEvent(page, url) {
  console.log(`\n📋 Scraping event page: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await rsleep(2000, 3000);

    const eventData = await page.evaluate(() => {
      // Date patterns for checking if a line contains a date
      const datePatterns = [
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/i,
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
        /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?/i,
        /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
        /\b\d{4}-\d{1,2}-\d{1,2}\b/
      ];
      
      const hasDate = (text) => {
        if (!text) return false;
        return datePatterns.some(pattern => pattern.test(text));
      };

      const data = {
        title: null,
        venue: null,
        dateTime: null,
        description: null,
        address: null,
        imageUrl: null,
        additionalInfo: [],
        images: [],
        primaryImage: null
      };

      // Try to find title - usually in h1 or large heading
      const titleSelectors = [
        'h1',
        '[class*="title"]',
        '[class*="event-title"]',
        '[data-testid*="title"]'
      ];
      
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent?.trim()) {
          data.title = el.textContent.trim();
          break;
        }
      }

      // Try to find venue - often near title or in specific sections
      const venueSelectors = [
        '[class*="venue"]',
        '[class*="location"]',
        '[data-testid*="venue"]',
        'h2',
        'h3'
      ];
      
      for (const selector of venueSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent?.trim();
          if (text && text.length < 100 && !text.includes('@') && !text.includes('http')) {
            // Skip if it looks like a title or URL
            if (text !== data.title && !text.match(/^\d/)) {
              data.venue = text;
              break;
            }
          }
        }
        if (data.venue) break;
      }

      // Get all text content to parse - try to preserve structure
      const bodyText = document.body.textContent || '';
      const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Look for date/time pattern (e.g., "Sat, Nov 15 at 9:00 PM - 2:00 AM (CST)")
      const dateTimePatterns = [
        /([A-Za-z]{3},?\s+[A-Za-z]{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+at\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s+(?:AM|PM)\s*\([A-Z]{3,4}\))/i,
        /([A-Za-z]{3},?\s+[A-Za-z]{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+at\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s+(?:AM|PM))/i,
        /([A-Za-z]{3},?\s+[A-Za-z]{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s+(?:AM|PM))/i,
        // Also try patterns like "9 pm - 2 am"
        /(\d{1,2}\s*(?:am|pm)\s*-\s*\d{1,2}\s*(?:am|pm))/i
      ];

      for (const line of lines) {
        for (const pattern of dateTimePatterns) {
          const match = line.match(pattern);
          if (match) {
            data.dateTime = match[1].trim();
            break;
          }
        }
        if (data.dateTime) break;
      }
      
      // If still no dateTime found, look for simpler patterns
      if (!data.dateTime) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Look for "Sat, Nov 15" or "Saturday, November 15th"
          const dateMatch = line.match(/([A-Za-z]+day,?\s+[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?)/i);
          if (dateMatch) {
          // Then look for time on same or next line
          let timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          if (!timeMatch && i + 1 < lines.length) {
            timeMatch = lines[i + 1].match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          }
          if (timeMatch) {
            data.dateTime = `${dateMatch[1]} at ${timeMatch[0]}`;
            break;
          }
          }
        }
      }

      // Look for address pattern (e.g., "3516 E Lancaster Ave, Fort Worth, TX 76103")
      const addressPattern = /\d+\s+[A-Za-z0-9\s,.-]+(?:,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5})/;
      for (const line of lines) {
        const match = line.match(addressPattern);
        if (match) {
          data.address = match[0].trim();
          break;
        }
      }

      // Look for description - usually in paragraphs or divs
      const descriptionSelectors = [
        '[class*="description"]',
        '[class*="about"]',
        '[class*="details"]',
        'p',
        '[class*="content"]',
        'div[class*="text"]'
      ];

      const descriptionParts = [];
      const seenTexts = new Set();
      
      for (const selector of descriptionSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent?.trim();
          if (text && text.length > 10 && text.length < 1000) {
            // Skip if it's the title, venue, date/time, address, or already seen
            if (text !== data.title && 
                text !== data.venue && 
                text !== data.dateTime &&
                !text.includes(data.address || '') &&
                !seenTexts.has(text) &&
                !text.match(/^(get|buy|purchase).*ticket/i) &&
                !text.match(/^https?:\/\//)) {
              descriptionParts.push(text);
              seenTexts.add(text);
            }
          }
        }
      }
      
      // Also collect meaningful lines that might be description
      for (const line of lines) {
        if (line.length > 15 && line.length < 200 &&
            !seenTexts.has(line) &&
            line !== data.title &&
            line !== data.venue &&
            line !== data.dateTime &&
            !line.includes(data.address || '') &&
            !line.match(/^(get|buy|purchase).*ticket/i) &&
            !line.match(/^https?:\/\//) &&
            !hasDate(line) &&
            !line.match(/^\d+\s+[A-Z]/)) { // Skip addresses
          descriptionParts.push(line);
          seenTexts.add(line);
        }
      }
      
      data.description = descriptionParts.join('\n\n').substring(0, 2000);

      // Extract image URL - posh.vip specific
      // 1. Look for posh.vip event hero images - prefer cdn-cgi/image URLs
      const poshImages = Array.from(document.querySelectorAll('img[src*="posh.vip"], img[srcset*="posh"], img[src*="posh-images"]'));
      for (const img of poshImages) {
        // First check src attribute - it usually has the full URL
        let src = img.src || img.getAttribute('src');
        if (src && src.includes('cdn-cgi/image')) {
          // Ensure full URL
          if (src.startsWith('//')) {
            src = 'https:' + src;
          }
          data.imageUrl = src;
          break;
        }
        
        // Check srcset for cdn-cgi/image URL
        const srcset = img.getAttribute('srcset');
        if (srcset) {
          const srcsetEntries = srcset.split(',').map(s => s.trim());
          // Look for cdn-cgi/image URL (preferred)
          for (const entry of srcsetEntries) {
            // Extract URL - everything before the descriptor (space + number/width)
            // Format: "url 640w" or "url 2x"
            const parts = entry.split(/\s+/);
            let url = parts[0];
            
            // If URL doesn't start with http, it might be relative or have a prefix
            if (!url.startsWith('http')) {
              // Check if there's an https:// later in the entry
              const httpsMatch = entry.match(/https?:\/\/[^\s]+/);
              if (httpsMatch) {
                url = httpsMatch[0];
              } else {
                // Try to construct full URL
                if (url.startsWith('//')) {
                  url = 'https:' + url;
                } else if (url.includes('posh.vip')) {
                  url = 'https://' + url.replace(/^[^\/]*\//, '');
                }
              }
            }
            
            // Prefer cdn-cgi/image URLs - ensure we have the full URL
            if (url && url.includes('cdn-cgi/image') && url.startsWith('http')) {
              data.imageUrl = url;
              break;
            }
          }
        }
        
        // Fallback: use src if it's a posh.vip URL
        if (!data.imageUrl && src) {
          if (src.startsWith('//')) {
            src = 'https:' + src;
          } else if (!src.startsWith('http') && src.includes('posh.vip')) {
            src = 'https://' + src.replace(/^[^\/]*\//, '');
          }
          if (src && src.includes('posh.vip')) {
            data.imageUrl = src;
            break;
          }
        }
        
        if (data.imageUrl) break;
      }
      
      // 3. Open Graph image (fallback)
      if (!data.imageUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) {
          data.imageUrl = ogImage.getAttribute('content');
        }
      }
      
      // 4. Twitter card image (fallback)
      if (!data.imageUrl) {
        const twitterImage = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]');
        if (twitterImage) {
          data.imageUrl = twitterImage.getAttribute('content');
        }
      }
      
      // 5. Look for other large images as last resort
      if (!data.imageUrl) {
        const images = Array.from(document.querySelectorAll('img[src]'));
        for (const img of images) {
          const src = img.src || img.getAttribute('src');
          if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('avatar')) {
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            if (width > 200 && height > 200) {
              data.imageUrl = src;
              break;
            }
          }
        }
      }
      
      // Set primaryImage from imageUrl for compatibility
      if (data.imageUrl) {
        data.primaryImage = data.imageUrl;
        data.images = [data.imageUrl];
      }

      // Collect additional info lines
      const infoKeywords = [
        'presale', 'presales', 'security', 'enforced', 'early arrival',
        'tickets', 'get tickets', 'buy tickets', 'available now'
      ];
      
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (infoKeywords.some(keyword => lowerLine.includes(keyword))) {
          if (!data.additionalInfo.includes(line) && line.length < 200) {
            data.additionalInfo.push(line);
          }
        }
      }

      // ====== IMAGE EXTRACTION ======
      const imageData = [];
      const seenImageUrls = new Set();

      // Helper to parse Cloudflare CDN URLs
      const parseImageUrl = (url) => {
        if (!url) return null;
        
        // Cloudflare CDN format: https://posh.vip/cdn-cgi/image/width=X,height=Y,.../https://original-url
        const cfMatch = url.match(/cdn-cgi\/image\/[^\/]*\/(https?:\/\/.+)/);
        if (cfMatch) {
          const originalUrl = cfMatch[1];
          const widthMatch = url.match(/width=(\d+)/);
          const heightMatch = url.match(/height=(\d+)/);
          
          return {
            url: url,
            originalUrl: originalUrl,
            width: widthMatch ? parseInt(widthMatch[1]) : null,
            height: heightMatch ? parseInt(heightMatch[1]) : null
          };
        }
        
        return { url: url, originalUrl: url, width: null, height: null };
      };

      // 1. Extract from Open Graph meta tags
      const ogImages = document.querySelectorAll('meta[property="og:image"]');
      for (const meta of ogImages) {
        const content = meta.getAttribute('content');
        if (content && !seenImageUrls.has(content)) {
          const parsed = parseImageUrl(content);
          if (parsed) {
            imageData.push({
              url: parsed.url,
              originalUrl: parsed.originalUrl,
              source: 'og:image',
              width: parsed.width,
              height: parsed.height
            });
            seenImageUrls.add(content);
            seenImageUrls.add(parsed.originalUrl);
          }
        }
      }

      // 2. Extract from JSON-LD structured data (schema.org)
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const json = JSON.parse(script.textContent);
          
          // Handle single object or array
          const items = Array.isArray(json) ? json : [json];
          
          for (const item of items) {
            if (item['@type'] === 'Event' && item.image) {
              // Image can be a string, array, or object
              const images = Array.isArray(item.image) ? item.image : [item.image];
              
              for (const img of images) {
                const imgUrl = typeof img === 'string' ? img : img.url || img['@id'];
                if (imgUrl && !seenImageUrls.has(imgUrl)) {
                  const parsed = parseImageUrl(imgUrl);
                  if (parsed) {
                    imageData.push({
                      url: parsed.url,
                      originalUrl: parsed.originalUrl,
                      source: 'schema.org',
                      width: parsed.width || img.width,
                      height: parsed.height || img.height
                    });
                    seenImageUrls.add(imgUrl);
                    seenImageUrls.add(parsed.originalUrl);
                  }
                }
              }
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }

      // 3. Extract from img tags (event posters/banners)
      const imgTags = document.querySelectorAll('img[src]');
      for (const img of imgTags) {
        const src = img.src || img.getAttribute('src');
        // Filter for relevant images (usually larger event images)
        if (src && 
            !src.includes('logo') && 
            !src.includes('icon') && 
            !src.includes('avatar') &&
            !seenImageUrls.has(src)) {
          
          const parsed = parseImageUrl(src);
          if (parsed) {
            imageData.push({
              url: parsed.url,
              originalUrl: parsed.originalUrl,
              source: 'img',
              width: parsed.width || img.naturalWidth || null,
              height: parsed.height || img.naturalHeight || null
            });
            seenImageUrls.add(src);
            seenImageUrls.add(parsed.originalUrl);
          }
        }
      }

      // Deduplicate by originalUrl (same image at different sizes)
      const imagesByOriginal = new Map();
      for (const img of imageData) {
        const key = img.originalUrl;
        if (!imagesByOriginal.has(key)) {
          imagesByOriginal.set(key, []);
        }
        imagesByOriginal.get(key).push(img);
      }

      // For each unique image, keep the highest quality version
      const deduplicatedImages = [];
      for (const [originalUrl, versions] of imagesByOriginal.entries()) {
        // Sort by dimensions (prefer larger images)
        versions.sort((a, b) => {
          const aSize = (a.width || 0) * (a.height || 0);
          const bSize = (b.width || 0) * (b.height || 0);
          return bSize - aSize; // Descending order
        });
        
        // Keep the largest version
        const best = versions[0];
        deduplicatedImages.push({
          url: best.url,
          originalUrl: best.originalUrl,
          source: best.source,
          width: best.width,
          height: best.height
        });
      }

      // Sort by priority: schema.org > og:image > img
      const sourcePriority = { 'schema.org': 3, 'og:image': 2, 'img': 1 };
      deduplicatedImages.sort((a, b) => {
        const aPriority = sourcePriority[a.source] || 0;
        const bPriority = sourcePriority[b.source] || 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        
        // If same priority, prefer larger images
        const aSize = (a.width || 0) * (a.height || 0);
        const bSize = (b.width || 0) * (b.height || 0);
        return bSize - aSize;
      });

      data.images = deduplicatedImages;
      data.primaryImage = deduplicatedImages.length > 0 ? deduplicatedImages[0].url : null;
      // Set imageUrl from primaryImage for backward compatibility
      data.imageUrl = data.primaryImage;

      return data;
    });

    // Fallback: try to extract from structured text if selectors didn't work
    if (!eventData.title || !eventData.venue) {
      const fullText = await page.evaluate(() => document.body.textContent || '');
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // Title is usually the first significant line
      if (!eventData.title && lines.length > 0) {
        for (const line of lines.slice(0, 10)) {
          if (line.length > 5 && line.length < 100 && !line.match(/^https?:\/\//)) {
            eventData.title = line;
            break;
          }
        }
      }

      // Venue might be near the title
      if (!eventData.venue) {
        const titleIndex = lines.findIndex(l => l === eventData.title);
        if (titleIndex >= 0) {
          for (let i = titleIndex + 1; i < Math.min(titleIndex + 5, lines.length); i++) {
            const line = lines[i];
            if (line.length > 3 && line.length < 80 && 
                !line.match(/^\d/) && 
                !line.includes('@') &&
                !line.includes('http') &&
                !hasDate(line)) {
              eventData.venue = line;
              break;
            }
          }
        }
      }
    }

    console.log(`  ✓ Title: ${eventData.title || 'Not found'}`);
    console.log(`  ✓ Venue: ${eventData.venue || 'Not found'}`);
    console.log(`  ✓ Date/Time: ${eventData.dateTime || 'Not found'}`);
    console.log(`  ✓ Image: ${eventData.imageUrl || 'Not found'}`);
    console.log(`  ✓ Images: ${eventData.images.length} found`);
    if (eventData.primaryImage) {
      console.log(`  ✓ Primary Image: ${eventData.primaryImage.substring(0, 80)}...`);
    }
    
    return eventData;

  } catch (error) {
    console.error(`  ✗ Error scraping ${url}:`, error.message);
    return {
      title: null,
      venue: null,
      dateTime: null,
      description: null,
      address: null,
      imageUrl: null,
      additionalInfo: [],
      images: [],
      primaryImage: null,
      error: error.message
    };
  }
}

async function scrapeEventbrite(page, url) {
  console.log(`\n📋 Scraping Eventbrite page: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await rsleep(2000, 3000);

    const eventData = await page.evaluate(() => {
      const data = {
        title: null,
        venue: null,
        dateTime: null,
        description: null,
        address: null,
        imageUrl: null,
        additionalInfo: []
      };

      // Get title - usually in h1
      const titleEl = document.querySelector('h1');
      if (titleEl) {
        data.title = titleEl.textContent?.trim();
      }

      // Get venue - look for location info
      const venueSelectors = [
        '[data-testid="venue-name"]',
        '[class*="venue"]',
        '[class*="location"]',
        'address'
      ];
      
      for (const selector of venueSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim();
          if (text && text.length < 200) {
            data.venue = text;
            break;
          }
        }
      }

      // Get date/time - Eventbrite usually has structured date/time
      const dateTimeSelectors = [
        '[data-testid="event-date"]',
        '[class*="date"]',
        '[class*="time"]',
        'time[datetime]'
      ];
      
      for (const selector of dateTimeSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim();
          const datetime = el.getAttribute('datetime');
          if (datetime) {
            data.dateTime = datetime;
            break;
          } else if (text && text.length < 200) {
            data.dateTime = text;
            break;
          }
        }
      }

      // Get description
      const descSelectors = [
        '[data-testid="event-description"]',
        '[class*="description"]',
        '[class*="overview"]'
      ];
      
      for (const selector of descSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim();
          if (text && text.length > 10) {
            data.description = text.substring(0, 2000);
            break;
          }
        }
      }

      // Get address
      const addressEl = document.querySelector('address, [class*="address"]');
      if (addressEl) {
        data.address = addressEl.textContent?.trim();
      }

      // Extract image URL - Eventbrite specific
      // 1. Look for hero image with data-testid="hero-img"
      const heroImg = document.querySelector('img[data-testid="hero-img"]');
      if (heroImg) {
        const src = heroImg.src || heroImg.getAttribute('src');
        if (src && src.includes('evbuc.com')) {
          data.imageUrl = src;
        }
      }
      
      // 2. Look for event image container with data-testid="event-image"
      if (!data.imageUrl) {
        const eventImageContainer = document.querySelector('[data-testid="event-image"]');
        if (eventImageContainer) {
          const img = eventImageContainer.querySelector('img');
          if (img) {
            const src = img.src || img.getAttribute('src');
            if (src && src.includes('evbuc.com')) {
              data.imageUrl = src;
            }
          }
        }
      }
      
      // 3. Look for any img with evbuc.com URL (Eventbrite CDN)
      if (!data.imageUrl) {
        const images = Array.from(document.querySelectorAll('img[src*="evbuc.com"]'));
        for (const img of images) {
          const src = img.src || img.getAttribute('src');
          if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('avatar')) {
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            if (width > 200 && height > 200) {
              data.imageUrl = src;
              break;
            }
          }
        }
      }
      
      // 4. Open Graph image (fallback)
      if (!data.imageUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) {
          data.imageUrl = ogImage.getAttribute('content');
        }
      }
      
      // 5. Twitter card image (fallback)
      if (!data.imageUrl) {
        const twitterImage = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]');
        if (twitterImage) {
          data.imageUrl = twitterImage.getAttribute('content');
        }
      }
      
      // 6. Look for other large images as last resort
      if (!data.imageUrl) {
        const images = Array.from(document.querySelectorAll('img[src]'));
        for (const img of images) {
          const src = img.src || img.getAttribute('src');
          if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('avatar')) {
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            if (width > 200 && height > 200) {
              data.imageUrl = src;
              break;
            }
          }
        }
      }

      return data;
    });

    console.log(`  ✓ Title: ${eventData.title || 'Not found'}`);
    console.log(`  ✓ Venue: ${eventData.venue || 'Not found'}`);
    console.log(`  ✓ Date/Time: ${eventData.dateTime || 'Not found'}`);
    console.log(`  ✓ Image: ${eventData.imageUrl || 'Not found'}`);
    
    return eventData;

  } catch (error) {
    console.error(`  ✗ Error scraping Eventbrite ${url}:`, error.message);
    return {
      title: null,
      venue: null,
      dateTime: null,
      description: null,
      address: null,
      imageUrl: null,
      additionalInfo: [],
      error: error.message
    };
  }
}

async function scrapePoshGroup(page, url) {
  console.log(`\n📋 Scraping posh.vip group page: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await rsleep(2000, 3000);

    // Extract all event links from the group page AND check titles/headings
    const eventLinks = await page.evaluate(() => {
      const links = [];
      const seenUrls = new Set();

      // Get page title and headings for date checking
      const pageTitle = document.title || '';
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => h.textContent?.trim() || '');

      // Find all links that might be event pages
      const allLinks = document.querySelectorAll('a[href]');
      
      for (const link of allLinks) {
        const href = link.href || link.getAttribute('href');
        if (href && href.includes('posh.vip') && !href.includes('/g/')) {
          // Skip group pages, only get individual event pages
          const normalizedUrl = new URL(href).origin + new URL(href).pathname;
          
          if (!seenUrls.has(normalizedUrl) && normalizedUrl !== window.location.href) {
            const text = link.textContent?.trim() || link.innerText?.trim() || '';
            links.push({
              text: text,
              href: normalizedUrl,
              pageTitle: pageTitle,
              headings: headings
            });
            seenUrls.add(normalizedUrl);
          }
        }
      }

      return links;
    });

    console.log(`  Found ${eventLinks.length} event links on group page`);

    // Pull ALL events (no date filtering)
    const upcomingEvents = eventLinks.map(link => ({
      title: link.text,
      url: link.href,
      normalizedUrl: link.href
    }));

    console.log(`  Processing ${upcomingEvents.length} events (all events, no date filter)`);

    // Sort by date if possible, or just return in order found
    return upcomingEvents;

  } catch (error) {
    console.error(`  ✗ Error scraping posh.vip group ${url}:`, error.message);
    return [];
  }
}

async function scrapeLinktree(url, page) {
  console.log(`🌐 Navigating to ${url}...`);
  
  // If no page provided, create a new browser instance
  let browser = null;
  let context = null;
  let shouldCloseBrowser = false;
  
  if (!page) {
    browser = await chromium.launch({
      headless: false
    });

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/Chicago",
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      colorScheme: "light"
    });

    page = await context.newPage();
    shouldCloseBrowser = true;
  }

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await rsleep(2000, 3000);
    
    console.log("📄 Page loaded, looking for links with dates...");

    // Wait for content to load
    await page.waitForSelector('a[href]', { timeout: 10000 }).catch(() => {
      console.log("⚠️  No links found with default selector, trying alternatives...");
    });

    // Get all links/buttons on the page AND check titles/headings for dates
    // Linktree typically uses buttons or anchor tags
    const linksWithDates = await page.evaluate(() => {
      const results = [];
      const seenUrls = new Set();

      // First, check page title and headings for dates
      const pageTitle = document.title || '';
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => h.textContent?.trim() || '');

      // Try multiple selectors for Linktree buttons/links
      const selectors = [
        'a[href]',
        'button[data-testid]',
        '[data-testid*="link"]',
        'a[class*="link"]',
        'button[class*="link"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        for (const element of elements) {
          // Get the text content (could be in the element or its children)
          const text = element.textContent?.trim() || element.innerText?.trim() || '';
          
          // Get the href (could be on the element or a parent/child anchor)
          let href = element.href || element.getAttribute('href');
          
          // If element is a button, look for nested anchor or data attribute
          if (!href && element.tagName === 'BUTTON') {
            const anchor = element.querySelector('a[href]');
            if (anchor) {
              href = anchor.href || anchor.getAttribute('href');
            } else {
              href = element.getAttribute('data-href') || element.getAttribute('data-url');
            }
          }
          
          // If still no href, check parent
          if (!href) {
            const parentAnchor = element.closest('a[href]');
            if (parentAnchor) {
              href = parentAnchor.href || parentAnchor.getAttribute('href');
            }
          }

          if (href && text && !seenUrls.has(href)) {
            results.push({
              text: text,
              href: href,
              pageTitle: pageTitle,
              headings: headings
            });
            seenUrls.add(href);
          }
        }
      }

      return results;
    });

    console.log(`Found ${linksWithDates.length} total links/buttons`);

    // Pull ALL links (no date filtering)
    const filteredLinks = linksWithDates;
    
    console.log(`Processing ${filteredLinks.length} links (all links, no date filter)`);

    // Remove duplicates by URL
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of filteredLinks) {
      // Normalize URL (remove query params, fragments, etc. for comparison)
      const normalizedUrl = new URL(link.href).origin + new URL(link.href).pathname;
      
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        uniqueLinks.push({
          title: link.text,
          url: link.href,
          normalizedUrl: normalizedUrl
        });
      }
    }

    console.log(`\n✅ Found ${uniqueLinks.length} unique links:`);
    uniqueLinks.forEach((link, idx) => {
      console.log(`${idx + 1}. ${link.title}`);
      console.log(`   ${link.url}\n`);
    });

    // Now scrape each posh.vip event page
    console.log(`\n🔍 Scraping event details from ${uniqueLinks.length} posh.vip pages...\n`);
    
    const eventsWithDetails = [];
    for (let i = 0; i < uniqueLinks.length; i++) {
      const link = uniqueLinks[i];
      console.log(`[${i + 1}/${uniqueLinks.length}] Processing: ${link.title}`);
      
      // Only scrape posh.vip links
      if (link.url.includes('posh.vip')) {
        const eventDetails = await scrapePoshEvent(page, link.url);
        
        // Parse date/time to ISO format
        const { startISO, endISO } = parsePoshDateTime(eventDetails.dateTime);
        
        // Build normalized event
        const normalized = {
          title: eventDetails.title || link.title,
          locationName: eventDetails.venue || null,
          startTimeLocal: startISO,
          endTimeLocal: endISO,
          sourceType: "linktree",
          sourceOrg: "Linktree Event",
          sourceUrl: link.url,
          description: eventDetails.description || null,
          address: eventDetails.address || null,
          imageUrl: eventDetails.imageUrl || null
        };
        
        // Extract eventId from URL
        const urlParts = link.url.split("/").filter(Boolean);
        const eventId = urlParts[urlParts.length - 1] || link.url;
        
        // Always write raw event data (for audit/debug purposes)
        try {
          await writeLinktreeRaw(eventId, {
            eventId,
            url: link.url,
            title: link.title,
            eventDetails: eventDetails,
            normalized: normalized,
            scrapedAt: new Date().toISOString()
          });
          console.log(`  📝 Raw data saved to events_from_linktree_raw`);
        } catch (error) {
          console.error(`  ❌ Error saving raw data: ${error.message}`);
        }
        
        // Check for duplicates before writing normalized event
        const exists = await eventExists(normalized);
        if (exists) {
          console.log(`  ⏭️  Skipping duplicate normalized event`);
          eventsWithDetails.push({
            ...link,
            eventDetails: eventDetails,
            normalized: normalized,
            skipped: true,
            reason: 'duplicate'
          });
        } else {
          // Write normalized event
          try {
            await writeNormalizedEvent(normalized, 1.0);
            console.log(`  ✅ Normalized event saved to Firestore`);
            eventsWithDetails.push({
              ...link,
              eventDetails: eventDetails,
              normalized: normalized,
              saved: true
            });
          } catch (error) {
            console.error(`  ❌ Error saving normalized event: ${error.message}`);
            eventsWithDetails.push({
              ...link,
              eventDetails: eventDetails,
              normalized: normalized,
              saved: false,
              error: error.message
            });
          }
        }
      } else {
        console.log(`  ⏭️  Skipping non-posh.vip link`);
        eventsWithDetails.push({
          ...link,
          eventDetails: { note: 'Not a posh.vip link' }
        });
      }
      
      // Small delay between requests
      if (i < uniqueLinks.length - 1) {
        await rsleep(2000, 3000);
      }
    }

    // Save to JSON
    const outputFile = `linktree_scrape_${new Date().toISOString().split('T')[0]}.json`;
    const outputData = {
      scrapedAt: new Date().toISOString(),
      sourceUrl: url,
      totalLinksFound: linksWithDates.length,
      linksWithDates: filteredLinks.length,
      uniqueLinks: uniqueLinks.length,
      events: eventsWithDetails
    };

    writeFileSync(outputFile, JSON.stringify(outputData, null, 2), "utf8");
    console.log(`\n💾 Saved results to ${outputFile}`);

    if (shouldCloseBrowser && browser) {
      await browser.close();
    }
    return eventsWithDetails;

  } catch (error) {
    console.error("Error scraping Linktree:", error);
    if (shouldCloseBrowser && browser) {
      await browser.close();
    }
    throw error;
  }
}

// Run the scraper with multiple Linktree URLs and posh.vip group pages
export const LINKTREE_URLS = [
  "https://linktr.ee/richcreatives",
  "https://linktr.ee/dallaspoolparty",
  "https://linktr.ee/thecliqpromos"
];

export const POSH_GROUP_URLS = [
  "https://posh.vip/g/quality-crazy-promotions-2"
];

export const DIRECT_EVENT_URLS = [
  "https://www.eventbrite.com/e/countdown-in-the-sky-nye-2026-dallas-tickets-1964572377867?aff=oddtdtcreator",
  "https://posh.vip/e/whos-on-top-pt-2"
];

// Parse Eventbrite date/time to ISO format
function parseEventbriteDateTime(dateTimeStr) {
  if (!dateTimeStr) return { startISO: null, endISO: null };
  
  // Try ISO format first (if it's already ISO)
  try {
    const dt = DateTime.fromISO(dateTimeStr, { zone: TZ });
    if (dt.isValid) {
      return { startISO: dt.toISO(), endISO: null };
    }
  } catch (e) {
    // Continue to other formats
  }
  
  // Try common Eventbrite formats
  const formats = [
    "LLLL d, yyyy 'at' h:mm a",
    "LLLL d, yyyy h:mm a",
    "EEEE, LLLL d, yyyy 'at' h:mm a",
    "EEEE, LLLL d, yyyy h:mm a"
  ];
  
  for (const format of formats) {
    try {
      const dt = DateTime.fromFormat(dateTimeStr, format, { zone: TZ });
      if (dt.isValid) {
        return { startISO: dt.toISO(), endISO: null };
      }
    } catch (e) {
      continue;
    }
  }
  
  return { startISO: null, endISO: null };
}

export async function scrapeMultipleLinktrees(urls, poshGroups, directUrls = []) {
  const allEvents = [];
  const allResults = [];
  
  // Create browser context for all scraping
  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/Chicago",
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    colorScheme: "light"
  });

  const page = await context.newPage();

  try {
    // Process Linktree URLs
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 Processing Linktree ${i + 1}/${urls.length}: ${url}`);
      console.log(`${'='.repeat(60)}\n`);
      
      try {
        const events = await scrapeLinktree(url, page);
        allEvents.push(...events);
        allResults.push({
          sourceUrl: url,
          sourceType: 'linktree',
          events: events,
          count: events.length
        });
      } catch (error) {
        console.error(`❌ Error processing ${url}:`, error.message);
        allResults.push({
          sourceUrl: url,
          sourceType: 'linktree',
          events: [],
          count: 0,
          error: error.message
        });
      }
      
      // Delay between different Linktree pages
      if (i < urls.length - 1) {
        console.log(`\n⏳ Waiting before next Linktree...\n`);
        await rsleep(3000, 5000);
      }
    }

    // Process posh.vip group pages
    for (let i = 0; i < poshGroups.length; i++) {
      const url = poshGroups[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 Processing posh.vip group ${i + 1}/${poshGroups.length}: ${url}`);
      console.log(`${'='.repeat(60)}\n`);
      
      try {
        // Get event links from group page
        const eventLinks = await scrapePoshGroup(page, url);
        
        console.log(`\n🔍 Scraping event details from ${eventLinks.length} posh.vip event pages...\n`);
        
        const eventsWithDetails = [];
        for (let j = 0; j < eventLinks.length; j++) {
          const link = eventLinks[j];
          console.log(`[${j + 1}/${eventLinks.length}] Processing: ${link.title}`);
          
          const eventDetails = await scrapePoshEvent(page, link.url);
          
          // Parse date/time to ISO format
          const { startISO, endISO } = parsePoshDateTime(eventDetails.dateTime);
          
          // Build normalized event
          const normalized = {
            title: eventDetails.title || link.title,
            locationName: eventDetails.venue || null,
            startTimeLocal: startISO,
            endTimeLocal: endISO,
            sourceType: "linktree",
            sourceOrg: "Linktree Event",
            sourceUrl: link.url,
            description: eventDetails.description || null,
            address: eventDetails.address || null,
            imageUrl: eventDetails.imageUrl || null
          };
          
          // Extract eventId from URL
          const urlParts = link.url.split("/").filter(Boolean);
          const eventId = urlParts[urlParts.length - 1] || link.url;
          
          // Always write raw event data (for audit/debug purposes)
          try {
            await writeLinktreeRaw(eventId, {
              eventId,
              url: link.url,
              title: link.title,
              eventDetails: eventDetails,
              normalized: normalized,
              scrapedAt: new Date().toISOString()
            });
            console.log(`  📝 Raw data saved to events_from_linktree_raw`);
          } catch (error) {
            console.error(`  ❌ Error saving raw data: ${error.message}`);
          }
          
          // Check for duplicates before writing normalized event
          const exists = await eventExists(normalized);
          if (exists) {
            console.log(`  ⏭️  Skipping duplicate normalized event`);
            eventsWithDetails.push({
              ...link,
              eventDetails: eventDetails,
              normalized: normalized,
              skipped: true,
              reason: 'duplicate'
            });
          } else {
            // Write normalized event
            try {
              await writeNormalizedEvent(normalized, 1.0);
              console.log(`  ✅ Normalized event saved to Firestore`);
              eventsWithDetails.push({
                ...link,
                eventDetails: eventDetails,
                normalized: normalized,
                saved: true
              });
            } catch (error) {
              console.error(`  ❌ Error saving normalized event: ${error.message}`);
              eventsWithDetails.push({
                ...link,
                eventDetails: eventDetails,
                normalized: normalized,
                saved: false,
                error: error.message
              });
            }
          }
          
          // Small delay between requests
          if (j < eventLinks.length - 1) {
            await rsleep(2000, 3000);
          }
        }
        
        allEvents.push(...eventsWithDetails);
        allResults.push({
          sourceUrl: url,
          sourceType: 'posh_group',
          events: eventsWithDetails,
          count: eventsWithDetails.length
        });
      } catch (error) {
        console.error(`❌ Error processing ${url}:`, error.message);
        allResults.push({
          sourceUrl: url,
          sourceType: 'posh_group',
          events: [],
          count: 0,
          error: error.message
        });
      }
      
      // Delay between different posh group pages
      if (i < poshGroups.length - 1) {
        console.log(`\n⏳ Waiting before next posh.vip group...\n`);
        await rsleep(3000, 5000);
      }
    }

    // Process direct event URLs (Eventbrite and posh.vip)
    for (let i = 0; i < directUrls.length; i++) {
      const url = directUrls[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 Processing direct event ${i + 1}/${directUrls.length}: ${url}`);
      console.log(`${'='.repeat(60)}\n`);
      
      try {
        let eventDetails = null;
        let normalized = null;
        
        if (url.includes('eventbrite.com')) {
          eventDetails = await scrapeEventbrite(page, url);
          
          // Parse date/time
          const { startISO, endISO } = parseEventbriteDateTime(eventDetails.dateTime);
          
          // Build normalized event
          normalized = {
            title: eventDetails.title,
            locationName: eventDetails.venue || null,
            startTimeLocal: startISO,
            endTimeLocal: endISO,
            sourceType: "eventbrite",
            sourceOrg: "Eventbrite",
            sourceUrl: url,
            description: eventDetails.description || null,
            address: eventDetails.address || null,
            imageUrl: eventDetails.imageUrl || null
          };
        } else if (url.includes('posh.vip')) {
          eventDetails = await scrapePoshEvent(page, url);
          
          // Parse date/time
          const { startISO, endISO } = parsePoshDateTime(eventDetails.dateTime);
          
          // Build normalized event
          normalized = {
            title: eventDetails.title,
            locationName: eventDetails.venue || null,
            startTimeLocal: startISO,
            endTimeLocal: endISO,
            sourceType: "linktree",
            sourceOrg: "Linktree Event",
            sourceUrl: url,
            description: eventDetails.description || null,
            address: eventDetails.address || null,
            imageUrl: eventDetails.imageUrl || null
          };
        }
        
        if (normalized && normalized.title) {
          // Extract eventId from URL
          const urlParts = url.split("/").filter(Boolean);
          const eventId = urlParts[urlParts.length - 1] || url;
          
          // Always write raw event data (for audit/debug purposes)
          try {
            await writeLinktreeRaw(eventId, {
              eventId,
              url: url,
              eventDetails: eventDetails,
              normalized: normalized,
              scrapedAt: new Date().toISOString()
            });
            console.log(`  📝 Raw data saved to events_from_linktree_raw`);
          } catch (error) {
            console.error(`  ❌ Error saving raw data: ${error.message}`);
          }
          
          // Check for duplicates before writing normalized event
          const exists = await eventExists(normalized);
          if (exists) {
            console.log(`  ⏭️  Skipping duplicate normalized event`);
            allEvents.push({
              url: url,
              eventDetails: eventDetails,
              normalized: normalized,
              skipped: true,
              reason: 'duplicate'
            });
          } else {
            // Write normalized event
            try {
              await writeNormalizedEvent(normalized, 1.0);
              console.log(`  ✅ Normalized event saved to Firestore`);
              allEvents.push({
                url: url,
                eventDetails: eventDetails,
                normalized: normalized,
                saved: true
              });
            } catch (error) {
              console.error(`  ❌ Error saving normalized event: ${error.message}`);
              allEvents.push({
                url: url,
                eventDetails: eventDetails,
                normalized: normalized,
                saved: false,
                error: error.message
              });
            }
          }
        } else {
          console.log(`  ⏭️  Skipping - no valid event data`);
          allEvents.push({
            url: url,
            eventDetails: eventDetails,
            skipped: true,
            reason: 'no_data'
          });
        }
        
        allResults.push({
          sourceUrl: url,
          sourceType: url.includes('eventbrite.com') ? 'eventbrite' : 'posh_direct',
          events: [allEvents[allEvents.length - 1]],
          count: 1
        });
      } catch (error) {
        console.error(`❌ Error processing ${url}:`, error.message);
        allResults.push({
          sourceUrl: url,
          sourceType: 'direct',
          events: [],
          count: 0,
          error: error.message
        });
      }
      
      // Delay between different direct event pages
      if (i < directUrls.length - 1) {
        console.log(`\n⏳ Waiting before next direct event...\n`);
        await rsleep(2000, 3000);
      }
    }
  } finally {
    await browser.close();
  }
  
  // Save combined results
  const outputFile = `linktree_scrape_${new Date().toISOString().split('T')[0]}.json`;
  const outputData = {
    scrapedAt: new Date().toISOString(),
    linktreeUrls: urls,
    poshGroupUrls: poshGroups,
    directEventUrls: directUrls,
    totalSources: urls.length + poshGroups.length + directUrls.length,
    totalEvents: allEvents.length,
    sources: allResults,
    allEvents: allEvents
  };

  writeFileSync(outputFile, JSON.stringify(outputData, null, 2), "utf8");
  console.log(`\n${'='.repeat(60)}`);
  console.log(`💾 Saved combined results to ${outputFile}`);
  console.log(`${'='.repeat(60)}`);
  
  return allEvents;
}

scrapeMultipleLinktrees(LINKTREE_URLS, POSH_GROUP_URLS, DIRECT_EVENT_URLS)
  .then((events) => {
    const poshEvents = events.filter(e => e.url && e.url.includes('posh.vip'));
    console.log(`\n✨ Scraping complete!`);
    console.log(`   - Processed ${LINKTREE_URLS.length} Linktree pages`);
    console.log(`   - Processed ${POSH_GROUP_URLS.length} posh.vip group pages`);
    console.log(`   - Found ${events.length} total events`);
    console.log(`   - Scraped ${poshEvents.length} posh.vip event pages`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

