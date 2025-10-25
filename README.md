# Crowd Firebase Backend

Firebase backend for the Crowd app - providing real-time event management, user authentication, and data synchronization.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/tenbandz/Crowd-Backend
cd Crowd-Backend

# Install dependencies
cd functions && npm install && cd ..

# Start local emulators
npm start
```

Visit **http://localhost:4000** for the Firebase Emulator UI.

## 📋 What's Included

- **Cloud Functions** - HTTP endpoints and triggers for events, users, signals, and points
- **Firestore Database** - Real-time NoSQL database with security rules
- **Authentication** - Anonymous and social auth support
- **Deployment Automation** - GitHub Actions CI/CD pipeline

## 🏗️ Architecture

```
Crowd-Backend/
├── functions/           # Cloud Functions
│   ├── index.js        # Main entry point
│   ├── events.js       # Event CRUD operations
│   ├── users.js        # User management
│   ├── signals.js      # Signal/participation tracking
│   └── points.js       # Aura points system
├── firestore.rules     # Database security rules
├── firestore.indexes.json  # Performance indexes
├── firebase.json       # Firebase configuration
├── scripts/            # Helper scripts
│   ├── start-emulators.sh
│   ├── deploy.sh
│   └── test.sh
└── .github/workflows/  # CI/CD automation
```

## 📊 API Endpoints

All functions are available at: `https://us-central1-crowd-6193c.cloudfunctions.net/`

### Events
- `POST /createEvent` - Create a new event
- `POST /updateEvent` - Update event details (host only)
- `DELETE /deleteEvent` - Delete an event (host only)
- `GET /getEvent` - Get event details
- `POST /getEventsInRegion` - Get events in geographic region

### Users
- `POST /createUser` - Create user profile
- `POST /updateUser` - Update user profile
- `DELETE /deleteUser` - Delete user
- `GET /getUser` - Get user profile

### Signals
- `POST /createSignal` - Signal participation in event
- `POST /updateSignal` - Update signal strength
- `DELETE /deleteSignal` - Remove signal
- `GET /getSignal` - Get signal details
- `POST /getSignalsForEvent` - Get all signals for an event

### Points
- `POST /createPoint` - Award points
- `GET /getUserPoints` - Get user's point history

## 🛠️ Local Development

### Prerequisites

- Node.js 18+
- Java 17+ (for Firestore emulator)
- Firebase CLI

### Setup

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Install Java (macOS)
brew install openjdk@17

# Login to Firebase
firebase login

# Install dependencies
cd functions && npm install
```

### Start Emulators

```bash
# Method 1: Using npm script
npm start

# Method 2: Using helper script
./scripts/start-emulators.sh

# Method 3: Direct command
firebase emulators:start --project crowd-6193c
```

### Emulator Endpoints

- **Emulator UI**: http://localhost:4000
- **Functions**: http://localhost:5001
- **Firestore**: http://localhost:8080
- **Auth**: http://localhost:9099

### Testing

```bash
# Run linter
npm run lint

# Run tests
npm test
```

## 🚀 Deployment

### Quick Deploy

```bash
# Interactive deployment
npm run deploy

# Deploy everything
npm run deploy:all

# Deploy functions only
npm run deploy:functions

# Deploy firestore only
npm run deploy:firestore
```

### CI/CD Deployment

Pushing to `main` branch automatically deploys via GitHub Actions.

**Setup:**
1. Generate token: `firebase login:ci`
2. Add `FIREBASE_TOKEN` to GitHub Secrets
3. Push to main

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 📊 Database Collections

### events
- Event details, location, timing
- Public read, authenticated write
- Host-only updates/deletes

### users
- User profiles and aura points
- User-only access to own data

### signals
- Event participation tracking
- Signal strength (1-5)
- User-only management

### points
- Point transaction history
- Read-only for users
- System-generated

## 🔐 Security

Security rules in `firestore.rules` enforce:
- Users can only modify their own data
- Event hosts can update/delete their events
- Public read for events
- Authenticated write for new events

## 📱 Client Integration

### iOS

The iOS app connects via:
- `GoogleService-Info.plist` for configuration
- Firebase iOS SDK
- `FirebaseManager.swift` for emulator connection

See the iOS app repository for integration details.

### Local Development Connection

The iOS app automatically connects to local emulators in DEBUG mode:
```swift
#if DEBUG
settings.host = "localhost:8080"
settings.isSSLEnabled = false
functions.useEmulator(withHost: "localhost", port: 5001)
#endif
```

## 📈 Monitoring

```bash
# View function logs
npm run logs

# Or directly
firebase functions:log --limit 100

# Firebase Console
open https://console.firebase.google.com/project/crowd-6193c
```

## 🔧 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start emulators |
| `npm run deploy` | Interactive deployment |
| `npm run lint` | Run linter |
| `npm test` | Run tests |
| `npm run logs` | View function logs |

## 📝 Environment Variables

Create `.env` file from template:

```bash
cp firebase-config.example .env
# Edit .env with your configuration
```

**Note:** Never commit `.env` files. They're in `.gitignore`.

## 🆘 Troubleshooting

### Emulators won't start

```bash
# Check Java installation
java --version

# Install Java if missing
brew install openjdk@17

# Add to PATH
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
```

### Function errors

```bash
# Check logs
npm run logs

# Test locally
firebase functions:shell
```

### Permission denied

```bash
# Re-authenticate
firebase logout
firebase login
```

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test locally with emulators
4. Submit PR
5. Automated tests run
6. Merge to main deploys automatically

## 📄 License

MIT License - see LICENSE file

## 🔗 Links

- **Firebase Console**: https://console.firebase.google.com/project/crowd-6193c
- **Firebase Docs**: https://firebase.google.com/docs
- **Deployment Guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Setup Guide**: [SETUP.md](./SETUP.md)

---

**Version:** 1.0.0
**Last Updated:** October 2025
