/**
 * Events Collection Functions
 * Handles CRUD operations and triggers for event data
 */

const functions = require("firebase-functions");
const functionsV1 = require("firebase-functions/v1");
const admin = require("firebase-admin");
const {encodeGeohash, getGeohashRange, calculateDistance} = require('./geohash');

const db = admin.firestore();

/**
 * Create a new event
 * HTTP endpoint: POST /createEvent
 */
exports.createEvent = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const hostId = context.auth.uid;
    const eventId = data.id || admin.firestore().collection('events').doc().id;

    // Generate geohash from coordinates
    const geohash = encodeGeohash(data.latitude, data.longitude, 6);

    const eventData = {
      id: eventId,
      title: data.title,
      hostId: hostId,
      latitude: data.latitude,
      longitude: data.longitude,
      geohash: geohash,
      radiusMeters: data.radiusMeters || 60,
      startsAt: data.startsAt ? admin.firestore.Timestamp.fromDate(new Date(data.startsAt)) : null,
      endsAt: data.endsAt ? admin.firestore.Timestamp.fromDate(new Date(data.endsAt)) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      signalStrength: 0,
      attendeeCount: 0,
      peopleCount: 0,
      tags: data.tags || [],
    };

    // Validate required fields
    if (!eventData.title || !eventData.latitude || !eventData.longitude) {
      throw new functions.https.HttpsError('invalid-argument', 'Title, latitude, and longitude are required');
    }

    // Validate coordinates
    if (eventData.latitude < -90 || eventData.latitude > 90) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid latitude');
    }
    if (eventData.longitude < -180 || eventData.longitude > 180) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid longitude');
    }

    // Create event document
    await db.collection('events').doc(eventId).set(eventData);

    return {
      success: true,
      eventId: eventId,
      event: eventData,
    };
  } catch (error) {
    console.error('Error creating event:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create event');
  }
});

/**
 * Update event data
 * HTTP endpoint: PUT /updateEvent
 */
exports.updateEvent = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const eventId = data.id;

    if (!eventId) {
      throw new functions.https.HttpsError('invalid-argument', 'Event ID is required');
    }

    // Check if user is the host of the event
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Event not found');
    }

    const eventData = eventDoc.data();
    if (eventData.hostId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only the event host can update the event');
    }

    const updateData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.hostId;

    // Convert dates if provided
    if (updateData.startsAt) {
      updateData.startsAt = admin.firestore.Timestamp.fromDate(new Date(updateData.startsAt));
    }
    if (updateData.endsAt) {
      updateData.endsAt = admin.firestore.Timestamp.fromDate(new Date(updateData.endsAt));
    }

    // Update event document
    await db.collection('events').doc(eventId).update(updateData);

    // Get updated event data
    const updatedEventDoc = await db.collection('events').doc(eventId).get();
    const updatedEvent = updatedEventDoc.data();

    return {
      success: true,
      event: updatedEvent,
    };
  } catch (error) {
    console.error('Error updating event:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update event');
  }
});

/**
 * Delete event
 * HTTP endpoint: DELETE /deleteEvent
 */
exports.deleteEvent = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const eventId = data.id;

    if (!eventId) {
      throw new functions.https.HttpsError('invalid-argument', 'Event ID is required');
    }

    // Check if user is the host of the event
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Event not found');
    }

    const eventData = eventDoc.data();
    if (eventData.hostId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only the event host can delete the event');
    }

    // Delete event document
    await db.collection('events').doc(eventId).delete();

    return {
      success: true,
      message: 'Event deleted successfully',
    };
  } catch (error) {
    console.error('Error deleting event:', error);
    throw new functions.https.HttpsError('internal', 'Failed to delete event');
  }
});

/**
 * Get event data
 * HTTP endpoint: GET /getEvent
 */
exports.getEvent = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const eventId = data.id;

    if (!eventId) {
      throw new functions.https.HttpsError('invalid-argument', 'Event ID is required');
    }

    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Event not found');
    }

    return {
      success: true,
      event: eventDoc.data(),
    };
  } catch (error) {
    console.error('Error getting event:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get event');
  }
});

/**
 * Get events in a region (legacy bounding box approach)
 * HTTP endpoint: GET /getEventsInRegion
 */
exports.getEventsInRegion = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { latitude, longitude, radiusKm = 10 } = data;

    if (!latitude || !longitude) {
      throw new functions.https.HttpsError('invalid-argument', 'Latitude and longitude are required');
    }

    // Convert radius from km to meters
    const radiusMeters = radiusKm * 1000;

    // Calculate bounding box for efficient querying
    const latRange = radiusMeters / 111000; // Rough conversion: 1 degree ≈ 111km
    const lngRange = radiusMeters / (111000 * Math.cos(latitude * Math.PI / 180));

    const eventsSnapshot = await db.collection('events')
      .where('latitude', '>=', latitude - latRange)
      .where('latitude', '<=', latitude + latRange)
      .where('longitude', '>=', longitude - lngRange)
      .where('longitude', '<=', longitude + lngRange)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const events = [];
    eventsSnapshot.forEach(doc => {
      const eventData = doc.data();
      // Calculate exact distance for filtering
      const distance = calculateDistance(latitude, longitude, eventData.latitude, eventData.longitude);
      if (distance <= radiusKm) {
        events.push(eventData);
      }
    });

    return {
      success: true,
      events: events,
    };
  } catch (error) {
    console.error('Error getting events in region:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get events in region');
  }
});

/**
 * Get nearby events using geohash-based queries
 * This is more efficient than the bounding box approach for spatial queries
 * HTTP endpoint: POST /getNearbyEvents
 */
exports.getNearbyEvents = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { latitude, longitude, radiusKm = 10 } = data;

    if (!latitude || !longitude) {
      throw new functions.https.HttpsError('invalid-argument', 'Latitude and longitude are required');
    }

    // Get geohash ranges that cover the search area
    const geohashRanges = getGeohashRange(latitude, longitude, radiusKm);

    console.log(`Searching for events near (${latitude}, ${longitude}) within ${radiusKm}km using geohashes: ${geohashRanges.join(', ')}`);

    // Query events using geohash prefixes
    const eventPromises = geohashRanges.map(async (geohashPrefix) => {
      const snapshot = await db.collection('events')
        .where('geohash', '>=', geohashPrefix)
        .where('geohash', '<=', geohashPrefix + '\uf8ff')
        .get();
      return snapshot.docs.map(doc => doc.data());
    });

    const eventArrays = await Promise.all(eventPromises);
    const allEvents = eventArrays.flat();

    // Remove duplicates (events might appear in multiple geohash ranges)
    const uniqueEvents = Array.from(
      new Map(allEvents.map(event => [event.id, event])).values()
    );

    // Filter by exact distance and add distance field
    const eventsWithDistance = uniqueEvents
      .map(event => {
        const distance = calculateDistance(
          latitude,
          longitude,
          event.latitude,
          event.longitude
        );
        return { ...event, distance };
      })
      .filter(event => event.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance); // Sort by distance

    console.log(`Found ${eventsWithDistance.length} events within ${radiusKm}km`);

    return {
      success: true,
      events: eventsWithDistance,
      count: eventsWithDistance.length,
    };
  } catch (error) {
    console.error('Error getting nearby events:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get nearby events');
  }
});

/**
 * Trigger: When an event is created
 * Logs event creation and performs initial setup
 */
exports.onEventCreate = functionsV1.firestore
  .document("events/{eventId}")
  .onCreate(async (snap, context) => {
    try {
      const eventData = snap.data();
      const eventId = context.params.eventId;

      console.log(`New event created: ${eventId} by ${eventData.hostId}`);

      // Award points to the event host
      await db.collection('points').add({
        userId: eventData.hostId,
        points: 50, // Event creation bonus
        reason: 'Event creation bonus',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update host's aura points
      await db.collection('users').doc(eventData.hostId).update({
        auraPoints: admin.firestore.FieldValue.increment(50),
      });

      console.log(`Event ${eventId} created and host awarded bonus points`);
    } catch (error) {
      console.error('Error in onEventCreate trigger:', error);
    }
  });

/**
 * Trigger: When an event is updated
 * Logs event updates and performs any necessary side effects
 */
exports.onEventUpdate = functionsV1.firestore
  .document("events/{eventId}")
  .onUpdate(async (change, context) => {
    try {
      const beforeData = change.before.data();
      const afterData = change.after.data();
      const eventId = context.params.eventId;

      console.log(`Event updated: ${eventId}`);

      // Log significant changes
      if (beforeData.title !== afterData.title) {
        console.log(`Event ${eventId} title changed from "${beforeData.title}" to "${afterData.title}"`);
      }

      if (beforeData.attendeeCount !== afterData.attendeeCount) {
        console.log(`Event ${eventId} attendee count changed from ${beforeData.attendeeCount} to ${afterData.attendeeCount}`);
      }
    } catch (error) {
      console.error('Error in onEventUpdate trigger:', error);
    }
  });

/**
 * Trigger: When an event is deleted
 * Cleans up related data and logs the deletion
 */
exports.onEventDelete = functionsV1.firestore
  .document("events/{eventId}")
  .onDelete(async (snap, context) => {
    try {
      const eventData = snap.data();
      const eventId = context.params.eventId;

      console.log(`Event deleted: ${eventId}`);

      // Clean up event's signals
      const signalsSnapshot = await db.collection('signals')
        .where('eventId', '==', eventId)
        .get();

      const batch = db.batch();
      signalsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      console.log(`Cleaned up signals for deleted event: ${eventId}`);
    } catch (error) {
      console.error('Error in onEventDelete trigger:', error);
    }
  });
