// scrape_linktree.js
// Scrape Linktree page and extract links from buttons that have dates in their titles

import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";
import { rsleep } from "./utils.js";

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
      additionalInfo: [],
      images: [],
      primaryImage: null,
      error: error.message
    };
  }
}

async function scrapeLinktree(url) {
  console.log(`🌐 Navigating to ${url}...`);
  
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
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await rsleep(2000, 3000);
    
    console.log("📄 Page loaded, looking for links with dates...");

    // Wait for content to load
    await page.waitForSelector('a[href]', { timeout: 10000 }).catch(() => {
      console.log("⚠️  No links found with default selector, trying alternatives...");
    });

    // Get all links/buttons on the page
    // Linktree typically uses buttons or anchor tags
    const linksWithDates = await page.evaluate(() => {
      const results = [];
      const seenUrls = new Set();

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
              href: href
            });
            seenUrls.add(href);
          }
        }
      }

      return results;
    });

    console.log(`Found ${linksWithDates.length} total links/buttons`);

    // Filter to only those with dates in their text
    const datePattern = new RegExp(DATE_PATTERNS.map(p => p.source).join('|'), 'i');
    const filteredLinks = linksWithDates.filter(link => hasDate(link.text));
    
    console.log(`Found ${filteredLinks.length} links with dates in titles`);

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

    console.log(`\n✅ Found ${uniqueLinks.length} unique links with dates:`);
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
        eventsWithDetails.push({
          ...link,
          eventDetails: eventDetails
        });
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

    await browser.close();
    return eventsWithDetails;

  } catch (error) {
    console.error("Error scraping Linktree:", error);
    await browser.close();
    throw error;
  }
}

// Run the scraper
const LINKTREE_URL = "https://linktr.ee/richcreatives";

scrapeLinktree(LINKTREE_URL)
  .then((events) => {
    const poshEvents = events.filter(e => e.url.includes('posh.vip'));
    console.log(`\n✨ Scraping complete!`);
    console.log(`   - Found ${events.length} total events`);
    console.log(`   - Scraped ${poshEvents.length} posh.vip event pages`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

