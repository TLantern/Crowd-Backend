//
//  FirebaseManager.swift
//  Crowd iOS App
//
//  Complete Firebase integration manager for events and signals with real-time updates
//

import Foundation
import Firebase
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions
import Combine
import CoreLocation

class FirebaseManager: ObservableObject {
    static let shared = FirebaseManager()
    
    private let db = Firestore.firestore()
    private let functions = Functions.functions()
    
    @Published var events: [Event] = []
    @Published var signals: [Signal] = []
    @Published var isLoading = false
    @Published var error: String?
    
    private var eventListener: ListenerRegistration?
    private var signalListener: ListenerRegistration?
    
    // MARK: - Models
    
    struct Event: Identifiable, Codable {
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
        var distance: Double? // Computed by backend
        
        let createdAt: Timestamp?
        let updatedAt: Timestamp?
        let startsAt: Timestamp?
        let endsAt: Timestamp?
        
        var coordinate: CLLocationCoordinate2D {
            CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }
    }
    
    struct Signal: Identifiable, Codable {
        let id: String
        let userId: String
        let eventId: String
        let latitude: Double
        let longitude: Double
        let geohash: String
        let signalStrength: Int
        let peopleCount: Int
        let color: String // Hex color: #FFD700 (yellow), #FF6B6B (light red), #8B0000 (deep red)
        let radiusMeters: Int // 75, 125, or 200 based on peopleCount
        var distance: Double? // Computed by backend
        
        let createdAt: Timestamp?
        let updatedAt: Timestamp?
        
        var coordinate: CLLocationCoordinate2D {
            CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }
    }
    
    // MARK: - Initialization
    
    private init() {
        // Firebase is already configured in AppDelegate or App struct
    }
    
    // MARK: - Event Functions
    
    /// Fetch nearby events using geohash-based Cloud Function
    /// - Parameters:
    ///   - latitude: User's latitude
    ///   - longitude: User's longitude
    ///   - radiusKm: Search radius in kilometers (default: 10)
    func fetchNearbyEvents(latitude: Double, longitude: Double, radiusKm: Double = 10.0) {
        isLoading = true
        error = nil
        
        let data: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "radiusKm": radiusKm
        ]
        
        functions.httpsCallable("getNearbyEvents").call(data) { [weak self] result, error in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                self.isLoading = false
                
                if let error = error {
                    self.error = "Error fetching events: \(error.localizedDescription)"
                    print("Error fetching nearby events: \(error)")
                    return
                }
                
                guard let data = result?.data as? [String: Any],
                      let eventsData = data["events"] as? [[String: Any]] else {
                    self.error = "Invalid response from server"
                    return
                }
                
                do {
                    let jsonData = try JSONSerialization.data(withJSONObject: eventsData)
                    let decoder = JSONDecoder()
                    self.events = try decoder.decode([Event].self, from: jsonData)
                    print("Successfully fetched \(self.events.count) nearby events")
                } catch {
                    self.error = "Error decoding events: \(error.localizedDescription)"
                    print("Error decoding events: \(error)")
                }
            }
        }
    }
    
    /// Create a new event
    /// - Parameters:
    ///   - title: Event title
    ///   - latitude: Event latitude
    ///   - longitude: Event longitude
    ///   - radiusMeters: Event radius (default: 60)
    ///   - tags: Event tags
    ///   - completion: Completion handler with result
    func createEvent(
        title: String,
        latitude: Double,
        longitude: Double,
        radiusMeters: Double = 60,
        tags: [String] = [],
        completion: @escaping (Result<Event, Error>) -> Void
    ) {
        let data: [String: Any] = [
            "title": title,
            "latitude": latitude,
            "longitude": longitude,
            "radiusMeters": radiusMeters,
            "tags": tags
        ]
        
        functions.httpsCallable("createEvent").call(data) { result, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = result?.data as? [String: Any],
                  let eventData = data["event"] as? [String: Any] else {
                completion(.failure(NSError(domain: "FirebaseManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
                return
            }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: eventData)
                let decoder = JSONDecoder()
                let event = try decoder.decode(Event.self, from: jsonData)
                completion(.success(event))
            } catch {
                completion(.failure(error))
            }
        }
    }
    
    // MARK: - Signal Functions
    
    /// Fetch nearby signals using geohash-based Cloud Function
    /// - Parameters:
    ///   - latitude: User's latitude
    ///   - longitude: User's longitude
    ///   - radiusKm: Search radius in kilometers (default: 5)
    func fetchNearbySignals(latitude: Double, longitude: Double, radiusKm: Double = 5.0) {
        isLoading = true
        error = nil
        
        let data: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "radiusKm": radiusKm
        ]
        
        functions.httpsCallable("getNearbySignals").call(data) { [weak self] result, error in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                self.isLoading = false
                
                if let error = error {
                    self.error = "Error fetching signals: \(error.localizedDescription)"
                    print("Error fetching nearby signals: \(error)")
                    return
                }
                
                guard let data = result?.data as? [String: Any],
                      let signalsData = data["signals"] as? [[String: Any]] else {
                    self.error = "Invalid response from server"
                    return
                }
                
                do {
                    let jsonData = try JSONSerialization.data(withJSONObject: signalsData)
                    let decoder = JSONDecoder()
                    self.signals = try decoder.decode([Signal].self, from: jsonData)
                    print("Successfully fetched \(self.signals.count) nearby signals")
                } catch {
                    self.error = "Error decoding signals: \(error.localizedDescription)"
                    print("Error decoding signals: \(error)")
                }
            }
        }
    }
    
    /// Create a new signal
    /// - Parameters:
    ///   - eventId: Event ID to signal
    ///   - latitude: Signal latitude (user's location)
    ///   - longitude: Signal longitude (user's location)
    ///   - signalStrength: Signal strength (1-5)
    ///   - completion: Completion handler with result
    func createSignal(
        eventId: String,
        latitude: Double,
        longitude: Double,
        signalStrength: Int = 5,
        completion: @escaping (Result<Signal, Error>) -> Void
    ) {
        let data: [String: Any] = [
            "eventId": eventId,
            "latitude": latitude,
            "longitude": longitude,
            "signalStrength": signalStrength
        ]
        
        functions.httpsCallable("createSignal").call(data) { result, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = result?.data as? [String: Any],
                  let signalData = data["signal"] as? [String: Any] else {
                completion(.failure(NSError(domain: "FirebaseManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
                return
            }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: signalData)
                let decoder = JSONDecoder()
                let signal = try decoder.decode(Signal.self, from: jsonData)
                completion(.success(signal))
            } catch {
                completion(.failure(error))
            }
        }
    }
    
    // MARK: - Real-Time Listeners
    
    /// Start listening to events in a specific geohash area
    /// - Parameter geohashPrefix: Geohash prefix to listen to (typically 5-6 characters)
    func startListeningToEvents(geohashPrefix: String) {
        stopListeningToEvents()
        
        print("Starting event listener for geohash: \(geohashPrefix)")
        
        eventListener = db.collection("events")
            .whereField("geohash", isGreaterThanOrEqualTo: geohashPrefix)
            .whereField("geohash", isLessThanOrEqualTo: geohashPrefix + "\u{f8ff}")
            .addSnapshotListener { [weak self] querySnapshot, error in
                guard let self = self else { return }
                
                if let error = error {
                    print("Error listening to events: \(error.localizedDescription)")
                    DispatchQueue.main.async {
                        self.error = "Error listening to events: \(error.localizedDescription)"
                    }
                    return
                }
                
                guard let snapshot = querySnapshot else { return }
                
                DispatchQueue.main.async {
                    snapshot.documentChanges.forEach { change in
                        do {
                            let event = try change.document.data(as: Event.self)
                            
                            switch change.type {
                            case .added:
                                print("Event added: \(event.title)")
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
    }
    
    /// Start listening to signals in a specific geohash area
    /// - Parameter geohashPrefix: Geohash prefix to listen to (typically 5-6 characters)
    func startListeningToSignals(geohashPrefix: String) {
        stopListeningToSignals()
        
        print("Starting signal listener for geohash: \(geohashPrefix)")
        
        signalListener = db.collection("signals")
            .whereField("geohash", isGreaterThanOrEqualTo: geohashPrefix)
            .whereField("geohash", isLessThanOrEqualTo: geohashPrefix + "\u{f8ff}")
            .addSnapshotListener { [weak self] querySnapshot, error in
                guard let self = self else { return }
                
                if let error = error {
                    print("Error listening to signals: \(error.localizedDescription)")
                    DispatchQueue.main.async {
                        self.error = "Error listening to signals: \(error.localizedDescription)"
                    }
                    return
                }
                
                guard let snapshot = querySnapshot else { return }
                
                DispatchQueue.main.async {
                    snapshot.documentChanges.forEach { change in
                        do {
                            let signal = try change.document.data(as: Signal.self)
                            
                            switch change.type {
                            case .added:
                                print("Signal added: \(signal.id) with \(signal.peopleCount) people")
                                if !self.signals.contains(where: { $0.id == signal.id }) {
                                    self.signals.append(signal)
                                }
                                
                            case .modified:
                                print("Signal modified: \(signal.id) - color: \(signal.color), radius: \(signal.radiusMeters)m")
                                if let index = self.signals.firstIndex(where: { $0.id == signal.id }) {
                                    self.signals[index] = signal
                                }
                                
                            case .removed:
                                print("Signal removed: \(signal.id)")
                                self.signals.removeAll { $0.id == signal.id }
                            }
                        } catch {
                            print("Error decoding signal: \(error.localizedDescription)")
                        }
                    }
                }
            }
    }
    
    /// Stop listening to events
    func stopListeningToEvents() {
        eventListener?.remove()
        eventListener = nil
        print("Stopped listening to events")
    }
    
    /// Stop listening to signals
    func stopListeningToSignals() {
        signalListener?.remove()
        signalListener = nil
        print("Stopped listening to signals")
    }
    
    /// Stop all listeners
    func stopAllListeners() {
        stopListeningToEvents()
        stopListeningToSignals()
    }
    
    // MARK: - Helper Functions
    
    /// Update listeners based on user's current location
    /// - Parameters:
    ///   - latitude: User's latitude
    ///   - longitude: User's longitude
    ///   - precision: Geohash precision (default: 5)
    func updateListenersForLocation(latitude: Double, longitude: Double, precision: Int = 5) {
        let geohash = GeohashUtils.encode(latitude: latitude, longitude: longitude, precision: precision)
        startListeningToEvents(geohashPrefix: geohash)
        startListeningToSignals(geohashPrefix: geohash)
    }
}

// MARK: - Usage Examples

extension FirebaseManager {
    /// Example: Complete workflow for displaying events and signals on a map
    static func exampleUsage() {
        let manager = FirebaseManager.shared
        let userLocation = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
        
        // 1. Fetch nearby events
        manager.fetchNearbyEvents(
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            radiusKm: 10.0
        )
        
        // 2. Start real-time listeners for signals
        let geohash = GeohashUtils.encode(
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            precision: 5
        )
        manager.startListeningToSignals(geohashPrefix: geohash)
        
        // 3. Create a signal when user joins an event
        manager.createSignal(
            eventId: "event123",
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            signalStrength: 5
        ) { result in
            switch result {
            case .success(let signal):
                print("Signal created: \(signal.id)")
                print("People count: \(signal.peopleCount)")
                print("Color: \(signal.color)")
                print("Radius: \(signal.radiusMeters)m")
            case .failure(let error):
                print("Error creating signal: \(error.localizedDescription)")
            }
        }
    }
}

