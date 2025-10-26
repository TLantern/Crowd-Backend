# Testing Guide - Windows

This guide shows you how to test the backend locally on Windows before deploying to production.

---

## Prerequisites

### 1. Check Node.js Installation

```powershell
node --version
```
Should show v18 or higher. ✅ You have v22.21.0

### 2. Check Firebase CLI Installation

```powershell
firebase --version
```
If not installed:
```powershell
npm install -g firebase-tools
```

### 3. Check Java Installation (Required for Emulators)

```powershell
java -version
```

If Java is not installed, download and install:
- **Download:** [OpenJDK 17 or higher](https://adoptium.net/)
- **Install:** Run the installer and check "Add to PATH"

After installing Java, restart your terminal and verify:
```powershell
java -version
```

---

## Quick Start

### 1. Run Unit Tests

Test the geohash utilities:

```powershell
npm test
```

This runs `functions/test-geohash.js` and verifies:
- ✅ Geohash encoding/decoding
- ✅ Distance calculations
- ✅ Geohash range queries
- ✅ Performance

### 2. Start Firebase Emulators

```powershell
npm start
```

This starts:
- 🔥 **Functions Emulator** (port 5001) - Test your Cloud Functions
- 🗄️ **Firestore Emulator** (port 8080) - Local database
- 🖥️ **Emulator UI** (port 4000) - Web interface to view data

The emulators will keep running until you press `Ctrl+C`.

### 3. Open Emulator UI

Once started, open your browser to:
```
http://localhost:4000
```

You'll see:
- Functions logs and execution
- Firestore data browser
- Request/response inspector

---

## Testing the New Features

### Test 1: Create an Event with Geohash

Using the Emulator UI:

1. Go to **Firestore** tab
2. Create a new document in `events` collection:

```json
{
  "id": "test-event-1",
  "title": "Test Music Festival",
  "hostId": "test-user-123",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radiusMeters": 60,
  "attendeeCount": 0,
  "signalStrength": 0,
  "peopleCount": 0,
  "tags": ["music", "test"],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

3. **Expected:** The `onEventCreate` trigger should add `geohash` field automatically

### Test 2: Test getNearbyEvents Cloud Function

Using PowerShell or a REST client:

```powershell
# Using curl (if installed) or Invoke-RestMethod
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

**Expected Response:**
```json
{
  "result": {
    "success": true,
    "events": [...],
    "count": 1
  }
}
```

### Test 3: Create a Signal with Auto-Computed Color/Radius

```powershell
$body = @{
    data = @{
        eventId = "test-event-1"
        latitude = 37.7750
        longitude = -122.4195
        signalStrength = 5
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5001/crowd-6193c/us-central1/createSignal" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

**Expected Response:**
```json
{
  "result": {
    "success": true,
    "signal": {
      "id": "...",
      "geohash": "9q8yyk",
      "peopleCount": 1,
      "color": "#FFD700",
      "radiusMeters": 75,
      ...
    }
  }
}
```

Check in Emulator UI:
1. Go to **Firestore** → `signals` collection
2. Verify the signal has:
   - ✅ `geohash` field
   - ✅ `peopleCount` = 1 (or higher if more signals nearby)
   - ✅ `color` = "#FFD700" (yellow, if < 10 people)
   - ✅ `radiusMeters` = 75

### Test 4: Test Color/Radius Updates

Create multiple signals in the same area to test automatic color/radius updates:

```powershell
# Create 30 signals in the same geohash area
for ($i = 1; $i -le 30; $i++) {
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
    
    Start-Sleep -Milliseconds 100
}
```

**Expected:**
- First 10 signals: Yellow (#FFD700), 75m radius
- Signals 11-25: Light red (#FF6B6B), 125m radius (when peopleCount > 25)
- After that: Check that existing signals update their color/radius automatically

### Test 5: Test getNearbySignals

```powershell
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

**Expected:** Returns all signals with computed color and radius, sorted by distance.

---

## Using Postman (Recommended)

For easier testing, use Postman:

1. **Download:** [Postman](https://www.postman.com/downloads/)
2. **Import this collection:**

Create a new collection with these requests:

### Collection: Crowd Backend Tests

#### Request 1: Get Nearby Events
- **Method:** POST
- **URL:** `http://localhost:5001/crowd-6193c/us-central1/getNearbyEvents`
- **Body (JSON):**
```json
{
  "data": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radiusKm": 10
  }
}
```

#### Request 2: Create Event
- **Method:** POST
- **URL:** `http://localhost:5001/crowd-6193c/us-central1/createEvent`
- **Body (JSON):**
```json
{
  "data": {
    "title": "Test Event",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radiusMeters": 60,
    "tags": ["test", "music"]
  }
}
```

#### Request 3: Create Signal
- **Method:** POST
- **URL:** `http://localhost:5001/crowd-6193c/us-central1/createSignal`
- **Body (JSON):**
```json
{
  "data": {
    "eventId": "test-event-1",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "signalStrength": 5
  }
}
```

#### Request 4: Get Nearby Signals
- **Method:** POST
- **URL:** `http://localhost:5001/crowd-6193c/us-central1/getNearbySignals`
- **Body (JSON):**
```json
{
  "data": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radiusKm": 5
  }
}
```

---

## Monitoring Logs

### View Function Execution Logs

In the emulator terminal, you'll see real-time logs like:

```
✔  functions: getNearbyEvents: http://localhost:5001/crowd-6193c/us-central1/getNearbyEvents
i  functions: Beginning execution of "getNearbyEvents"
>  Searching for events near (37.7749, -122.4194) within 10km using geohashes: 9q8yy, 9q8yv...
>  Found 5 events within 10km
i  functions: Finished "getNearbyEvents" in ~150ms
```

### View in Emulator UI

1. Go to http://localhost:4000
2. Click **Functions** → **Logs**
3. See detailed execution logs with timestamps

---

## Testing Real-Time Updates (Advanced)

To test Firestore real-time listeners, you'll need to connect your iOS app to the emulators:

### In your iOS app:

```swift
// In AppDelegate or App initialization
#if DEBUG
// Point to local emulators
Functions.functions().useEmulator(withHost: "localhost", port: 5001)
Firestore.firestore().useEmulator(withHost: "localhost", port: 8080)
Auth.auth().useEmulator(withHost: "localhost", port: 9099)
#endif
```

Then run your iOS app in the simulator and test:
1. Create signals from the app
2. Watch them appear in Emulator UI
3. Manually add/remove signals in Emulator UI
4. See updates in the app in real-time

---

## Troubleshooting

### Error: "Java not found"

**Solution:** Install Java (see Prerequisites section above)

### Error: "Port already in use"

**Solution:** Something is using the emulator ports. Find and close the process:

```powershell
# Find what's using port 5001
netstat -ano | findstr :5001

# Kill the process (replace PID with the number from above)
taskkill /PID <PID> /F
```

Or change the ports in `firebase.json`.

### Error: "Project not found"

**Solution:** Make sure you're in the project root directory and `firebase.json` exists.

### Emulators won't start

**Solution:**
1. Check Firebase CLI is updated: `npm install -g firebase-tools@latest`
2. Try starting with explicit project: `firebase emulators:start --project crowd-6193c`
3. Check logs for specific errors

### Functions not showing up in emulator

**Solution:**
1. Make sure you're in project root (not `functions/` directory)
2. Verify `functions/index.js` exports all functions
3. Check for syntax errors: `cd functions && npm run lint`

---

## Performance Benchmarks

When testing, you should see:

### Geohash Operations
- ✅ Encode: < 0.01ms per operation
- ✅ Decode: < 0.01ms per operation
- ✅ Range calculation: < 1ms

### Cloud Functions (Local Emulator)
- ✅ getNearbyEvents: 50-200ms (depends on result count)
- ✅ getNearbySignals: 50-200ms
- ✅ createSignal: 100-300ms (includes nearby recalculation)
- ✅ createEvent: 50-100ms

### Production (After Deployment)
Functions will be slower due to cold starts:
- First call: 1-3 seconds (cold start)
- Subsequent calls: 100-500ms (warm)

---

## Next Steps

After testing locally:

1. **All tests pass?** → Deploy to production:
   ```powershell
   npm run deploy
   ```

2. **Found issues?** → Check function logs and fix

3. **Ready for iOS integration?** → Update your iOS app to use production endpoints and test

4. **Want to add more tests?** → Add test scripts to `functions/test-*.js`

---

## Quick Command Reference

```powershell
# Run unit tests
npm test

# Start emulators
npm start

# Deploy to production
npm run deploy

# Deploy only functions
npm run deploy:functions

# View production logs
npm run logs

# Lint functions code
npm run lint
```

---

**Happy Testing! 🧪**

If you encounter any issues, check the `GEOHASH_IMPLEMENTATION_SUMMARY.md` for architecture details.

