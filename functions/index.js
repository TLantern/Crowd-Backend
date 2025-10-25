/**
 * Crowd Backend - Firebase Cloud Functions
 * Main entry point for all Cloud Functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({origin: true});

// Initialize Firebase Admin SDK
admin.initializeApp();

// Import collection-specific functions
const userFunctions = require('./users');
const eventFunctions = require('./events');
const signalFunctions = require('./signals');
const pointFunctions = require('./points');

// Export all functions
module.exports = {
  // User functions
  createUser: userFunctions.createUser,
  updateUser: userFunctions.updateUser,
  deleteUser: userFunctions.deleteUser,
  getUser: userFunctions.getUser,
  onUserCreate: userFunctions.onUserCreate,
  onUserUpdate: userFunctions.onUserUpdate,
  onUserDelete: userFunctions.onUserDelete,

  // Event functions
  createEvent: eventFunctions.createEvent,
  updateEvent: eventFunctions.updateEvent,
  deleteEvent: eventFunctions.deleteEvent,
  getEvent: eventFunctions.getEvent,
  getEventsInRegion: eventFunctions.getEventsInRegion,
  onEventCreate: eventFunctions.onEventCreate,
  onEventUpdate: eventFunctions.onEventUpdate,
  onEventDelete: eventFunctions.onEventDelete,

  // Signal functions
  createSignal: signalFunctions.createSignal,
  updateSignal: signalFunctions.updateSignal,
  deleteSignal: signalFunctions.deleteSignal,
  getSignal: signalFunctions.getSignal,
  getSignalsForEvent: signalFunctions.getSignalsForEvent,
  onSignalCreate: signalFunctions.onSignalCreate,
  onSignalUpdate: signalFunctions.onSignalUpdate,
  onSignalDelete: signalFunctions.onSignalDelete,

  // Point functions
  createPoint: pointFunctions.createPoint,
  updatePoint: pointFunctions.updatePoint,
  deletePoint: pointFunctions.deletePoint,
  getPoint: pointFunctions.getPoint,
  getUserPoints: pointFunctions.getUserPoints,
  onPointCreate: pointFunctions.onPointCreate,
  onPointUpdate: pointFunctions.onPointUpdate,
  onPointDelete: pointFunctions.onPointDelete,
};
