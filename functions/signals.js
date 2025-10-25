/**
 * Signals Collection Functions
 * Handles CRUD operations and triggers for signal data
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

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

    const signalData = {
      id: signalId,
      userId: userId,
      eventId: data.eventId,
      signalStrength: data.signalStrength || 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Validate required fields
    if (!signalData.eventId) {
      throw new functions.https.HttpsError('invalid-argument', 'Event ID is required');
    }

    // Validate signal strength
    if (signalData.signalStrength < 1 || signalData.signalStrength > 5) {
      throw new functions.https.HttpsError('invalid-argument', 'Signal strength must be between 1 and 5');
    }

    // Check if event exists
    const eventDoc = await db.collection('events').doc(signalData.eventId).get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Event not found');
    }

    // Check if user already has a signal for this event
    const existingSignal = await db.collection('signals')
      .where('userId', '==', userId)
      .where('eventId', '==', signalData.eventId)
      .get();

    if (!existingSignal.empty) {
      throw new functions.https.HttpsError('already-exists', 'User already has a signal for this event');
    }

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
 * Trigger: When a signal is created
 * Updates event attendee count and signal strength
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
 * Updates event attendee count and signal strength
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

      console.log(`Signal ${signalId} deleted, event ${eventId} updated with new attendee count and signal strength`);
    } catch (error) {
      console.error('Error in onSignalDelete trigger:', error);
    }
  });
