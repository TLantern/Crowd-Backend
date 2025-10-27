/**
 * Leaderboard Functions
 * Handles queries for top users by aura points
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

/**
 * Get leaderboard of top users
 * HTTP endpoint: POST /getLeaderboard
 */
exports.getLeaderboard = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { timeframe = 'week', limit = 50 } = data;
    const currentUserId = context.auth.uid;

    // Calculate time filter based on timeframe
    let startDate = null;
    const now = new Date();
    
    switch (timeframe) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    console.log(`Fetching leaderboard for timeframe: ${timeframe}, startDate: ${startDate.toISOString()}`);

    // For now, we'll just fetch top users by total auraPoints
    // In the future, we can add time-based point tracking
    const usersSnapshot = await db.collection('users')
      .orderBy('auraPoints', 'desc')
      .limit(limit)
      .get();

    const leaderboard = [];
    let rank = 1;
    let currentUserRank = null;
    let currentUserEntry = null;

    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const userId = doc.id;

      const entry = {
        rank: rank,
        userId: userId,
        displayName: userData.displayName || 'Guest',
        auraPoints: userData.auraPoints || 0,
        avatarColorHex: userData.avatarColorHex || '#808080',
        profileImageURL: userData.profileImageURL || null,
        isCurrentUser: userId === currentUserId,
      };

      leaderboard.push(entry);

      if (userId === currentUserId) {
        currentUserRank = rank;
        currentUserEntry = entry;
      }

      rank++;
    });

    // If current user is not in top results, fetch their rank separately
    if (!currentUserRank) {
      const userDoc = await db.collection('users').doc(currentUserId).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const userPoints = userData.auraPoints || 0;
        
        // Count how many users have more points
        const higherRankedCount = await db.collection('users')
          .where('auraPoints', '>', userPoints)
          .count()
          .get();
        
        currentUserRank = higherRankedCount.data().count + 1;
        
        currentUserEntry = {
          rank: currentUserRank,
          userId: currentUserId,
          displayName: userData.displayName || 'Guest',
          auraPoints: userPoints,
          avatarColorHex: userData.avatarColorHex || '#808080',
          profileImageURL: userData.profileImageURL || null,
          isCurrentUser: true,
        };
      }
    }

    console.log(`Leaderboard fetched: ${leaderboard.length} entries, current user rank: ${currentUserRank}`);

    return {
      success: true,
      leaderboard: leaderboard,
      currentUserRank: currentUserRank,
      currentUserEntry: currentUserEntry,
      timeframe: timeframe,
    };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch leaderboard');
  }
});

/**
 * Get user's rank
 * HTTP endpoint: POST /getUserRank
 */
exports.getUserRank = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = data.userId || context.auth.uid;

    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    const userPoints = userData.auraPoints || 0;
    
    // Count how many users have more points
    const higherRankedCount = await db.collection('users')
      .where('auraPoints', '>', userPoints)
      .count()
      .get();
    
    const rank = higherRankedCount.data().count + 1;

    // Get total user count for percentile
    const totalUsersCount = await db.collection('users').count().get();
    const totalUsers = totalUsersCount.data().count;
    const percentile = totalUsers > 0 ? Math.round((1 - (rank - 1) / totalUsers) * 100) : 100;

    console.log(`User ${userId} rank: ${rank} out of ${totalUsers} (${percentile}th percentile)`);

    return {
      success: true,
      rank: rank,
      auraPoints: userPoints,
      totalUsers: totalUsers,
      percentile: percentile,
    };
  } catch (error) {
    console.error('Error fetching user rank:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch user rank');
  }
});



