/**
 * Geohash Utilities
 * Provides encoding, decoding, and range calculation for spatial queries
 */

// Base32 character set for geohash encoding
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode latitude and longitude into a geohash string
 * @param {number} latitude - Latitude (-90 to 90)
 * @param {number} longitude - Longitude (-180 to 180)
 * @param {number} precision - Number of characters in geohash (default: 6)
 * @returns {string} Geohash string
 */
function encodeGeohash(latitude, longitude, precision = 6) {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      // Longitude
      const lonMid = (lonMin + lonMax) / 2;
      if (longitude > lonMid) {
        idx = (idx << 1) + 1;
        lonMin = lonMid;
      } else {
        idx = idx << 1;
        lonMax = lonMid;
      }
    } else {
      // Latitude
      const latMid = (latMin + latMax) / 2;
      if (latitude > latMid) {
        idx = (idx << 1) + 1;
        latMin = latMid;
      } else {
        idx = idx << 1;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/**
 * Decode a geohash string into latitude and longitude
 * @param {string} geohash - Geohash string
 * @returns {object} Object with lat, lon, and error margins
 */
function decodeGeohash(geohash) {
  let evenBit = true;
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  for (let i = 0; i < geohash.length; i++) {
    const chr = geohash.charAt(i);
    const idx = BASE32.indexOf(chr);
    if (idx === -1) throw new Error('Invalid geohash');

    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1;
      if (evenBit) {
        // Longitude
        const lonMid = (lonMin + lonMax) / 2;
        if (bitN === 1) {
          lonMin = lonMid;
        } else {
          lonMax = lonMid;
        }
      } else {
        // Latitude
        const latMid = (latMin + latMax) / 2;
        if (bitN === 1) {
          latMin = latMid;
        } else {
          latMax = latMid;
        }
      }
      evenBit = !evenBit;
    }
  }

  const lat = (latMin + latMax) / 2;
  const lon = (lonMin + lonMax) / 2;
  const latError = latMax - lat;
  const lonError = lonMax - lon;

  return {
    latitude: lat,
    longitude: lon,
    error: {latitude: latError, longitude: lonError},
  };
}

/**
 * Calculate geohash ranges (prefixes) that cover a circular area
 * This is used for efficient spatial queries
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Array<string>} Array of geohash prefixes to query
 */
function getGeohashRange(latitude, longitude, radiusKm) {
  // Determine appropriate geohash precision based on radius
  // Smaller radius = more precision (longer geohash)
  let precision;
  if (radiusKm <= 0.02) precision = 8; // ~20m
  else if (radiusKm <= 0.15) precision = 7; // ~150m
  else if (radiusKm <= 1.2) precision = 6; // ~1.2km
  else if (radiusKm <= 5) precision = 5; // ~5km
  else if (radiusKm <= 20) precision = 4; // ~20km
  else if (radiusKm <= 80) precision = 3; // ~80km
  else precision = 2; // ~300km+

  const centerHash = encodeGeohash(latitude, longitude, precision);
  
  // Get neighbor geohashes to ensure full coverage
  const hashes = [centerHash];
  const neighbors = getNeighbors(centerHash);
  hashes.push(...neighbors);

  return hashes;
}

/**
 * Get all 8 neighboring geohashes
 * @param {string} geohash - Center geohash
 * @returns {Array<string>} Array of 8 neighboring geohashes
 */
function getNeighbors(geohash) {
  const neighbors = [];
  
  // Get adjacent geohashes in all 8 directions
  const n = getAdjacent(geohash, 'top');
  const s = getAdjacent(geohash, 'bottom');
  const e = getAdjacent(geohash, 'right');
  const w = getAdjacent(geohash, 'left');
  
  neighbors.push(n);
  neighbors.push(s);
  neighbors.push(e);
  neighbors.push(w);
  neighbors.push(getAdjacent(n, 'right')); // NE
  neighbors.push(getAdjacent(n, 'left'));  // NW
  neighbors.push(getAdjacent(s, 'right')); // SE
  neighbors.push(getAdjacent(s, 'left'));  // SW

  return neighbors;
}

/**
 * Get adjacent geohash in a specific direction
 * @param {string} geohash - Source geohash
 * @param {string} direction - 'top', 'bottom', 'left', or 'right'
 * @returns {string} Adjacent geohash
 */
function getAdjacent(geohash, direction) {
  const neighbor = {
    right: {even: 'bc01fg45238967deuvhjyznpkmstqrwx'},
    left: {even: '238967debc01fg45kmstqrwxuvhjyznp'},
    top: {even: 'p0r21436x8zb9dcf5h7kjnmqesgutwvy'},
    bottom: {even: '14365h7k9dcfesgujnmqp0r2twvyx8zb'},
  };

  const border = {
    right: {even: 'bcfguvyz'},
    left: {even: '0145hjnp'},
    top: {even: 'prxz'},
    bottom: {even: '028b'},
  };

  neighbor.right.odd = neighbor.left.even;
  neighbor.left.odd = neighbor.right.even;
  neighbor.top.odd = neighbor.bottom.even;
  neighbor.bottom.odd = neighbor.top.even;

  border.right.odd = border.left.even;
  border.left.odd = border.right.even;
  border.top.odd = border.bottom.even;
  border.bottom.odd = border.top.even;

  const lastChar = geohash.slice(-1);
  let parent = geohash.slice(0, -1);
  const type = geohash.length % 2 ? 'odd' : 'even';

  // Check if we're at a border
  if (border[direction][type].indexOf(lastChar) !== -1 && parent !== '') {
    parent = getAdjacent(parent, direction);
  }

  // Return parent + adjacent character
  return parent + BASE32.charAt(neighbor[direction][type].indexOf(lastChar));
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - First latitude
 * @param {number} lon1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lon2 - Second longitude
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

module.exports = {
  encodeGeohash,
  decodeGeohash,
  getGeohashRange,
  getNeighbors,
  getAdjacent,
  calculateDistance,
};

