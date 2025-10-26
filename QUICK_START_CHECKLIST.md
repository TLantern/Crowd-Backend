# Quick Start Checklist ✅

Follow these steps to test your backend:

---

## ✅ Step 1: Verify Java Installation

The Firebase emulators require Java. Check if you have it:

```powershell
java -version
```

### If Java is NOT installed:

1. **Download OpenJDK:** https://adoptium.net/
2. **Install:** Choose "Add to PATH" during installation
3. **Restart terminal** and verify: `java -version`

---

## ✅ Step 2: Run Unit Tests

Test the geohash implementation:

```powershell
npm test
```

**Expected output:**
```
✅ All geohash tests completed successfully!
```

---

## ✅ Step 3: Start Firebase Emulators

```powershell
npm start
```

**Expected output:**
```
✔  All emulators ready! It is now safe to connect your app.
┌─────────────────────────────────────────────────────────────┐
│ ✔  All emulators ready! View Emulator UI at http://localhost:4000 │
└─────────────────────────────────────────────────────────────┘

┌───────────┬────────────────┬─────────────────────────────────┐
│ Emulator  │ Host:Port      │ View in Emulator UI             │
├───────────┼────────────────┼─────────────────────────────────┤
│ Functions │ localhost:5001 │ http://localhost:4000/functions │
│ Firestore │ localhost:8080 │ http://localhost:4000/firestore │
└───────────┴────────────────┴─────────────────────────────────┘
```

### If you see "Java not found":
- Install Java (see Step 1)
- Restart your terminal
- Try again

### If emulators start successfully:
- Keep this terminal window open
- Open a NEW terminal for testing

---

## ✅ Step 4: Open Emulator UI

Open your browser to:
```
http://localhost:4000
```

You should see the Firebase Emulator UI with tabs for:
- Functions
- Firestore
- Logs

---

## ✅ Step 5: Test Your Functions

### Option A: Using PowerShell (Open NEW Terminal)

```powershell
# Test getNearbyEvents
$body = @{
    data = @{
        latitude = 37.7749
        longitude = -122.4194
        radiusKm = 10
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5001/crowd-6193c/us-central1/getNearbyEvents" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

### Option B: Using Postman

1. Download Postman: https://www.postman.com/downloads/
2. Create a POST request to:
   ```
   http://localhost:5001/crowd-6193c/us-central1/getNearbyEvents
   ```
3. Body (JSON):
   ```json
   {
     "data": {
       "latitude": 37.7749,
       "longitude": -122.4194,
       "radiusKm": 10
     }
   }
   ```
4. Send!

---

## ✅ Step 6: Create Test Data

### Create an Event:

**Using Emulator UI:**
1. Go to http://localhost:4000
2. Click **Firestore** tab
3. Click **Start Collection**
4. Collection ID: `events`
5. Document ID: `test-event-1`
6. Add fields:
   ```
   title: "Test Event" (string)
   hostId: "test-user-123" (string)
   latitude: 37.7749 (number)
   longitude: -122.4194 (number)
   geohash: "9q8yyk" (string)
   radiusMeters: 60 (number)
   attendeeCount: 0 (number)
   peopleCount: 0 (number)
   signalStrength: 0 (number)
   tags: ["test"] (array)
   createdAt: (timestamp) now
   updatedAt: (timestamp) now
   ```
7. Click **Save**

### Create a Signal (Tests Auto-Computation):

**Using PowerShell:**
```powershell
$body = @{
    data = @{
        eventId = "test-event-1"
        latitude = 37.7749
        longitude = -122.4194
        signalStrength = 5
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5001/crowd-6193c/us-central1/createSignal" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

**Expected Result:**
- Signal created with `geohash`, `peopleCount`, `color`, and `radiusMeters` fields
- Color should be "#FFD700" (yellow) since peopleCount < 10
- Radius should be 75 meters

**Verify in Emulator UI:**
1. Go to Firestore tab
2. Check `signals` collection
3. You should see the signal with all computed fields! ✨

---

## ✅ Step 7: Test Geohash Queries

```powershell
# Query nearby signals
$body = @{
    data = @{
        latitude = 37.7749
        longitude = -122.4194
        radiusKm = 5
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5001/crowd-6193c/us-central1/getNearbySignals" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

**Expected:** Returns your test signal with distance field!

---

## ✅ Step 8: Test Color/Radius Updates

Create multiple signals to see automatic color/radius updates:

```powershell
# Create 26 signals (will trigger color change to light red)
for ($i = 1; $i -le 26; $i++) {
    $body = @{
        data = @{
            eventId = "test-event-1"
            latitude = 37.7749 + ($i * 0.0001)
            longitude = -122.4194 + ($i * 0.0001)
            signalStrength = 5
        }
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:5001/crowd-6193c/us-central1/createSignal" `
        -Method POST `
        -Body $body `
        -ContentType "application/json"
    
    Write-Host "Created signal $i"
    Start-Sleep -Milliseconds 200
}
```

**After creating 26 signals:**
- Check Firestore → signals collection
- All signals in the area should now have:
  - `color`: "#FF6B6B" (light red)
  - `radiusMeters`: 125
  - `peopleCount`: 26+

**This proves automatic recalculation works!** 🎉

---

## ✅ Step 9: Monitor Logs

In your emulator terminal or Emulator UI, you should see logs like:

```
Searching for signals near (37.7749, -122.4194) within 5km
Found 26 signals within 5km
Recalculated color/radius for 26 signals in area 9q8yy
```

---

## ✅ Step 10: Deploy to Production (When Ready)

After local testing passes:

```powershell
# Login to Firebase (if not already)
firebase login

# Deploy everything
npm run deploy
```

This deploys:
- ✅ All Cloud Functions
- ✅ Firestore security rules
- ✅ Geohash indexes

---

## Troubleshooting

### Problem: "Java not found"
**Solution:** Install Java from https://adoptium.net/ and restart terminal

### Problem: "Port already in use"
**Solution:** 
```powershell
# Find process using port
netstat -ano | findstr :5001
# Kill it
taskkill /PID <PID> /F
```

### Problem: Functions not working
**Solution:** Check logs in Emulator UI → Functions → Logs

### Problem: "ECONNREFUSED" when calling functions
**Solution:** Make sure emulators are running (`npm start` in one terminal, test in another)

---

## Success Criteria

You know everything is working when:

✅ Geohash tests pass  
✅ Emulators start without errors  
✅ Can access http://localhost:4000  
✅ Can create events with geohash  
✅ Can create signals with auto-computed color/radius  
✅ `getNearbyEvents` returns events with distance  
✅ `getNearbySignals` returns signals with color/radius  
✅ Creating multiple signals updates colors automatically  

---

## Quick Commands

```powershell
# Run tests
npm test

# Start emulators
npm start

# Stop emulators
Ctrl + C

# Deploy to production
npm run deploy

# View production logs
npm run logs
```

---

## Files to Review

- **TESTING_GUIDE.md** - Detailed testing instructions
- **GEOHASH_IMPLEMENTATION_SUMMARY.md** - Architecture overview
- **DEPLOYMENT_GUIDE.md** - Production deployment guide
- **swift-examples/README.md** - iOS integration guide

---

**You're all set! 🚀**

Start with Step 1 and work through the checklist. Each step builds on the previous one.

