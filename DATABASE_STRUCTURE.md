# Crowd App - Firebase Database Structure

## Overview

This document outlines the complete, organized database structure for the Crowd app with secure, auth-bound Firestore rules.

## Collections

### 1. Users Collection (`users`)

**Purpose:** Store user profiles and onboarding information.

**Document ID:** `userId` (matches Firebase Authentication UID)

**Fields:**
- `id`: string - User ID (matches document ID)
- `displayName`: string - User's display name (collected during onboarding)
- `interests`: array of strings - User interests (e.g., `["music", "sports", "technology"]`)
- `auraPoints`: integer - User's total aura points
- `createdAt`: timestamp - Account creation date
- `updatedAt`: timestamp - Last profile update

**Security Rules:**
- ✅ Users can only read their own profile
- ✅ Users can only create/update/delete their own profile
- ✅ All operations require authentication

**API Endpoints:**
- `POST /createUser` - Create user profile with displayName and interests
- `POST /updateUser` - Update user profile (including interests)
- `DELETE /deleteUser` - Delete user account
- `GET /getUser` - Get user profile

**Example Document:**
```json
{
  "id": "abc123",
  "displayName": "John Doe",
  "interests": ["music", "sports", "technology"],
  "auraPoints": 150,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### 2. Events Collection (`events`)

**Purpose:** Store location-based events created by users.

**Document ID:** Auto-generated or custom `eventId`

**Fields:**
- `id`: string - Event ID (matches document ID)
- `title`: string - Event title
- `hostId`: string - User ID of event creator
- `latitude`: number - Event location latitude (-90 to 90)
- `longitude`: number - Event location longitude (-180 to 180)
- `geohash`: string - Geohash encoding of location (6 characters, ~1.2km precision)
- `radiusMeters`: number - Event radius in meters (default: 60)
- `startsAt`: timestamp (nullable) - Event start time
- `endsAt`: timestamp (nullable) - Event end time
- `signalStrength`: integer - Average signal strength from attendees
- `attendeeCount`: integer - Number of participants
- `peopleCount`: integer - Number of people in the vicinity (tracked via signals)
- `tags`: array of strings - Event tags for categorization
- `createdAt`: timestamp - Event creation date
- `updatedAt`: timestamp - Last event update

**Security Rules:**
- ✅ Any authenticated user can read events (public discovery)
- ✅ Authenticated users can create events
- ✅ Only event host can update/delete their events

**API Endpoints:**
- `POST /createEvent` - Create a new event (automatically computes geohash)
- `POST /updateEvent` - Update event details (host only)
- `DELETE /deleteEvent` - Delete an event (host only)
- `GET /getEvent` - Get event details
- `POST /getEventsInRegion` - Get events by location (legacy bounding box)
- `POST /getNearbyEvents` - Get nearby events using geohash-based queries (recommended)

**Example Document:**
```json
{
  "id": "event123",
  "title": "Music Festival",
  "hostId": "abc123",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "geohash": "9q8yyk",
  "radiusMeters": 60,
  "startsAt": "2024-01-15T18:00:00Z",
  "endsAt": "2024-01-15T23:00:00Z",
  "signalStrength": 4,
  "attendeeCount": 25,
  "peopleCount": 35,
  "tags": ["music", "festival", "outdoor"],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### 3. Signals Collection (`signals`)

**Purpose:** Track user participation and signal strength at events with automatic color/radius computation.

**Document ID:** Auto-generated or custom `signalId`

**Fields:**
- `id`: string - Signal ID (matches document ID)
- `userId`: string - User ID sending the signal
- `eventId`: string - Event ID being signaled
- `latitude`: number - Signal location latitude (user's location)
- `longitude`: number - Signal location longitude (user's location)
- `geohash`: string - Geohash encoding of location (6 characters)
- `signalStrength`: integer - Signal strength (1-5)
- `peopleCount`: integer - Number of people in the area (auto-computed)
- `color`: string - Hex color code based on peopleCount (auto-computed)
- `radiusMeters`: integer - Display radius in meters based on peopleCount (auto-computed)
- `createdAt`: timestamp - Signal creation date
- `updatedAt`: timestamp - Last signal update

**Color and Radius Logic:**
- **> 50 people**: `color: "#8B0000"` (deep red), `radiusMeters: 200`
- **> 25 people**: `color: "#FF6B6B"` (light red), `radiusMeters: 125`
- **< 10 people**: `color: "#FFD700"` (yellow), `radiusMeters: 75`

**Security Rules:**
- ✅ Authenticated users can read signals
- ✅ Users can only create signals for themselves
- ✅ Users can only update/delete their own signals

**API Endpoints:**
- `POST /createSignal` - Signal participation in event (requires lat/lng, auto-computes geohash, peopleCount, color, radius)
- `POST /updateSignal` - Update signal strength
- `DELETE /deleteSignal` - Remove signal
- `GET /getSignal` - Get signal details
- `POST /getSignalsForEvent` - Get all signals for an event
- `POST /getNearbySignals` - Get nearby signals using geohash-based queries (recommended)

**Automatic Triggers:**
- Updates event's attendeeCount and signalStrength
- Awards 10 aura points for event participation
- Recalculates color/radius for nearby signals when peopleCount changes
- Real-time updates propagate to all clients via Firestore listeners

**Example Document:**
```json
{
  "id": "signal123",
  "userId": "abc123",
  "eventId": "event123",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "geohash": "9q8yyk",
  "signalStrength": 5,
  "peopleCount": 35,
  "color": "#FF6B6B",
  "radiusMeters": 125,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### 4. Points Collection (`points`)

**Purpose:** Store aura points transaction history for users.

**Document ID:** Auto-generated or custom `pointId`

**Fields:**
- `id`: string - Point transaction ID (matches document ID)
- `userId`: string - User receiving points
- `points`: integer - Number of points (positive only)
- `reason`: string - Reason for points (e.g., "Welcome bonus", "Event creation bonus")
- `createdAt`: timestamp - Transaction date
- `updatedAt`: timestamp - Last update

**Security Rules:**
- ✅ Users can only read their own points
- ✅ Points are typically created via Cloud Functions (system-controlled)
- ✅ Manual deletion is prevented for audit trail

**API Endpoints:**
- `POST /createPoint` - Award points (authenticated users)
- `GET /getPoint` - Get point transaction details
- `GET /getUserPoints` - Get user's point history

**Automatic Points Awards:**
- **100 points** - Welcome bonus (new user)
- **50 points** - Event creation bonus
- **10 points** - Event participation bonus

**Example Document:**
```json
{
  "id": "point123",
  "userId": "abc123",
  "points": 50,
  "reason": "Event creation bonus",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

## Security Model

### Authentication Requirements
All collections require Firebase Authentication. Anonymous access is not permitted.

### Ownership Rules
- **Users**: Can only access their own user document
- **Events**: Public read, but only hosts can modify their events
- **Signals**: Users can only modify their own signals
- **Points**: Read-only for users, write via Cloud Functions

### Data Validation
All writes are validated with helper functions that check:
- Required fields are present
- Data types are correct
- Values are within valid ranges
- User ownership is maintained

---

## Database Indexes

The following composite indexes are configured for optimal query performance:

1. **Events by Location and Time** (Legacy)
   - Fields: latitude (ASC), longitude (ASC), createdAt (DESC)

2. **Events by Host**
   - Fields: hostId (ASC), createdAt (DESC)

3. **Events by Geohash** (Recommended for spatial queries)
   - Fields: geohash (ASC), createdAt (DESC)

4. **Signals by Event**
   - Fields: eventId (ASC), createdAt (DESC)

5. **Signals by User**
   - Fields: userId (ASC), createdAt (DESC)

6. **Signals by Geohash** (Recommended for spatial queries)
   - Fields: geohash (ASC), createdAt (DESC)

7. **Points by User**
   - Fields: userId (ASC), createdAt (DESC)

---

## User Onboarding Flow

When a new user signs up, the following data is collected and stored:

1. **Display Name** (required)
   - Stored in `displayName` field
   - Must be a non-empty string

2. **Interests** (optional)
   - Stored as array of strings in `interests` field
   - Examples: `["music", "sports", "technology", "art", "gaming"]`
   - Can be empty array if user skips this step
   - Can be updated later via `updateUser` endpoint

**Onboarding Example:**
```javascript
// Frontend call to create user with onboarding data
createUser({
  displayName: "John Doe",
  interests: ["music", "sports", "technology"]
})
```

---

## Cloud Functions Triggers

### User Lifecycle
- **onUserCreate**: Initializes user with 100 welcome bonus points
- **onUserUpdate**: Logs significant profile changes
- **onUserDelete**: Cleans up related signals and points

### Event Lifecycle
- **onEventCreate**: Awards 50 points to event host
- **onEventUpdate**: Logs event changes
- **onEventDelete**: Cleans up related signals

### Signal Lifecycle
- **onSignalCreate**: Updates event stats, awards 10 points, recalculates nearby signals' color/radius
- **onSignalUpdate**: Recalculates event signal strength
- **onSignalDelete**: Updates event stats, recalculates nearby signals' color/radius

### Points Lifecycle
- **onPointCreate**: Updates user's total auraPoints
- **onPointUpdate**: Adjusts user's auraPoints by difference
- **onPointDelete**: Decreases user's auraPoints

---

## Geohash-Based Spatial Queries

### Overview

The backend uses **geohash encoding** to enable efficient spatial queries for finding nearby events and signals. Geohash converts 2D coordinates (latitude/longitude) into a single string that preserves spatial locality.

### How It Works

1. **Encoding**: When an event or signal is created, the backend automatically computes a geohash from the lat/lng coordinates
2. **Precision**: We use 6-character geohashes (~1.2km × 600m cells) for storage
3. **Query**: To find nearby items, we calculate geohash ranges that cover the search area
4. **Filter**: Results are filtered by exact distance using the Haversine formula

### Geohash Precision Levels

| Precision | Cell Size (width × height) | Use Case |
|-----------|---------------------------|----------|
| 2 chars   | ~1,250km × 625km         | Countries |
| 3 chars   | ~156km × 156km           | Large regions |
| 4 chars   | ~39km × 19.5km           | Cities |
| 5 chars   | ~4.9km × 4.9km           | Districts |
| 6 chars   | ~1.2km × 600m            | **Default (events/signals)** |
| 7 chars   | ~153m × 153m             | Blocks |
| 8 chars   | ~38m × 19m               | Buildings |

### Example Queries

#### Fetch Nearby Events (iOS)

```swift
// User's location
let latitude = 37.7749
let longitude = -122.4194
let radiusKm = 5.0

// Call Cloud Function
functions.httpsCallable("getNearbyEvents").call([
    "latitude": latitude,
    "longitude": longitude,
    "radiusKm": radiusKm
]) { result, error in
    // Handle response
}
```

Backend automatically:
1. Calculates geohash for user's location
2. Generates neighbor geohashes to cover the search radius
3. Queries Firestore using geohash prefix matches
4. Filters by exact distance and sorts by proximity

#### Fetch Nearby Signals (iOS)

```swift
functions.httpsCallable("getNearbySignals").call([
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radiusKm": 5.0
]) { result, error in
    // Returns signals with color and radiusMeters for map display
}
```

### Real-Time Updates

Use Firestore snapshot listeners to receive real-time updates:

```swift
db.collection("signals")
    .whereField("geohash", isGreaterThanOrEqualTo: geohashPrefix)
    .whereField("geohash", isLessThanOrEqualTo: geohashPrefix + "\u{f8ff}")
    .addSnapshotListener { snapshot, error in
        // Handle .added, .modified, .removed events
    }
```

When signals are created/deleted, the backend automatically:
- Recalculates `peopleCount` for nearby signals
- Updates `color` and `radiusMeters` based on new peopleCount
- Triggers real-time updates to all listening clients

### Color and Radius Computation

The backend automatically computes visual properties for signals:

```javascript
// Backend logic (automatic)
function calculateColorAndRadius(peopleCount) {
  if (peopleCount > 50) {
    return { color: '#8B0000', radiusMeters: 200 }; // Deep red
  } else if (peopleCount > 25) {
    return { color: '#FF6B6B', radiusMeters: 125 }; // Light red
  } else {
    return { color: '#FFD700', radiusMeters: 75 };  // Yellow
  }
}
```

Your iOS app just displays the precomputed values - no client-side calculation needed.

### Benefits

1. **Performance**: Indexed geohash queries are much faster than coordinate-based queries
2. **Scalability**: Efficient even with millions of events/signals
3. **Real-Time**: Firestore listeners provide instant updates when data changes
4. **Automatic**: Backend handles all computation; frontend just displays results
5. **Accurate**: Haversine formula ensures precise distance calculations

### Migration Note

Existing events/signals without geohash fields will need to be migrated. New documents automatically include geohash when created through the API.

---

## Recent Changes

### Geohash Implementation (Latest)

**Added:**
- **Geohash utility functions** (`functions/geohash.js`)
  - `encodeGeohash()` - Convert lat/lng to geohash string
  - `decodeGeohash()` - Convert geohash back to coordinates
  - `getGeohashRange()` - Calculate geohash ranges for radius queries
  - `calculateDistance()` - Haversine distance formula

- **Events Collection**:
  - `geohash` field (string, 6 chars) - Auto-computed from lat/lng
  - `peopleCount` field (integer) - Track nearby people
  - `getNearbyEvents` Cloud Function - Efficient geohash-based spatial queries

- **Signals Collection**:
  - `latitude` and `longitude` fields (required for creation)
  - `geohash` field (string, 6 chars) - Auto-computed
  - `peopleCount` field (integer) - Count of people in area
  - `color` field (string, hex) - Auto-computed: #FFD700 (yellow), #FF6B6B (light red), #8B0000 (deep red)
  - `radiusMeters` field (integer) - Auto-computed: 75, 125, or 200 based on peopleCount
  - `getNearbySignals` Cloud Function - Efficient geohash-based queries
  - `recalculateNearbySignals()` helper - Automatically updates color/radius when peopleCount changes

- **Firestore Rules**:
  - Updated `isValidEventData()` to allow `geohash` and `peopleCount` fields
  - Updated `isValidSignalData()` to allow new location and display fields

- **Firestore Indexes**:
  - Composite index: `events.geohash` (ASC) + `createdAt` (DESC)
  - Composite index: `signals.geohash` (ASC) + `createdAt` (DESC)

- **Swift Integration Examples**:
  - `swift-examples/README.md` - Comprehensive integration guide
  - `swift-examples/GeohashUtils.swift` - Swift geohash utilities
  - `swift-examples/FirebaseManager.swift` - Complete iOS integration example
  - Real-time listener examples
  - MapKit visualization examples

**Functionality:**
- Automatic geohash encoding on event/signal creation
- Efficient spatial queries using geohash prefix matching
- Real-time color/radius updates based on peopleCount
- Automatic recalculation of nearby signals when signals are added/removed
- Push-based real-time updates via Firestore snapshot listeners

**Performance:**
- Geohash queries are indexed and highly efficient
- Supports millions of events/signals
- Real-time updates propagate instantly to all clients
- No client-side computation needed for color/radius

**Backward Compatibility:**
- Legacy `getEventsInRegion` endpoint still available
- Existing events/signals without geohash can be migrated
- New API endpoints are additive (non-breaking)

**Migration:**
- New events automatically include `geohash` and `peopleCount` fields
- New signals automatically compute `geohash`, `peopleCount`, `color`, and `radiusMeters`
- Existing documents may need migration to include new fields

---

### Onboarding Fields Update

**Added:**
- `interests` field to Users collection
- Validation for interests array in Firestore rules
- Validation for interests in createUser and updateUser functions

**Security:**
- Interests field is optional but must be an array if present
- All array elements must be strings
- Follows existing auth-bound security model

**Backward Compatibility:**
- Existing users without interests field will continue to work
- Frontend can gradually adopt interests field
- API endpoints remain unchanged

