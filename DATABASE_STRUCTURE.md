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
- `radiusMeters`: number - Event radius in meters (default: 60)
- `startsAt`: timestamp (nullable) - Event start time
- `endsAt`: timestamp (nullable) - Event end time
- `signalStrength`: integer - Average signal strength from attendees
- `attendeeCount`: integer - Number of participants
- `tags`: array of strings - Event tags for categorization
- `createdAt`: timestamp - Event creation date
- `updatedAt`: timestamp - Last event update

**Security Rules:**
- ✅ Any authenticated user can read events (public discovery)
- ✅ Authenticated users can create events
- ✅ Only event host can update/delete their events

**API Endpoints:**
- `POST /createEvent` - Create a new event
- `POST /updateEvent` - Update event details (host only)
- `DELETE /deleteEvent` - Delete an event (host only)
- `GET /getEvent` - Get event details
- `POST /getEventsInRegion` - Get events by location

**Example Document:**
```json
{
  "id": "event123",
  "title": "Music Festival",
  "hostId": "abc123",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radiusMeters": 60,
  "startsAt": "2024-01-15T18:00:00Z",
  "endsAt": "2024-01-15T23:00:00Z",
  "signalStrength": 4,
  "attendeeCount": 25,
  "tags": ["music", "festival", "outdoor"],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

### 3. Signals Collection (`signals`)

**Purpose:** Track user participation and signal strength at events.

**Document ID:** Auto-generated or custom `signalId`

**Fields:**
- `id`: string - Signal ID (matches document ID)
- `userId`: string - User ID sending the signal
- `eventId`: string - Event ID being signaled
- `signalStrength`: integer - Signal strength (1-5)
- `createdAt`: timestamp - Signal creation date
- `updatedAt`: timestamp - Last signal update

**Security Rules:**
- ✅ Authenticated users can read signals
- ✅ Users can only create signals for themselves
- ✅ Users can only update/delete their own signals

**API Endpoints:**
- `POST /createSignal` - Signal participation in event
- `POST /updateSignal` - Update signal strength
- `DELETE /deleteSignal` - Remove signal
- `GET /getSignal` - Get signal details
- `POST /getSignalsForEvent` - Get all signals for an event

**Automatic Triggers:**
- Updates event's attendeeCount and signalStrength
- Awards 10 aura points for event participation

**Example Document:**
```json
{
  "id": "signal123",
  "userId": "abc123",
  "eventId": "event123",
  "signalStrength": 5,
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

1. **Events by Location and Time**
   - Fields: latitude (ASC), longitude (ASC), createdAt (DESC)

2. **Events by Host**
   - Fields: hostId (ASC), createdAt (DESC)

3. **Signals by Event**
   - Fields: eventId (ASC), createdAt (DESC)

4. **Signals by User**
   - Fields: userId (ASC), createdAt (DESC)

5. **Points by User**
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
- **onSignalCreate**: Updates event stats, awards 10 points
- **onSignalUpdate**: Recalculates event signal strength
- **onSignalDelete**: Updates event stats

### Points Lifecycle
- **onPointCreate**: Updates user's total auraPoints
- **onPointUpdate**: Adjusts user's auraPoints by difference
- **onPointDelete**: Decreases user's auraPoints

---

## Recent Changes

### Onboarding Fields Update (Latest)

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

