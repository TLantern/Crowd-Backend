/**
 * Signals Collection Functions
 * Handles CRUD operations and triggers for signal data
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const {encodeGeohash, getGeohashRange, calculateDistance} = require('./geohash');

const db = admin.firestore();

/**
 * Calculate color and radius based on people count
 * @param {number} peopleCount - Number of people in the area
 * @returns {object} Object with color (hex string) and radiusMeters (number)
 */
function calculateColorAndRadius(peopleCount) {
  if (peopleCount > 50) {
    return {
      color: '#8B0000', // Deep red
      radiusMeters: 200,
    };
  } else if (peopleCount > 25) {
    return {
      color: '#FF6B6B', // Light red
      radiusMeters: 125,
    };
  } else {
    return {
      color: '#FFD700', // Yellow
      radiusMeters: 75,
    };
  }
}

/**
 * Create a new signal
 * HTTP endpoint: POST /createSignal
 */
exports.createSignal = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const signalId = data.id || admin.firestore().collection('signals').doc().id;

    // Validate required fields
    if (!data.eventId) {
      throw new functions.https.HttpsError('invalid-argument', 'Event ID is required');
    }

    if (!data.latitude || !data.longitude) {
      throw new functions.https.HttpsError('invalid-argument', 'Latitude and longitude are required');
    }

    // Validate coordinates
    if (data.latitude < -90 || data.latitude > 90) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid latitude');
    }
    if (data.longitude < -180 || data.longitude > 180) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid longitude');
    }

    // Validate signal strength
    const signalStrength = data.signalStrength || 1;
    if (signalStrength < 1 || signalStrength > 5) {
      throw new functions.https.HttpsError('invalid-argument', 'Signal strength must be between 1 and 5');
    }

    // Check if event exists
    const eventDoc = await db.collection('events').doc(data.eventId).get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Event not found');
    }

    // Check if user already has a signal for this event
    const existingSignal = await db.collection('signals')
      .where('userId', '==', userId)
      .where('eventId', '==', data.eventId)
      .get();

    if (!existingSignal.empty) {
      throw new functions.https.HttpsError('already-exists', 'User already has a signal for this event');
    }

    // Generate geohash from coordinates
    const geohash = encodeGeohash(data.latitude, data.longitude, 6);

    // Count nearby people (signals within ~1.2km)
    const nearbySignals = await db.collection('signals')
      .where('geohash', '>=', geohash.substring(0, 5))
      .where('geohash', '<=', geohash.substring(0, 5) + '\uf8ff')
      .get();

    const peopleCount = nearbySignals.size + 1; // Include this new signal

    // Calculate color and radius based on people count
    const {color, radiusMeters} = calculateColorAndRadius(peopleCount);

    const signalData = {
      id: signalId,
      userId: userId,
      eventId: data.eventId,
      latitude: data.latitude,
      longitude: data.longitude,
      geohash: geohash,
      signalStrength: signalStrength,
      peopleCount: peopleCount,
      color: color,
      radiusMeters: radiusMeters,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Create signal document
    await db.collection('signals').doc(signalId).set(signalData);

    return {
      success: true,
      signalId: signalId,
      signal: signalData,
    };
  } catch (error) {
    console.error('Error creating signal:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create signal');
  }
});

/**
 * Update signal data
 * HTTP endpoint: PUT /updateSignal
 */
exports.updateSignal = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const signalId = data.id;

    if (!signalId) {
      throw new functions.https.HttpsError('invalid-argument', 'Signal ID is required');
    }

    // Check if signal exists and belongs to user
    const signalDoc = await db.collection('signals').doc(signalId).get();
    if (!signalDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Signal not found');
    }

    const signalData = signalDoc.data();
    if (signalData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only the signal owner can update the signal');
    }

    const updateData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.userId;
    delete updateData.eventId;

    // Validate signal strength if provided
    if (updateData.signalStrength && (updateData.signalStrength < 1 || updateData.signalStrength > 5)) {
      throw new functions.https.HttpsError('invalid-argument', 'Signal strength must be between 1 and 5');
    }

    // Update signal document
    await db.collection('signals').doc(signalId).update(updateData);

    // Get updated signal data
    const updatedSignalDoc = await db.collection('signals').doc(signalId).get();
    const updatedSignal = updatedSignalDoc.data();

    return {
      success: true,
      signal: updatedSignal,
    };
  } catch (error) {
    console.error('Error updating signal:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update signal');
  }
});

/**
 * Delete signal
 * HTTP endpoint: DELETE /deleteSignal
 */
exports.deleteSignal = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const signalId = data.id;

    if (!signalId) {
      throw new functions.https.HttpsError('invalid-argument', 'Signal ID is required');
    }

    // Check if signal exists and belongs to user
    const signalDoc = await db.collection('signals').doc(signalId).get();
    if (!signalDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Signal not found');
    }

    const signalData = signalDoc.data();
    if (signalData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only the signal owner can delete the signal');
    }

    // Delete signal document
    await db.collection('signals').doc(signalId).delete();

    return {
      success: true,
      message: 'Signal deleted successfully',
    };
  } catch (error) {
    console.error('Error deleting signal:', error);
    throw new functions.https.HttpsError('internal', 'Failed to delete signal');
  }
});

/**
 * Get signal data
 * HTTP endpoint: GET /getSignal
 */
exports.getSignal = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const signalId = data.id;

    if (!signalId) {
      throw new functions.https.HttpsError('invalid-argument', 'Signal ID is required');
    }

    const signalDoc = await db.collection('signals').doc(signalId).get();

    if (!signalDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Signal not found');
    }

    return {
      success: true,
      signal: signalDoc.data(),
    };
  } catch (error) {
    console.error('Error getting signal:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get signal');
  }
});

/**
 * Get signals for a specific event
 * HTTP endpoint: GET /getSignalsForEvent
 */
exports.getSignalsForEvent = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const eventId = data.eventId;

    if (!eventId) {
      throw new functions.https.HttpsError('invalid-argument', 'Event ID is required');
    }

    // Check if event exists
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Event not found');
    }

    const signalsSnapshot = await db.collection('signals')
      .where('eventId', '==', eventId)
      .orderBy('createdAt', 'desc')
      .get();

    const signals = [];
    signalsSnapshot.forEach(doc => {
      signals.push(doc.data());
    });

    return {
      success: true,
      signals: signals,
    };
  } catch (error) {
    console.error('Error getting signals for event:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get signals for event');
  }
});

/**
 * Get nearby signals using geohash-based queries
 * Returns signals with computed color and radius for map rendering
 * HTTP endpoint: POST /getNearbySignals
 */
exports.getNearbySignals = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { latitude, longitude, radiusKm = 5 } = data;

    if (!latitude || !longitude) {
      throw new functions.https.HttpsError('invalid-argument', 'Latitude and longitude are required');
    }

    // Get geohash ranges that cover the search area
    const geohashRanges = getGeohashRange(latitude, longitude, radiusKm);

    console.log(`Searching for signals near (${latitude}, ${longitude}) within ${radiusKm}km using geohashes: ${geohashRanges.join(', ')}`);

    // Query signals using geohash prefixes
    const signalPromises = geohashRanges.map(async (geohashPrefix) => {
      const snapshot = await db.collection('signals')
        .where('geohash', '>=', geohashPrefix)
        .where('geohash', '<=', geohashPrefix + '\uf8ff')
        .get();
      return snapshot.docs.map(doc => doc.data());
    });

    const signalArrays = await Promise.all(signalPromises);
    const allSignals = signalArrays.flat();

    // Remove duplicates (signals might appear in multiple geohash ranges)
    const uniqueSignals = Array.from(
      new Map(allSignals.map(signal => [signal.id, signal])).values()
    );

    // Filter by exact distance and add distance field
    const signalsWithDistance = uniqueSignals
      .map(signal => {
        const distance = calculateDistance(
          latitude,
          longitude,
          signal.latitude,
          signal.longitude
        );
        return { ...signal, distance };
      })
      .filter(signal => signal.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance); // Sort by distance

    console.log(`Found ${signalsWithDistance.length} signals within ${radiusKm}km`);

    return {
      success: true,
      signals: signalsWithDistance,
      count: signalsWithDistance.length,
    };
  } catch (error) {
    console.error('Error getting nearby signals:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get nearby signals');
  }
});

/**
 * Trigger: When a signal is created
 * Updates event attendee count, signal strength, and nearby signals' color/radius
 */
exports.onSignalCreate = functions.firestore
  .document('signals/{signalId}')
  .onCreate(async (snap, context) => {
    try {
      const signalData = snap.data();
      const signalId = context.params.signalId;
      const eventId = signalData.eventId;

      console.log(`New signal created: ${signalId} for event ${eventId}`);

      // Update event attendee count
      await db.collection('events').doc(eventId).update({
        attendeeCount: admin.firestore.FieldValue.increment(1),
      });

      // Calculate new signal strength for the event
      const signalsSnapshot = await db.collection('signals')
        .where('eventId', '==', eventId)
        .get();

      let totalSignalStrength = 0;
      let signalCount = 0;

      signalsSnapshot.forEach(doc => {
        const signal = doc.data();
        totalSignalStrength += signal.signalStrength;
        signalCount++;
      });

      const averageSignalStrength = signalCount > 0 ? Math.round(totalSignalStrength / signalCount) : 0;

      // Update event signal strength
      await db.collection('events').doc(eventId).update({
        signalStrength: averageSignalStrength,
      });

      // Award points to the user for joining an event
      await db.collection('points').add({
        userId: signalData.userId,
        points: 10, // Event participation bonus
        reason: 'Event participation bonus',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update user's aura points
      await db.collection('users').doc(signalData.userId).update({
        auraPoints: admin.firestore.FieldValue.increment(10),
      });

      // Recalculate color/radius for nearby signals
      await recalculateNearbySignals(signalData.geohash);

      console.log(`Signal ${signalId} created, event ${eventId} updated with new attendee count and signal strength`);
    } catch (error) {
      console.error('Error in onSignalCreate trigger:', error);
    }
  });

/**
 * Trigger: When a signal is updated
 * Recalculates event signal strength
 */
exports.onSignalUpdate = functions.firestore
  .document('signals/{signalId}')
  .onUpdate(async (change, context) => {
    try {
      const beforeData = change.before.data();
      const afterData = change.after.data();
      const signalId = context.params.signalId;
      const eventId = afterData.eventId;

      console.log(`Signal updated: ${signalId}`);

      // Only recalculate if signal strength changed
      if (beforeData.signalStrength !== afterData.signalStrength) {
        // Calculate new signal strength for the event
        const signalsSnapshot = await db.collection('signals')
          .where('eventId', '==', eventId)
          .get();

        let totalSignalStrength = 0;
        let signalCount = 0;

        signalsSnapshot.forEach(doc => {
          const signal = doc.data();
          totalSignalStrength += signal.signalStrength;
          signalCount++;
        });

        const averageSignalStrength = signalCount > 0 ? Math.round(totalSignalStrength / signalCount) : 0;

        // Update event signal strength
        await db.collection('events').doc(eventId).update({
          signalStrength: averageSignalStrength,
        });

        console.log(`Event ${eventId} signal strength updated to ${averageSignalStrength}`);
      }
    } catch (error) {
      console.error('Error in onSignalUpdate trigger:', error);
    }
  });

/**
 * Trigger: When a signal is deleted
 * Updates event attendee count, signal strength, and nearby signals' color/radius
 */
exports.onSignalDelete = functions.firestore
  .document('signals/{signalId}')
  .onDelete(async (snap, context) => {
    try {
      const signalData = snap.data();
      const signalId = context.params.signalId;
      const eventId = signalData.eventId;

      console.log(`Signal deleted: ${signalId} for event ${eventId}`);

      // Update event attendee count
      await db.collection('events').doc(eventId).update({
        attendeeCount: admin.firestore.FieldValue.increment(-1),
      });

      // Calculate new signal strength for the event
      const signalsSnapshot = await db.collection('signals')
        .where('eventId', '==', eventId)
        .get();

      let totalSignalStrength = 0;
      let signalCount = 0;

      signalsSnapshot.forEach(doc => {
        const signal = doc.data();
        totalSignalStrength += signal.signalStrength;
        signalCount++;
      });

      const averageSignalStrength = signalCount > 0 ? Math.round(totalSignalStrength / signalCount) : 0;

      // Update event signal strength
      await db.collection('events').doc(eventId).update({
        signalStrength: averageSignalStrength,
      });

      // Recalculate color/radius for nearby signals
      await recalculateNearbySignals(signalData.geohash);

      console.log(`Signal ${signalId} deleted, event ${eventId} updated with new attendee count and signal strength`);
    } catch (error) {
      console.error('Error in onSignalDelete trigger:', error);
    }
  });

/**
 * Helper function to recalculate peopleCount, color, and radius for signals near a geohash
 * @param {string} geohash - Geohash of the area to recalculate
 */
async function recalculateNearbySignals(geohash) {
  try {
    // Get all signals in the same geohash area (5 char precision ~5km)
    const geohashPrefix = geohash.substring(0, 5);
    const nearbySignals = await db.collection('signals')
      .where('geohash', '>=', geohashPrefix)
      .where('geohash', '<=', geohashPrefix + '\uf8ff')
      .get();

    const peopleCount = nearbySignals.size;
    const {color, radiusMeters} = calculateColorAndRadius(peopleCount);

    // Update all nearby signals with new peopleCount, color, and radius
    const batch = db.batch();
    nearbySignals.docs.forEach(doc => {
      batch.update(doc.ref, {
        peopleCount: peopleCount,
        color: color,
        radiusMeters: radiusMeters,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    console.log(`Recalculated color/radius for ${nearbySignals.size} signals in area ${geohashPrefix}`);
  } catch (error) {
    console.error('Error recalculating nearby signals:', error);
  }
}
