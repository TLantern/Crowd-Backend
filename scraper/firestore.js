// firestore.js
// Firebase Admin SDK init and Firestore write helpers.

import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { canonicalIdForEvent } from "./utils.js";

if (!admin.apps.length) {
  if (existsSync("./serviceAccountKey.json")) {
    // Use service account key if available
    const serviceAccount = JSON.parse(
      readFileSync("./serviceAccountKey.json", "utf8")
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: "crowd-6193c.appspot.com"
    });
    console.log("🔑 Using service account key authentication");
  } else {
    // Fall back to application default credentials (Firebase CLI login)
    admin.initializeApp({
      projectId: "crowd-6193c",
      storageBucket: "crowd-6193c.appspot.com"
    });
    console.log("🔑 Using application default credentials (Firebase CLI)");
  }
}

export const db = admin.firestore();

// Write raw Instagram scrape payload (debug / audit)
export async function writeInstagramRaw(igPostId, payload) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection("events_from_instagram_raw")
    .doc(igPostId)
    .set(
      {
        ...payload,
        createdAt: now,
        lastSeenAt: now
      },
      { merge: true }
    );
}

// Write raw official calendar payload (debug / audit)
export async function writeOfficialRaw(calendarId, payload) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection("events_from_official_raw")
    .doc(calendarId)
    .set(
      {
        ...payload,
        createdAt: now,
        lastSeenAt: now
      },
      { merge: true }
    );
}

// Write raw Engage/orgs payload (debug / audit)
export async function writeEngageRaw(eventId, payload) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection("events_from_engage_raw")
    .doc(eventId)
    .set(
      {
        ...payload,
        createdAt: now,
        lastSeenAt: now
      },
      { merge: true }
    );
}

// Upsert normalized "live" event (shared across sources)
export async function writeNormalizedEvent(normalized, confidenceOverride) {
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
        lastSeenAt: now
      },
      { merge: true }
    );
}

// Cleanup helper to hard-delete a normalized event by doc ref
export async function deleteCampusEventDoc(docRef) {
  await docRef.delete();
}
