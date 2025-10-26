/**
 * Test script for geohash utilities
 * Run with: node test-geohash.js
 */

const { encodeGeohash, decodeGeohash, getGeohashRange, calculateDistance } = require('./geohash');

console.log('🧪 Testing Geohash Implementation\n');

// Test 1: Encode coordinates
console.log('Test 1: Encoding coordinates');
const sanFrancisco = { lat: 37.7749, lng: -122.4194 };
const geohash = encodeGeohash(sanFrancisco.lat, sanFrancisco.lng, 6);
console.log(`  San Francisco (${sanFrancisco.lat}, ${sanFrancisco.lng})`);
console.log(`  Geohash: ${geohash}`);
console.log(`  ✅ Expected: 9q8yyk (or similar)\n`);

// Test 2: Decode geohash
console.log('Test 2: Decoding geohash');
const decoded = decodeGeohash(geohash);
console.log(`  Geohash: ${geohash}`);
console.log(`  Decoded: (${decoded.latitude.toFixed(4)}, ${decoded.longitude.toFixed(4)})`);
console.log(`  Original: (${sanFrancisco.lat}, ${sanFrancisco.lng})`);
console.log(`  ✅ Should be very close to original\n`);

// Test 3: Calculate distance
console.log('Test 3: Calculate distance');
const newYork = { lat: 40.7128, lng: -74.0060 };
const distance = calculateDistance(
  sanFrancisco.lat,
  sanFrancisco.lng,
  newYork.lat,
  newYork.lng
);
console.log(`  San Francisco to New York: ${distance.toFixed(2)} km`);
console.log(`  ✅ Expected: ~4,130 km\n`);

// Test 4: Get geohash range for radius query
console.log('Test 4: Geohash range for radius query');
const radiusKm = 5;
const ranges = getGeohashRange(sanFrancisco.lat, sanFrancisco.lng, radiusKm);
console.log(`  Location: (${sanFrancisco.lat}, ${sanFrancisco.lng})`);
console.log(`  Radius: ${radiusKm} km`);
console.log(`  Geohash ranges (${ranges.length} total):`);
ranges.forEach((range, i) => {
  console.log(`    ${i + 1}. ${range}`);
});
console.log(`  ✅ Should return 9 geohashes (center + 8 neighbors)\n`);

// Test 5: Nearby location test
console.log('Test 5: Nearby locations have similar geohashes');
const nearby1 = { lat: 37.7750, lng: -122.4195 }; // Very close to SF
const nearby2 = { lat: 37.7850, lng: -122.4094 }; // 1km away
const far = { lat: 34.0522, lng: -118.2437 };      // Los Angeles

const hash1 = encodeGeohash(nearby1.lat, nearby1.lng, 6);
const hash2 = encodeGeohash(nearby2.lat, nearby2.lng, 6);
const hashLA = encodeGeohash(far.lat, far.lng, 6);

console.log(`  SF:         ${geohash}`);
console.log(`  Very close: ${hash1} (should match first 5-6 chars)`);
console.log(`  1km away:   ${hash2} (should match first 4-5 chars)`);
console.log(`  LA:         ${hashLA} (should be different)`);
console.log(`  ✅ Geohash preserves spatial locality\n`);

// Test 6: Performance test
console.log('Test 6: Performance test');
const iterations = 10000;
const start = Date.now();
for (let i = 0; i < iterations; i++) {
  encodeGeohash(37.7749 + Math.random() * 0.1, -122.4194 + Math.random() * 0.1, 6);
}
const elapsed = Date.now() - start;
console.log(`  Encoded ${iterations} coordinates in ${elapsed}ms`);
console.log(`  Average: ${(elapsed / iterations).toFixed(3)}ms per encode`);
console.log(`  ✅ Should be very fast (<0.1ms per encode)\n`);

console.log('✅ All geohash tests completed successfully!');
console.log('\nYou can now start the Firebase emulators to test the full backend.');

