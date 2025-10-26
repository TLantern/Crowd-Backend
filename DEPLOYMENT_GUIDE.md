# Quick Deployment Guide

## Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Logged in to Firebase: `firebase login`
- Firebase project initialized

---

## Step 1: Install Dependencies

```bash
cd functions
npm install
cd ..
```

---

## Step 2: Deploy Everything

### Option A: Deploy All at Once (Recommended)

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes
```

This will deploy:
- ✅ All Cloud Functions (including new `getNearbyEvents` and `getNearbySignals`)
- ✅ Updated Firestore security rules
- ✅ Geohash composite indexes

### Option B: Deploy Individually

```bash
# Deploy functions only
firebase deploy --only functions

# Deploy Firestore rules only
firebase deploy --only firestore:rules

# Deploy indexes only
firebase deploy --only firestore:indexes
```

---

## Step 3: Wait for Indexes

After deploying indexes, wait 1-2 minutes for them to build. You can check status:

```bash
firebase firestore:indexes
```

Or in the Firebase Console:
1. Go to Firestore → Indexes
2. Wait until all indexes show "Enabled" status

---

## Step 4: Test the Deployment

### Test in Firebase Console

1. Go to Functions → Dashboard
2. You should see:
   - `getNearbyEvents`
   - `getNearbySignals`
   - All existing functions

### Test with curl

```bash
# Get your function URL
firebase functions:list

# Test getNearbyEvents
curl -X POST https://REGION-PROJECT.cloudfunctions.net/getNearbyEvents \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radiusKm": 10
  }'
```

### Test from iOS

```swift
// Make sure Firebase is configured
FirebaseApp.configure()

// Test fetching nearby events
FirebaseManager.shared.fetchNearbyEvents(
    latitude: 37.7749,
    longitude: -122.4194,
    radiusKm: 10.0
)
```

---

## Step 5: Migrate Existing Data (If Applicable)

If you have existing events or signals without geohash fields, run a one-time migration:

### Create a migration script: `functions/migrate.js`

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const { encodeGeohash } = require('./geohash');

async function migrateEvents() {
  console.log('Migrating events...');
  const eventsSnapshot = await db.collection('events').get();
  const batch = db.batch();
  let count = 0;
  
  eventsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (!data.geohash && data.latitude && data.longitude) {
      const geohash = encodeGeohash(data.latitude, data.longitude, 6);
      batch.update(doc.ref, {
        geohash: geohash,
        peopleCount: data.peopleCount || 0
      });
      count++;
    }
  });
  
  if (count > 0) {
    await batch.commit();
    console.log(`Migrated ${count} events`);
  } else {
    console.log('No events need migration');
  }
}

async function migrateSignals() {
  console.log('Migrating signals...');
  const signalsSnapshot = await db.collection('signals').get();
  const batch = db.batch();
  let count = 0;
  
  signalsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    // Signals without lat/lng cannot be migrated
    if (!data.geohash && data.latitude && data.longitude) {
      const geohash = encodeGeohash(data.latitude, data.longitude, 6);
      batch.update(doc.ref, {
        geohash: geohash,
        peopleCount: 1,
        color: '#FFD700', // Default to yellow
        radiusMeters: 75  // Default to small radius
      });
      count++;
    }
  });
  
  if (count > 0) {
    await batch.commit();
    console.log(`Migrated ${count} signals`);
  } else {
    console.log('No signals need migration');
  }
}

async function run() {
  try {
    await migrateEvents();
    await migrateSignals();
    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();
```

### Run the migration:

```bash
cd functions
node migrate.js
```

**Note:** Only run this if you have existing data. New documents will automatically include all fields.

---

## Step 6: Monitor Logs

Watch function execution logs:

```bash
firebase functions:log
```

Or in Firebase Console:
1. Go to Functions → Logs
2. Watch for any errors

---

## Troubleshooting

### "Missing Index" Error

**Symptom:** Query fails with "The query requires an index"

**Solution:**
1. Deploy indexes: `firebase deploy --only firestore:indexes`
2. Wait 1-2 minutes
3. Check status: `firebase firestore:indexes`

### "Permission Denied" Error

**Symptom:** Firestore operations fail with permission error

**Solution:**
1. Deploy rules: `firebase deploy --only firestore:rules`
2. Verify user is authenticated in your iOS app
3. Check rules in Firebase Console

### Functions Not Updating

**Symptom:** Changes to Cloud Functions not reflected

**Solution:**
1. Redeploy: `firebase deploy --only functions`
2. Hard refresh: `firebase functions:delete FUNCTION_NAME` then redeploy
3. Check logs: `firebase functions:log`

### Real-Time Updates Not Working

**Symptom:** Firestore snapshot listeners not triggering

**Solution:**
1. Verify listener setup in iOS code
2. Check geohash prefix matches expected area
3. Test with Firestore Console (manually add/remove documents)
4. Verify security rules allow reads

---

## Rollback (If Needed)

To rollback to previous version:

```bash
# View deployment history
firebase functions:list

# Rollback functions
firebase rollback functions

# Manually revert rules/indexes through Firebase Console
```

---

## Cost Monitoring

Monitor your Firebase usage:
1. Go to Firebase Console → Usage
2. Watch:
   - Cloud Functions invocations
   - Firestore reads/writes
   - Outbound bandwidth

**Tips to reduce costs:**
- Use geohash queries (more efficient than bounding box)
- Limit query results
- Cache frequently accessed data on client
- Use appropriate listener scopes (don't listen to entire collections)

---

## Production Checklist

Before launching to production:

- [ ] Deploy all functions, rules, and indexes
- [ ] Wait for indexes to build completely
- [ ] Test event creation
- [ ] Test signal creation
- [ ] Test nearby queries
- [ ] Test real-time listeners
- [ ] Verify color/radius computation
- [ ] Check security rules
- [ ] Monitor function logs
- [ ] Test with iOS app
- [ ] Verify geohash precision is appropriate
- [ ] Test edge cases (no results, many results, etc.)
- [ ] Set up monitoring/alerts in Firebase Console
- [ ] Review and optimize query limits

---

## Success Indicators

You'll know everything is working when:

✅ Functions deployed successfully
✅ Indexes show "Enabled" in Console
✅ `getNearbyEvents` returns events with distance field
✅ `getNearbySignals` returns signals with color/radiusMeters
✅ Creating a signal automatically computes all fields
✅ Real-time listeners receive updates
✅ Signal colors/radius update when peopleCount changes
✅ iOS app displays signals on map correctly
✅ No errors in function logs

---

## Support

If you encounter issues:

1. Check `GEOHASH_IMPLEMENTATION_SUMMARY.md` for architecture details
2. Review `swift-examples/README.md` for iOS integration
3. Check `DATABASE_STRUCTURE.md` for data model
4. Review Firebase logs: `firebase functions:log`
5. Test with Firebase Emulators for local debugging

---

## Quick Commands Reference

```bash
# Deploy everything
firebase deploy --only functions,firestore:rules,firestore:indexes

# Deploy functions only
firebase deploy --only functions

# View logs
firebase functions:log

# Check function status
firebase functions:list

# Check index status
firebase firestore:indexes

# Start local emulators
firebase emulators:start

# Run tests (if you have them)
cd functions && npm test
```

---

**Your backend is ready to deploy! 🚀**

