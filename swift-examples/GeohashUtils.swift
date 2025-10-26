//
//  GeohashUtils.swift
//  Crowd iOS App
//
//  Geohash encoding and decoding utilities for spatial queries
//

import Foundation
import CoreLocation

struct GeohashUtils {
    private static let base32 = Array("0123456789bcdefghjkmnpqrstuvwxyz")
    
    /// Encode latitude and longitude into a geohash string
    /// - Parameters:
    ///   - latitude: Latitude value (-90 to 90)
    ///   - longitude: Longitude value (-180 to 180)
    ///   - precision: Number of characters in geohash (default: 6, ~1.2km precision)
    /// - Returns: Geohash string
    static func encode(latitude: Double, longitude: Double, precision: Int = 6) -> String {
        var latMin: Double = -90.0
        var latMax: Double = 90.0
        var lonMin: Double = -180.0
        var lonMax: Double = 180.0
        
        var geohash = ""
        var idx = 0
        var bit = 0
        var evenBit = true
        
        while geohash.count < precision {
            if evenBit {
                // Longitude
                let lonMid = (lonMin + lonMax) / 2
                if longitude > lonMid {
                    idx = (idx << 1) + 1
                    lonMin = lonMid
                } else {
                    idx = idx << 1
                    lonMax = lonMid
                }
            } else {
                // Latitude
                let latMid = (latMin + latMax) / 2
                if latitude > latMid {
                    idx = (idx << 1) + 1
                    latMin = latMid
                } else {
                    idx = idx << 1
                    latMax = latMid
                }
            }
            evenBit.toggle()
            bit += 1
            
            if bit == 5 {
                geohash.append(base32[idx])
                bit = 0
                idx = 0
            }
        }
        
        return geohash
    }
    
    /// Decode a geohash string into coordinates
    /// - Parameter geohash: Geohash string
    /// - Returns: Tuple containing latitude and longitude
    static func decode(_ geohash: String) -> (latitude: Double, longitude: Double) {
        var latMin: Double = -90.0
        var latMax: Double = 90.0
        var lonMin: Double = -180.0
        var lonMax: Double = 180.0
        var evenBit = true
        
        for char in geohash {
            guard let idx = base32.firstIndex(of: char) else { continue }
            let charIndex = base32.distance(from: base32.startIndex, to: idx)
            
            for n in stride(from: 4, through: 0, by: -1) {
                let bitN = (charIndex >> n) & 1
                if evenBit {
                    // Longitude
                    let lonMid = (lonMin + lonMax) / 2
                    if bitN == 1 {
                        lonMin = lonMid
                    } else {
                        lonMax = lonMid
                    }
                } else {
                    // Latitude
                    let latMid = (latMin + latMax) / 2
                    if bitN == 1 {
                        latMin = latMid
                    } else {
                        latMax = latMid
                    }
                }
                evenBit.toggle()
            }
        }
        
        let lat = (latMin + latMax) / 2
        let lon = (lonMin + lonMax) / 2
        return (lat, lon)
    }
    
    /// Calculate distance between two coordinates using Haversine formula
    /// - Parameters:
    ///   - lat1: First latitude
    ///   - lon1: First longitude
    ///   - lat2: Second latitude
    ///   - lon2: Second longitude
    /// - Returns: Distance in kilometers
    static func distance(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let R: Double = 6371 // Earth's radius in kilometers
        let dLat = (lat2 - lat1) * .pi / 180
        let dLon = (lon2 - lon1) * .pi / 180
        
        let a = sin(dLat/2) * sin(dLat/2) +
                cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) *
                sin(dLon/2) * sin(dLon/2)
        
        let c = 2 * atan2(sqrt(a), sqrt(1-a))
        return R * c
    }
    
    /// Get geohash precision level based on desired radius
    /// - Parameter radiusKm: Desired radius in kilometers
    /// - Returns: Recommended geohash precision (number of characters)
    static func precisionForRadius(_ radiusKm: Double) -> Int {
        if radiusKm <= 0.02 { return 8 }      // ~20m
        else if radiusKm <= 0.15 { return 7 } // ~150m
        else if radiusKm <= 1.2 { return 6 }  // ~1.2km
        else if radiusKm <= 5 { return 5 }    // ~5km
        else if radiusKm <= 20 { return 4 }   // ~20km
        else if radiusKm <= 80 { return 3 }   // ~80km
        else { return 2 }                     // ~300km+
    }
}

// MARK: - Example Usage

extension GeohashUtils {
    static func runExamples() {
        // Example 1: Encode coordinates
        let sanFrancisco = (latitude: 37.7749, longitude: -122.4194)
        let geohash = encode(latitude: sanFrancisco.latitude, longitude: sanFrancisco.longitude, precision: 6)
        print("San Francisco geohash: \(geohash)") // Output: "9q8yyk"
        
        // Example 2: Decode geohash
        let decoded = decode(geohash)
        print("Decoded: lat=\(decoded.latitude), lon=\(decoded.longitude)")
        
        // Example 3: Calculate distance
        let newYork = (latitude: 40.7128, longitude: -74.0060)
        let dist = distance(
            lat1: sanFrancisco.latitude,
            lon1: sanFrancisco.longitude,
            lat2: newYork.latitude,
            lon2: newYork.longitude
        )
        print("Distance SF to NYC: \(dist) km")
        
        // Example 4: Get precision for radius
        let precision = precisionForRadius(5.0) // 5km radius
        print("Recommended precision for 5km radius: \(precision) characters")
    }
}

