# Swift Integration Guide for Crowd Backend

This guide provides comprehensive examples for integrating the Firebase Geohash Backend with your iOS app built in Swift.

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Geohash Utilities](#geohash-utilities)
3. [Fetching Nearby Events](#fetching-nearby-events)
4. [Fetching Nearby Signals](#fetching-nearby-signals)
5. [Real-Time Listeners](#real-time-listeners)
6. [Map Visualization](#map-visualization)
7. [Complete Integration Example](#complete-integration-example)

---

## Setup & Configuration

### Prerequisites

Add Firebase to your iOS project using Swift Package Manager or CocoaPods:

```swift
// Package.swift dependencies
dependencies: [
    .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "10.0.0")
]
```

### Initialize Firebase

```swift
import Firebase
import FirebaseAuth
import FirebaseFirestore

// In your AppDelegate or App struct
FirebaseApp.configure()
```

### Get Firestore Instance

```swift
let db = Firestore.firestore()
```

---

## Geohash Utilities

You can use a Swift geohash library or implement basic geohash functionality inline. Here's an inline implementation:

```swift
import Foundation
import CoreLocation

struct GeohashUtils {
    private static let base32 = Array("0123456789bcdefghjkmnpqrstuvwxyz")
    
    /// Encode latitude and longitude into a geohash string
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
}
```

---

## Fetching Nearby Events

Use the `getNearbyEvents` Cloud Function to fetch events within a specific radius:

```swift
import Firebase
import FirebaseFunctions

class EventService {
    private let functions = Functions.functions()
    
    struct Event: Codable {
        let id: String
        let title: String
        let hostId: String
        let latitude: Double
        let longitude: Double
        let geohash: String
        let radiusMeters: Double
        let peopleCount: Int
        let attendeeCount: Int
        let signalStrength: Int
        let tags: [String]
        let distance: Double? // Added by the backend
        
        // Timestamps
        let createdAt: Timestamp?
        let updatedAt: Timestamp?
        let startsAt: Timestamp?
        let endsAt: Timestamp?
    }
    
    /// Fetch nearby events using geohash-based query
    func fetchNearbyEvents(
        latitude: Double,
        longitude: Double,
        radiusKm: Double = 10.0,
        completion: @escaping (Result<[Event], Error>) -> Void
    ) {
        let data: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "radiusKm": radiusKm
        ]
        
        functions.httpsCallable("getNearbyEvents").call(data) { result, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = result?.data as? [String: Any],
                  let eventsData = data["events"] as? [[String: Any]] else {
                completion(.failure(NSError(domain: "EventService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
                return
            }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: eventsData)
                let decoder = JSONDecoder()
                let events = try decoder.decode([Event].self, from: jsonData)
                completion(.success(events))
            } catch {
                completion(.failure(error))
            }
        }
    }
}

// Usage Example
let eventService = EventService()
let userLocation = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)

eventService.fetchNearbyEvents(
    latitude: userLocation.latitude,
    longitude: userLocation.longitude,
    radiusKm: 5.0
) { result in
    switch result {
    case .success(let events):
        print("Found \(events.count) nearby events")
        events.forEach { event in
            print("\(event.title) - \(event.distance ?? 0) km away")
        }
    case .failure(let error):
        print("Error fetching events: \(error.localizedDescription)")
    }
}
```

---

## Fetching Nearby Signals

Similar to events, fetch signals with computed color and radius:

```swift
class SignalService {
    private let functions = Functions.functions()
    
    struct Signal: Codable {
        let id: String
        let userId: String
        let eventId: String
        let latitude: Double
        let longitude: Double
        let geohash: String
        let signalStrength: Int
        let peopleCount: Int
        let color: String // Hex color string
        let radiusMeters: Int
        let distance: Double? // Added by the backend
        
        let createdAt: Timestamp?
        let updatedAt: Timestamp?
    }
    
    /// Fetch nearby signals using geohash-based query
    func fetchNearbySignals(
        latitude: Double,
        longitude: Double,
        radiusKm: Double = 5.0,
        completion: @escaping (Result<[Signal], Error>) -> Void
    ) {
        let data: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "radiusKm": radiusKm
        ]
        
        functions.httpsCallable("getNearbySignals").call(data) { result, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = result?.data as? [String: Any],
                  let signalsData = data["signals"] as? [[String: Any]] else {
                completion(.failure(NSError(domain: "SignalService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
                return
            }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: signalsData)
                let decoder = JSONDecoder()
                let signals = try decoder.decode([Signal].self, from: jsonData)
                completion(.success(signals))
            } catch {
                completion(.failure(error))
            }
        }
    }
}

// Usage Example
let signalService = SignalService()

signalService.fetchNearbySignals(
    latitude: 37.7749,
    longitude: -122.4194,
    radiusKm: 5.0
) { result in
    switch result {
    case .success(let signals):
        print("Found \(signals.count) nearby signals")
        signals.forEach { signal in
            print("Signal: \(signal.peopleCount) people, color: \(signal.color), radius: \(signal.radiusMeters)m")
        }
    case .failure(let error):
        print("Error fetching signals: \(error.localizedDescription)")
    }
}
```

---

## Real-Time Listeners

Set up Firestore snapshot listeners to get real-time updates when data changes:

```swift
import Combine

class RealtimeEventManager: ObservableObject {
    @Published var events: [Event] = []
    private var listener: ListenerRegistration?
    private let db = Firestore.firestore()
    
    struct Event: Identifiable, Codable {
        let id: String
        let title: String
        let latitude: Double
        let longitude: Double
        let geohash: String
        let peopleCount: Int
        let attendeeCount: Int
        // ... other fields
    }
    
    /// Listen for events in a specific geohash area
    func startListening(geohashPrefix: String) {
        // Stop any existing listener
        stopListening()
        
        listener = db.collection("events")
            .whereField("geohash", isGreaterThanOrEqualTo: geohashPrefix)
            .whereField("geohash", isLessThanOrEqualTo: geohashPrefix + "\u{f8ff}")
            .addSnapshotListener { [weak self] querySnapshot, error in
                guard let self = self else { return }
                
                if let error = error {
                    print("Error listening to events: \(error.localizedDescription)")
                    return
                }
                
                guard let snapshot = querySnapshot else { return }
                
                // Handle document changes
                snapshot.documentChanges.forEach { change in
                    do {
                        let event = try change.document.data(as: Event.self)
                        
                        switch change.type {
                        case .added:
                            print("New event added: \(event.title)")
                            if !self.events.contains(where: { $0.id == event.id }) {
                                self.events.append(event)
                            }
                            
                        case .modified:
                            print("Event modified: \(event.title)")
                            if let index = self.events.firstIndex(where: { $0.id == event.id }) {
                                self.events[index] = event
                            }
                            
                        case .removed:
                            print("Event removed: \(event.title)")
                            self.events.removeAll { $0.id == event.id }
                        }
                    } catch {
                        print("Error decoding event: \(error.localizedDescription)")
                    }
                }
            }
    }
    
    func stopListening() {
        listener?.remove()
        listener = nil
    }
    
    deinit {
        stopListening()
    }
}

// Usage in a SwiftUI View
struct EventListView: View {
    @StateObject private var eventManager = RealtimeEventManager()
    @State private var userLocation = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
    
    var body: some View {
        List(eventManager.events) { event in
            VStack(alignment: .leading) {
                Text(event.title)
                    .font(.headline)
                Text("\(event.attendeeCount) attendees")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .onAppear {
            // Calculate geohash for user's location
            let geohash = GeohashUtils.encode(
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                precision: 5
            )
            eventManager.startListening(geohashPrefix: geohash)
        }
        .onDisappear {
            eventManager.stopListening()
        }
    }
}
```

### Real-Time Signal Listener

```swift
class RealtimeSignalManager: ObservableObject {
    @Published var signals: [Signal] = []
    private var listener: ListenerRegistration?
    private let db = Firestore.firestore()
    
    struct Signal: Identifiable, Codable {
        let id: String
        let latitude: Double
        let longitude: Double
        let geohash: String
        let peopleCount: Int
        let color: String
        let radiusMeters: Int
        // ... other fields
    }
    
    func startListening(geohashPrefix: String) {
        stopListening()
        
        listener = db.collection("signals")
            .whereField("geohash", isGreaterThanOrEqualTo: geohashPrefix)
            .whereField("geohash", isLessThanOrEqualTo: geohashPrefix + "\u{f8ff}")
            .addSnapshotListener { [weak self] querySnapshot, error in
                guard let self = self else { return }
                
                if let error = error {
                    print("Error listening to signals: \(error.localizedDescription)")
                    return
                }
                
                guard let snapshot = querySnapshot else { return }
                
                snapshot.documentChanges.forEach { change in
                    do {
                        let signal = try change.document.data(as: Signal.self)
                        
                        switch change.type {
                        case .added:
                            if !self.signals.contains(where: { $0.id == signal.id }) {
                                self.signals.append(signal)
                            }
                            
                        case .modified:
                            if let index = self.signals.firstIndex(where: { $0.id == signal.id }) {
                                self.signals[index] = signal
                            }
                            
                        case .removed:
                            self.signals.removeAll { $0.id == signal.id }
                        }
                    } catch {
                        print("Error decoding signal: \(error.localizedDescription)")
                    }
                }
            }
    }
    
    func stopListening() {
        listener?.remove()
        listener = nil
    }
}
```

---

## Map Visualization

Display signals on a map with color-coded circles using MapKit:

```swift
import MapKit
import SwiftUI

struct SignalMapView: View {
    @StateObject private var signalManager = RealtimeSignalManager()
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194),
        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
    )
    
    var body: some View {
        Map(coordinateRegion: $region, annotationItems: signalManager.signals) { signal in
            MapAnnotation(coordinate: CLLocationCoordinate2D(latitude: signal.latitude, longitude: signal.longitude)) {
                SignalCircle(
                    color: Color(hex: signal.color),
                    radiusMeters: signal.radiusMeters,
                    peopleCount: signal.peopleCount
                )
            }
        }
        .onAppear {
            let geohash = GeohashUtils.encode(
                latitude: region.center.latitude,
                longitude: region.center.longitude,
                precision: 5
            )
            signalManager.startListening(geohashPrefix: geohash)
        }
        .onChange(of: region.center) { newCenter in
            // Update listener when user moves map
            let geohash = GeohashUtils.encode(
                latitude: newCenter.latitude,
                longitude: newCenter.longitude,
                precision: 5
            )
            signalManager.startListening(geohashPrefix: geohash)
        }
    }
}

struct SignalCircle: View {
    let color: Color
    let radiusMeters: Int
    let peopleCount: Int
    
    var body: some View {
        ZStack {
            Circle()
                .fill(color.opacity(0.3))
                .frame(width: CGFloat(radiusMeters) / 2, height: CGFloat(radiusMeters) / 2)
            
            Circle()
                .stroke(color, lineWidth: 2)
                .frame(width: CGFloat(radiusMeters) / 2, height: CGFloat(radiusMeters) / 2)
            
            Text("\(peopleCount)")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .padding(4)
                .background(color)
                .clipShape(Circle())
        }
    }
}

// Helper extension to create Color from hex string
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
```

---

## Complete Integration Example

Here's a complete example showing the full flow from fetching data to displaying it on a map with real-time updates:

```swift
import SwiftUI
import MapKit
import Firebase
import FirebaseFunctions
import FirebaseFirestore

@main
struct CrowdApp: App {
    init() {
        FirebaseApp.configure()
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

class FirebaseManager: ObservableObject {
    static let shared = FirebaseManager()
    
    private let db = Firestore.firestore()
    private let functions = Functions.functions()
    
    @Published var events: [Event] = []
    @Published var signals: [Signal] = []
    
    private var eventListener: ListenerRegistration?
    private var signalListener: ListenerRegistration?
    
    struct Event: Identifiable, Codable {
        let id: String
        let title: String
        let latitude: Double
        let longitude: Double
        let geohash: String
        let peopleCount: Int
        let attendeeCount: Int
        let radiusMeters: Double
    }
    
    struct Signal: Identifiable, Codable {
        let id: String
        let latitude: Double
        let longitude: Double
        let geohash: String
        let peopleCount: Int
        let color: String
        let radiusMeters: Int
    }
    
    // Fetch nearby events using Cloud Function
    func fetchNearbyEvents(latitude: Double, longitude: Double, radiusKm: Double = 10.0) {
        let data: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "radiusKm": radiusKm
        ]
        
        functions.httpsCallable("getNearbyEvents").call(data) { [weak self] result, error in
            if let error = error {
                print("Error fetching events: \(error)")
                return
            }
            
            guard let data = result?.data as? [String: Any],
                  let eventsData = data["events"] as? [[String: Any]] else {
                return
            }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: eventsData)
                let decoder = JSONDecoder()
                self?.events = try decoder.decode([Event].self, from: jsonData)
            } catch {
                print("Error decoding events: \(error)")
            }
        }
    }
    
    // Start real-time listener for signals
    func startListeningToSignals(geohashPrefix: String) {
        signalListener?.remove()
        
        signalListener = db.collection("signals")
            .whereField("geohash", isGreaterThanOrEqualTo: geohashPrefix)
            .whereField("geohash", isLessThanOrEqualTo: geohashPrefix + "\u{f8ff}")
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self, let snapshot = snapshot else {
                    print("Error listening to signals: \(error?.localizedDescription ?? "Unknown")")
                    return
                }
                
                snapshot.documentChanges.forEach { change in
                    do {
                        let signal = try change.document.data(as: Signal.self)
                        
                        switch change.type {
                        case .added:
                            if !self.signals.contains(where: { $0.id == signal.id }) {
                                self.signals.append(signal)
                            }
                        case .modified:
                            if let index = self.signals.firstIndex(where: { $0.id == signal.id }) {
                                self.signals[index] = signal
                            }
                        case .removed:
                            self.signals.removeAll { $0.id == signal.id }
                        }
                    } catch {
                        print("Error decoding signal: \(error)")
                    }
                }
            }
    }
    
    func stopListening() {
        eventListener?.remove()
        signalListener?.remove()
    }
}

struct ContentView: View {
    @StateObject private var firebaseManager = FirebaseManager.shared
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194),
        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
    )
    
    var body: some View {
        ZStack {
            Map(coordinateRegion: $region, annotationItems: firebaseManager.signals) { signal in
                MapAnnotation(coordinate: CLLocationCoordinate2D(latitude: signal.latitude, longitude: signal.longitude)) {
                    SignalMarker(signal: signal)
                }
            }
            .edgesIgnoringSafeArea(.all)
            
            VStack {
                Spacer()
                
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(firebaseManager.events) { event in
                            EventCard(event: event)
                        }
                    }
                    .padding()
                }
                .frame(height: 120)
                .background(Color.white.opacity(0.9))
            }
        }
        .onAppear {
            // Fetch nearby events
            firebaseManager.fetchNearbyEvents(
                latitude: region.center.latitude,
                longitude: region.center.longitude,
                radiusKm: 5.0
            )
            
            // Start listening to signals
            let geohash = GeohashUtils.encode(
                latitude: region.center.latitude,
                longitude: region.center.longitude,
                precision: 5
            )
            firebaseManager.startListeningToSignals(geohashPrefix: geohash)
        }
    }
}

struct SignalMarker: View {
    let signal: FirebaseManager.Signal
    
    var body: some View {
        ZStack {
            Circle()
                .fill(Color(hex: signal.color).opacity(0.3))
                .frame(width: 40, height: 40)
            
            Circle()
                .stroke(Color(hex: signal.color), lineWidth: 2)
                .frame(width: 40, height: 40)
            
            Text("\(signal.peopleCount)")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .padding(4)
                .background(Color(hex: signal.color))
                .clipShape(Circle())
        }
    }
}

struct EventCard: View {
    let event: FirebaseManager.Event
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(event.title)
                .font(.headline)
            Text("\(event.attendeeCount) attendees")
                .font(.caption)
                .foregroundColor(.secondary)
            Text("\(event.peopleCount) nearby")
                .font(.caption2)
                .foregroundColor(.blue)
        }
        .padding()
        .background(Color.white)
        .cornerRadius(12)
        .shadow(radius: 4)
    }
}
```

---

## Key Points

1. **Geohash Precision**: Use 5-6 character geohashes for most spatial queries
2. **Real-Time Updates**: Firestore snapshot listeners automatically push updates to your app
3. **Color Coding**: 
   - Yellow (#FFD700): < 10 people, 75m radius
   - Light Red (#FF6B6B): 25-50 people, 125m radius
   - Deep Red (#8B0000): > 50 people, 200m radius
4. **Performance**: The backend handles all computations; your iOS app just displays the results
5. **Security**: All requests require Firebase Authentication

---

## Testing

Test your integration with Firebase Emulators:

```bash
cd functions
npm run serve
```

Point your iOS app to the local emulator:

```swift
// In your Firebase configuration
Functions.functions().useEmulator(withHost: "localhost", port: 5001)
Firestore.firestore().useEmulator(withHost: "localhost", port: 8080)
```

---

## Troubleshooting

**Issue**: Signals not updating in real-time
- **Solution**: Ensure you've set up the Firestore snapshot listener correctly and that your geohash prefix covers the visible map area

**Issue**: Color not displaying correctly
- **Solution**: Verify the hex color string includes the '#' prefix and matches the format in `calculateColorAndRadius()`

**Issue**: Events not appearing
- **Solution**: Check that events have the `geohash` field populated. Existing events may need to be migrated.

---

For more information, refer to the [Firebase iOS Documentation](https://firebase.google.com/docs/ios/setup) and the backend's `DATABASE_STRUCTURE.md`.

