# Firebase Backend Setup Guide

This guide will help you set up the Firebase backend for your Crowd iOS app.

## 🎯 Overview

The Firebase backend provides:
- **Real-time database** with Firestore
- **User authentication** with Firebase Auth
- **Backend logic** with Cloud Functions
- **Automatic triggers** for data consistency
- **Security rules** for data protection

## 📋 Prerequisites

Before starting, ensure you have:
- [ ] Node.js v18+ installed
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] A Firebase project created
- [ ] Firestore, Authentication, and Cloud Functions enabled in your Firebase project

## 🚀 Step-by-Step Setup

### Step 1: Firebase Project Setup

1. **Create Firebase Project** (if not already done):
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Create a project"
   - Follow the setup wizard

2. **Enable Required Services**:
   - **Firestore Database**: Enable in production mode
   - **Authentication**: Enable Email/Password and any other providers you need
   - **Cloud Functions**: Enable (may require billing account)

### Step 2: Initialize Firebase in Your Project

```bash
# Navigate to your project's Backend directory
cd Crowd/Backend

# Login to Firebase
firebase login

# Initialize Firebase project
firebase init
```

**During initialization, select:**
- ✅ **Firestore**: Configure security rules and indexes files
- ✅ **Functions**: Configure a Cloud Functions directory and language
- ✅ **Use existing project**: Select your Firebase project

### Step 3: Configure Environment Variables

1. **Copy the configuration template**:
   ```bash
   cp firebase-config.example .env
   ```

2. **Get your Firebase configuration**:
   - Go to Firebase Console → Project Settings → Service Accounts
   - Generate a new private key (downloads a JSON file)
   - Copy the values from the JSON to your `.env` file

3. **Get Web App configuration**:
   - Go to Firebase Console → Project Settings → General
   - Scroll down to "Your apps" section
   - Click on your web app (or create one if needed)
   - Copy the config values to your `.env` file

### Step 4: Install Dependencies

```bash
# Navigate to functions directory
cd functions

# Install Node.js dependencies
npm install

# Go back to Backend directory
cd ..
```

### Step 5: Deploy Firebase Backend

```bash
# Deploy Firestore rules and indexes
firebase deploy --only firestore

# Deploy Cloud Functions
firebase deploy --only functions

# Or deploy everything at once
firebase deploy
```

## 🔧 Configuration Details

### Firebase Project Configuration

Your `firebase.json` file configures:
- **Firestore rules and indexes**
- **Cloud Functions runtime and settings**
- **Deployment preferences**

### Environment Variables

Your `.env` file should contain:
- **Firebase project credentials**
- **Service account keys**
- **Web app configuration**
- **Function settings**

### Security Rules

The `firestore.rules` file defines:
- **User data access permissions**
- **Event creation and modification rules**
- **Signal and point management permissions**
- **Data validation rules**

## 📱 iOS App Integration

### 1. Add Firebase to iOS Project

If not already done, add Firebase to your iOS project:

```bash
# In your iOS project directory
pod init
```

Add to your `Podfile`:
```ruby
pod 'Firebase/Auth'
pod 'Firebase/Firestore'
pod 'Firebase/Functions'
```

```bash
pod install
```

### 2. Configure Firebase in iOS App

1. **Download GoogleService-Info.plist** from Firebase Console
2. **Add it to your iOS project**
3. **Initialize Firebase in your app**:

```swift
import Firebase

class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        return true
    }
}
```

### 3. Update Your Repository

Replace your mock repository with the Firebase repository:

```swift
// In AppEnvironment.swift
eventRepo: FirebaseEventRepository()  // Instead of MockEventRepository()
```

### 4. Implement Real-time Listeners

Add real-time listeners to your iOS app:

```swift
import FirebaseFirestore

class EventRepository {
    private let db = Firestore.firestore()
    
    func listenToEvents(completion: @escaping ([CrowdEvent]) -> Void) {
        db.collection("events")
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    print("Error: \(error)")
                    return
                }
                
                let events = snapshot?.documents.compactMap { doc in
                    try? doc.data(as: CrowdEvent.self)
                } ?? []
                
                DispatchQueue.main.async {
                    completion(events)
                }
            }
    }
}
```

## 🧪 Testing Your Setup

### 1. Test Firestore Connection

```swift
// Test writing to Firestore
let db = Firestore.firestore()
db.collection("test").document("test").setData(["test": "value"]) { error in
    if let error = error {
        print("Error: \(error)")
    } else {
        print("Success!")
    }
}
```

### 2. Test Cloud Functions

```swift
// Test calling a Cloud Function
import FirebaseFunctions

let functions = Functions.functions()
let createUser = functions.httpsCallable("createUser")

createUser.call(["displayName": "Test User"]) { result, error in
    if let error = error {
        print("Error: \(error)")
    } else {
        print("Success: \(result?.data)")
    }
}
```

### 3. Test Authentication

```swift
// Test user authentication
import FirebaseAuth

Auth.auth().signInAnonymously { result, error in
    if let error = error {
        print("Error: \(error)")
    } else {
        print("User signed in: \(result?.user.uid)")
    }
}
```

## 🔍 Verification Checklist

- [ ] Firebase project created and configured
- [ ] Firestore database enabled
- [ ] Authentication enabled
- [ ] Cloud Functions enabled
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] Backend deployed successfully
- [ ] iOS app connected to Firebase
- [ ] Real-time listeners working
- [ ] CRUD operations functional

## 🚨 Troubleshooting

### Common Issues

1. **"Permission denied" errors**:
   - Check Firestore security rules
   - Ensure user is authenticated
   - Verify user has proper permissions

2. **"Function not found" errors**:
   - Ensure Cloud Functions are deployed
   - Check function names match exactly
   - Verify Firebase project configuration

3. **"Network error" issues**:
   - Check internet connection
   - Verify Firebase project ID
   - Ensure Firebase services are enabled

4. **"Authentication failed" errors**:
   - Check Firebase Auth configuration
   - Verify authentication providers are enabled
   - Ensure user is properly signed in

### Debug Commands

```bash
# Check Firebase project status
firebase projects:list

# View function logs
firebase functions:log

# Test functions locally
firebase functions:shell

# Check Firestore rules
firebase firestore:rules:get
```

## 📞 Support

If you encounter issues:
1. Check Firebase Console for errors
2. Review Cloud Functions logs
3. Verify Firestore security rules
4. Ensure proper Firebase configuration
5. Check network connectivity
6. Verify authentication status

## 🎉 Next Steps

Once your backend is set up:
1. Test all CRUD operations
2. Implement real-time listeners in iOS app
3. Add error handling and loading states
4. Test with multiple users
5. Monitor performance and usage
6. Set up monitoring and alerts

Your Firebase backend is now ready to power your Crowd iOS app with real-time synchronization!
