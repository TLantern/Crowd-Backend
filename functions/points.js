/**
 * Points Collection Functions
 * Handles CRUD operations and triggers for points data
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

/**
 * Create a new point entry
 * HTTP endpoint: POST /createPoint
 */
exports.createPoint = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const pointId = data.id || admin.firestore().collection('points').doc().id;

    const pointData = {
      id: pointId,
      userId: userId,
      points: data.points,
      reason: data.reason,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Validate required fields
    if (!pointData.points || !pointData.reason) {
      throw new functions.https.HttpsError('invalid-argument', 'Points and reason are required');
    }

    // Validate points value
    if (pointData.points <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Points must be greater than 0');
    }

    // Create point document
    await db.collection('points').doc(pointId).set(pointData);

    return {
      success: true,
      pointId: pointId,
      point: pointData,
    };
  } catch (error) {
    console.error('Error creating point:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create point');
  }
});

/**
 * Update point data
 * HTTP endpoint: PUT /updatePoint
 */
exports.updatePoint = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const pointId = data.id;

    if (!pointId) {
      throw new functions.https.HttpsError('invalid-argument', 'Point ID is required');
    }

    // Check if point exists and belongs to user
    const pointDoc = await db.collection('points').doc(pointId).get();
    if (!pointDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Point not found');
    }

    const pointData = pointDoc.data();
    if (pointData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only the point owner can update the point');
    }

    const updateData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.userId;

    // Validate points value if provided
    if (updateData.points && updateData.points <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Points must be greater than 0');
    }

    // Update point document
    await db.collection('points').doc(pointId).update(updateData);

    // Get updated point data
    const updatedPointDoc = await db.collection('points').doc(pointId).get();
    const updatedPoint = updatedPointDoc.data();

    return {
      success: true,
      point: updatedPoint,
    };
  } catch (error) {
    console.error('Error updating point:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update point');
  }
});

/**
 * Delete point
 * HTTP endpoint: DELETE /deletePoint
 */
exports.deletePoint = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const pointId = data.id;

    if (!pointId) {
      throw new functions.https.HttpsError('invalid-argument', 'Point ID is required');
    }

    // Check if point exists and belongs to user
    const pointDoc = await db.collection('points').doc(pointId).get();
    if (!pointDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Point not found');
    }

    const pointData = pointDoc.data();
    if (pointData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only the point owner can delete the point');
    }

    // Delete point document
    await db.collection('points').doc(pointId).delete();

    return {
      success: true,
      message: 'Point deleted successfully',
    };
  } catch (error) {
    console.error('Error deleting point:', error);
    throw new functions.https.HttpsError('internal', 'Failed to delete point');
  }
});

/**
 * Get point data
 * HTTP endpoint: GET /getPoint
 */
exports.getPoint = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const pointId = data.id;

    if (!pointId) {
      throw new functions.https.HttpsError('invalid-argument', 'Point ID is required');
    }

    const pointDoc = await db.collection('points').doc(pointId).get();

    if (!pointDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Point not found');
    }

    return {
      success: true,
      point: pointDoc.data(),
    };
  } catch (error) {
    console.error('Error getting point:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get point');
  }
});

/**
 * Get user's points
 * HTTP endpoint: GET /getUserPoints
 */
exports.getUserPoints = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const limit = data.limit || 50;

    const pointsSnapshot = await db.collection('points')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const points = [];
    let totalPoints = 0;

    pointsSnapshot.forEach(doc => {
      const pointData = doc.data();
      points.push(pointData);
      totalPoints += pointData.points;
    });

    return {
      success: true,
      points: points,
      totalPoints: totalPoints,
    };
  } catch (error) {
    console.error('Error getting user points:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get user points');
  }
});

/**
 * Trigger: When a point is created
 * Updates user's total aura points
 */
exports.onPointCreate = functions.firestore
  .document('points/{pointId}')
  .onCreate(async (snap, context) => {
    try {
      const pointData = snap.data();
      const pointId = context.params.pointId;
      const userId = pointData.userId;

      console.log(`New point created: ${pointId} for user ${userId}`);

      // Update user's aura points
      await db.collection('users').doc(userId).update({
        auraPoints: admin.firestore.FieldValue.increment(pointData.points),
      });

      console.log(`User ${userId} aura points increased by ${pointData.points}`);
    } catch (error) {
      console.error('Error in onPointCreate trigger:', error);
    }
  });

/**
 * Trigger: When a point is updated
 * Updates user's total aura points based on the difference
 */
exports.onPointUpdate = functions.firestore
  .document('points/{pointId}')
  .onUpdate(async (change, context) => {
    try {
      const beforeData = change.before.data();
      const afterData = change.after.data();
      const pointId = context.params.pointId;
      const userId = afterData.userId;

      console.log(`Point updated: ${pointId}`);

      // Calculate the difference in points
      const pointsDifference = afterData.points - beforeData.points;

      if (pointsDifference !== 0) {
        // Update user's aura points by the difference
        await db.collection('users').doc(userId).update({
          auraPoints: admin.firestore.FieldValue.increment(pointsDifference),
        });

        console.log(`User ${userId} aura points adjusted by ${pointsDifference}`);
      }
    } catch (error) {
      console.error('Error in onPointUpdate trigger:', error);
    }
  });

/**
 * Trigger: When a point is deleted
 * Decreases user's total aura points
 */
exports.onPointDelete = functions.firestore
  .document('points/{pointId}')
  .onDelete(async (snap, context) => {
    try {
      const pointData = snap.data();
      const pointId = context.params.pointId;
      const userId = pointData.userId;

      console.log(`Point deleted: ${pointId} for user ${userId}`);

      // Decrease user's aura points
      await db.collection('users').doc(userId).update({
        auraPoints: admin.firestore.FieldValue.increment(-pointData.points),
      });

      console.log(`User ${userId} aura points decreased by ${pointData.points}`);
    } catch (error) {
      console.error('Error in onPointDelete trigger:', error);
    }
  });
