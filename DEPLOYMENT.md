# Deployment Guide

This guide covers deploying the Crowd Firebase backend to production.

## Prerequisites

1. **Firebase CLI** installed: `npm install -g firebase-tools`
2. **Firebase project** set up: `crowd-6193c`
3. **Authenticated** with Firebase: `firebase login`
4. **Project permissions** to deploy functions and firestore

## Quick Deploy

### Using Helper Script (Recommended)

```bash
npm run deploy
```

This interactive script will guide you through deploying:
- Everything (functions + firestore)
- Functions only
- Firestore only

### Manual Deploy

```bash
# Deploy everything
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only firestore rules and indexes
firebase deploy --only firestore
```

## First-Time Deployment

### 1. Set Up Environment

```bash
# Login to Firebase
firebase login

# Verify project
firebase use crowd-6193c
```

### 2. Configure Functions

The functions use environment configuration. For production:

```bash
# Set environment variables (if needed)
firebase functions:config:set app.environment="production"
firebase functions:config:set app.url="https://your-app-url.com"

# View current config
firebase functions:config:get
```

### 3. Deploy

```bash
# Deploy everything for the first time
firebase deploy

# Or use the helper script
npm run deploy
```

## CI/CD Deployment

### GitHub Actions

This repository includes automated deployment via GitHub Actions.

**Setup:**

1. Generate Firebase token:
```bash
firebase login:ci
```

2. Add the token to GitHub Secrets:
   - Go to: Settings → Secrets and variables → Actions
   - Create secret: `FIREBASE_TOKEN`
   - Paste the token from step 1

3. Push to `main` branch to trigger automatic deployment

**Workflow File:** `.github/workflows/deploy.yml`

### Manual CI/CD Trigger

You can manually trigger deployment from GitHub:
1. Go to Actions tab
2. Select "Deploy to Firebase" workflow
3. Click "Run workflow"

## Environment Management

### Development (Local)

```bash
# Start emulators
npm start

# Or use the helper script
npm run emulators
```

Emulators run at:
- UI: http://localhost:4000
- Functions: http://localhost:5001
- Firestore: http://localhost:8080
- Auth: http://localhost:9099

### Production

Production deployment targets the `crowd-6193c` Firebase project.

```bash
# Deploy to production
firebase use production
firebase deploy
```

## Rollback Procedures

### Rollback Functions

```bash
# List recent deployments
firebase functions:log --limit 50

# If you need to rollback, redeploy a previous version
git checkout <previous-commit>
firebase deploy --only functions
git checkout main
```

### Rollback Firestore Rules

```bash
# Revert firestore.rules to previous version
git revert <commit-hash>
firebase deploy --only firestore:rules
```

## Monitoring

### View Logs

```bash
# Stream function logs
npm run logs

# Or directly
firebase functions:log --limit 100

# Follow logs in real-time
firebase functions:log --limit 100 --follow
```

### Firebase Console

Monitor your deployment at:
- **Functions**: https://console.firebase.google.com/project/crowd-6193c/functions
- **Firestore**: https://console.firebase.google.com/project/crowd-6193c/firestore
- **Usage**: https://console.firebase.google.com/project/crowd-6193c/usage

## Deployment Checklist

Before deploying to production:

- [ ] All tests passing: `npm test`
- [ ] Linter passing: `npm run lint`
- [ ] Functions tested locally with emulators
- [ ] Firestore rules validated
- [ ] Environment variables configured
- [ ] Breaking changes documented
- [ ] iOS app updated to handle any API changes

## Common Issues

### Authentication Errors

```bash
# Re-authenticate
firebase logout
firebase login
```

### Permission Denied

Ensure you have proper permissions on the Firebase project:
- Editor or Owner role required for deployment

### Function Timeout

Increase timeout in `firebase.json`:
```json
{
  "functions": {
    "timeoutSeconds": 300,
    "memory": "512MB"
  }
}
```

### Deployment Fails

```bash
# Clear cache and retry
rm -rf .firebase/
firebase deploy
```

## Security

### Secrets Management

Never commit:
- `.env` files
- Firebase tokens
- Service account keys

Use Firebase Functions config for secrets:
```bash
firebase functions:config:set service.api_key="YOUR_KEY"
```

### Firestore Rules

Always test firestore rules before deploying:
```bash
# Run rules tests
cd functions
npm test
```

## Support

For deployment issues:
1. Check Firebase Console for errors
2. Review function logs: `npm run logs`
3. Check GitHub Actions logs (if using CI/CD)
4. Consult Firebase documentation: https://firebase.google.com/docs

---

**Last Updated:** October 2025

