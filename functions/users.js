/**
 * Users Collection Functions
 * Handles CRUD operations and triggers for user data
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

/**
 * Create a new user
 * HTTP endpoint: POST /createUser
 */
exports.createUser = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const userData = {
      id: userId,
      displayName: data.displayName || 'Anonymous',
      auraPoints: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Validate required fields
    if (!userData.displayName) {
      throw new functions.https.HttpsError('invalid-argument', 'Display name is required');
    }

    // Create user document
    await db.collection('users').doc(userId).set(userData);

    return {
      success: true,
      userId: userId,
      user: userData,
    };
  } catch (error) {
    console.error('Error creating user:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create user');
  }
});

/**
 * Update user data
 * HTTP endpoint: PUT /updateUser
 */
exports.updateUser = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const updateData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.createdAt;

    // Update user document
    await db.collection('users').doc(userId).update(updateData);

    // Get updated user data
    const userDoc = await db.collection('users').doc(userId).get();
    const updatedUser = userDoc.data();

    return {
      success: true,
      user: updatedUser,
    };
  } catch (error) {
    console.error('Error updating user:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update user');
  }
});

/**
 * Delete user
 * HTTP endpoint: DELETE /deleteUser
 */
exports.deleteUser = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    // Delete user document
    await db.collection('users').doc(userId).delete();

    return {
      success: true,
      message: 'User deleted successfully',
    };
  } catch (error) {
    console.error('Error deleting user:', error);
    throw new functions.https.HttpsError('internal', 'Failed to delete user');
  }
});

/**
 * Get user data
 * HTTP endpoint: GET /getUser
 */
exports.getUser = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    return {
      success: true,
      user: userDoc.data(),
    };
  } catch (error) {
    console.error('Error getting user:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get user');
  }
});

/**
 * Trigger: When a user is created
 * Automatically sets up user profile and initial data
 */
exports.onUserCreate = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    try {
      const userData = snap.data();
      const userId = context.params.userId;

      console.log(`New user created: ${userId}`);

      // Initialize user's points collection
      await db.collection('points').doc(`${userId}_initial`).set({
        userId: userId,
        points: 100, // Welcome bonus
        reason: 'Welcome bonus',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update user's aura points
      await db.collection('users').doc(userId).update({
        auraPoints: admin.firestore.FieldValue.increment(100),
      });

      console.log(`User ${userId} initialized with welcome bonus`);
    } catch (error) {
      console.error('Error in onUserCreate trigger:', error);
    }
  });

/**
 * Trigger: When a user is updated
 * Logs user updates and performs any necessary side effects
 */
exports.onUserUpdate = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    try {
      const beforeData = change.before.data();
      const afterData = change.after.data();
      const userId = context.params.userId;

      console.log(`User updated: ${userId}`);

      // Log significant changes
      if (beforeData.auraPoints !== afterData.auraPoints) {
        console.log(`User ${userId} aura points changed from ${beforeData.auraPoints} to ${afterData.auraPoints}`);
      }

      if (beforeData.displayName !== afterData.displayName) {
        console.log(`User ${userId} display name changed from ${beforeData.displayName} to ${afterData.displayName}`);
      }
    } catch (error) {
      console.error('Error in onUserUpdate trigger:', error);
    }
  });

/**
 * Trigger: When a user is deleted
 * Cleans up related data and logs the deletion
 */
exports.onUserDelete = functions.firestore
  .document('users/{userId}')
  .onDelete(async (snap, context) => {
    try {
      const userData = snap.data();
      const userId = context.params.userId;

      console.log(`User deleted: ${userId}`);

      // Clean up user's signals
      const signalsSnapshot = await db.collection('signals')
        .where('userId', '==', userId)
        .get();

      const batch = db.batch();
      signalsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Clean up user's points
      const pointsSnapshot = await db.collection('points')
        .where('userId', '==', userId)
        .get();

      pointsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      console.log(`Cleaned up data for deleted user: ${userId}`);
    } catch (error) {
      console.error('Error in onUserDelete trigger:', error);
    }
  });
