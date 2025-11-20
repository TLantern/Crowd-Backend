// upload_linktree_to_firebase.js
// Reads Linktree scrape JSON and uploads events + images to Firebase

import { readFileSync, readdirSync } from "fs";
import admin from "firebase-admin";
import { db, writeNormalizedEvent } from "./firestore.js";
import fetch from "node-fetch";
import crypto from "crypto";

// Initialize Firebase Storage - use default bucket
const bucket = admin.storage().bucket();

/**
 * Download image from URL and return buffer
 */
async function downloadImage(imageUrl) {
  try {
    console.log(`    Downloading image: ${imageUrl.substring(0, 80)}...`);
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      timeout: 30000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    console.log(`    ✓ Downloaded ${(buffer.length / 1024).toFixed(2)} KB`);
    return buffer;
  } catch (error) {
    console.error(`    ✗ Failed to download image: ${error.message}`);
    return null;
  }
}

/**
 * Upload image buffer to Firebase Storage
 */
async function uploadImageToStorage(buffer, storagePath, contentType = "image/jpeg") {
  try {
    const file = bucket.file(storagePath);
    
    await file.save(buffer, {
      metadata: {
        contentType: contentType,
        cacheControl: "public, max-age=31536000" // 1 year cache
      }
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    
    console.log(`    ✓ Uploaded to Firebase Storage: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error(`    ⚠️  Storage upload failed: ${error.message}`);
    console.log(`    ℹ️  Will use external image URL instead`);
    return null;
  }
}

/**
 * Parse date/time from Posh.vip event details
 */
function parseDateTime(eventDetails) {
  const dateTime = eventDetails.dateTime;
  if (!dateTime) return { startTimeLocal: null, startTimeISO: null, endTimeISO: null };

  // Try to parse ISO from description if available
  const description = eventDetails.description || "";
  
  // Look for ISO format dates in schema.org data
  const startMatch = description.match(/"startDate":\s*"([^"]+)"/);
  const endMatch = description.match(/"endDate":\s*"([^"]+)"/);

  return {
    startTimeLocal: dateTime,
    startTimeISO: startMatch ? startMatch[1] : null,
    endTimeISO: endMatch ? endMatch[1] : null
  };
}

/**
 * Create a deterministic event ID from URL
 */
function createEventIdFromUrl(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
}

/**
 * Process a single event from Linktree scrape
 */
async function processEvent(event, sourceUrl) {
  console.log(`\n📋 Processing: ${event.title}`);
  
  const eventDetails = event.eventDetails;
  if (!eventDetails || eventDetails.error) {
    console.log(`  ⏭️  Skipping - no event details or error`);
    return { success: false, reason: "no_details" };
  }

  // Parse date/time
  const { startTimeLocal, startTimeISO, endTimeISO } = parseDateTime(eventDetails);

  // Download and upload primary image if available
  let imageUrl = null;
  if (eventDetails.primaryImage) {
    const imageBuffer = await downloadImage(eventDetails.primaryImage);
    
    if (imageBuffer) {
      // Determine file extension from URL or content type
      const urlLower = eventDetails.primaryImage.toLowerCase();
      let extension = "jpg";
      if (urlLower.includes(".png")) extension = "png";
      else if (urlLower.includes(".webp")) extension = "webp";

      // Create storage path
      const eventId = createEventIdFromUrl(event.url);
      const storagePath = `linktree_events/${eventId}.${extension}`;
      
      // Determine content type
      const contentType = 
        extension === "png" ? "image/png" :
        extension === "webp" ? "image/webp" :
        "image/jpeg";

      imageUrl = await uploadImageToStorage(imageBuffer, storagePath, contentType);
      
      // Fallback to external URL if upload failed
      if (!imageUrl) {
        imageUrl = eventDetails.primaryImage;
        console.log(`    ✓ Using external image URL`);
      }
    }
  } else {
    console.log(`  ⚠️  No primary image found`);
  }

  // Save raw event data to audit collection
  const eventId = createEventIdFromUrl(event.url);
  const now = admin.firestore.FieldValue.serverTimestamp();
  
  try {
    await db
      .collection("events_from_linktree_raw")
      .doc(eventId)
      .set(
        {
          ...event,
          scrapedFrom: sourceUrl,
          uploadedImageUrl: imageUrl,
          createdAt: now,
          lastSeenAt: now
        },
        { merge: true }
      );
    
    console.log(`  ✓ Saved raw event data`);
  } catch (error) {
    console.error(`  ✗ Failed to save raw data: ${error.message}`);
  }

  // Create normalized event for campus_events_live collection
  const normalized = {
    title: eventDetails.title || event.title,
    description: eventDetails.description || "",
    locationName: eventDetails.venue || eventDetails.address || null,
    startTimeLocal: startTimeLocal,
    startTimeISO: startTimeISO,
    endTimeISO: endTimeISO,
    sourceType: "linktree",
    sourceOrg: eventDetails.venue || "Linktree",
    sourceUrl: event.url,
    imageUrl: imageUrl,
    address: eventDetails.address,
    additionalInfo: eventDetails.additionalInfo || [],
    confidence: 0.7 // Medium confidence for Linktree events
  };

  try {
    // Check if this event already exists (by canonical ID)
    const { canonicalIdForEvent } = await import("./utils.js");
    const canonicalId = canonicalIdForEvent(normalized);
    
    const existingDoc = await db.collection("campus_events_live").doc(canonicalId).get();
    
    if (existingDoc.exists) {
      const existing = existingDoc.data();
      // Update lastSeenAt to indicate event is still active
      await db.collection("campus_events_live").doc(canonicalId).update({
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        // Update image if we have a better one
        ...(imageUrl && !existing.imageUrl ? { imageUrl } : {})
      });
      console.log(`  ℹ️  Event already exists, updated lastSeenAt`);
    } else {
      await writeNormalizedEvent(normalized, 0.7);
      console.log(`  ✓ Saved to campus_events_live (NEW)`);
    }
    
    return { success: true, imageUrl, isDuplicate: existingDoc.exists };
  } catch (error) {
    console.error(`  ✗ Failed to save normalized event: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * Find the most recent Linktree scrape JSON file
 */
function findLatestLinktreeScrape() {
  const files = readdirSync(".");
  const linktreeFiles = files.filter(f => 
    f.startsWith("linktree_scrape_") && f.endsWith(".json")
  );

  if (linktreeFiles.length === 0) {
    throw new Error("No Linktree scrape files found");
  }

  // Sort by filename (which includes date) and get the latest
  linktreeFiles.sort().reverse();
  return linktreeFiles[0];
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Starting Linktree to Firebase upload...\n");

  // Find and read the latest scrape file
  const filename = process.argv[2] || findLatestLinktreeScrape();
  console.log(`📂 Reading file: ${filename}\n`);

  const data = JSON.parse(readFileSync(filename, "utf8"));
  const events = data.events || [];

  console.log(`📊 Found ${events.length} events to process`);
  console.log(`🌐 Source: ${data.sourceUrl}`);
  console.log(`📅 Scraped at: ${data.scrapedAt}\n`);

  let successCount = 0;
  let newCount = 0;
  let duplicateCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    console.log(`\n[${i + 1}/${events.length}] ========================================`);
    
    const result = await processEvent(event, data.sourceUrl);
    
    if (result.success) {
      successCount++;
      if (result.isDuplicate) {
        duplicateCount++;
      } else {
        newCount++;
      }
    } else if (result.reason === "no_details") {
      skipCount++;
    } else {
      failCount++;
    }

    // Small delay between uploads
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n\n✨ Upload Complete!");
  console.log("=====================================");
  console.log(`✅ Successfully processed: ${successCount}`);
  console.log(`   🆕 New events: ${newCount}`);
  console.log(`   ♻️  Duplicates (updated): ${duplicateCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📊 Total processed: ${events.length}`);
  console.log("=====================================\n");
}

// Run the script
main()
  .then(() => {
    console.log("🎉 All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });

