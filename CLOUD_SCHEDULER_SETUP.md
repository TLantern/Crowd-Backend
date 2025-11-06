# Cloud Scheduler Setup for fetchOfficialEvents

This guide explains how to set up Google Cloud Scheduler to automatically trigger the `fetchOfficialEvents` Cloud Function weekly.

## Initial Setup - Install Required Tools

Before you can deploy or set up Cloud Scheduler, you need to install the required CLI tools:

1. **Install Firebase CLI (if not already installed):**
   ```bash
   npm install -g firebase-tools
   ```

2. **Install Google Cloud SDK (gcloud) - Required for Cloud Scheduler:**
   
   **On macOS (using Homebrew - recommended):**
   ```bash
   brew install --cask google-cloud-sdk
   ```
   
   **On macOS (manual installation):**
   ```bash
   # Download and install
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   ```
   
   **On Linux:**
   ```bash
   # Add the Cloud SDK distribution URI
   echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
   
   # Import the Google Cloud Platform public key
   curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -
   
   # Update and install
   sudo apt-get update && sudo apt-get install google-cloud-sdk
   ```
   
   **Verify installation:**
   ```bash
   gcloud --version
   ```

## Login and Authentication

After installing the tools, authenticate:

1. **Login to Firebase:**
   ```bash
   firebase login
   ```
   This will open a browser window for you to authenticate with your Google account.

2. **Set your Firebase project:**
   ```bash
   firebase use your-project-id
   ```
   Replace `your-project-id` with your actual Firebase project ID (e.g., `crowd-477405`).

3. **Login to Google Cloud (for gcloud commands):**
   ```bash
   gcloud auth login
   ```
   This will also open a browser window for authentication.

4. **Set your GCP project:**
   ```bash
   gcloud config set project your-project-id
   ```
   Replace `your-project-id` with your GCP project ID (should match your Firebase project).

5. **Verify you're logged in:**
   ```bash
   # Check Firebase login
   firebase projects:list
   
   # Check gcloud login
   gcloud auth list
   ```

## Prerequisites

1. **Deploy the Cloud Function first:**
   ```bash
   firebase deploy --only functions:fetchOfficialEvents
   ```

2. **Make the function publicly accessible (no authentication required):**
   After deployment, make the function public so Cloud Scheduler can call it without authentication:
   ```bash
   gcloud functions add-iam-policy-binding fetchOfficialEvents \
     --region=us-central1 \
     --member="allUsers" \
     --role="roles/cloudfunctions.invoker"
   ```
   
   Replace `us-central1` with your function's region if different.

3. **Get your function URL:**
   After deployment, note the function URL. It will be in the format:
   ```
   https://REGION-PROJECT-ID.cloudfunctions.net/fetchOfficialEvents
   ```

   You can also find it by running:
   ```bash
   firebase functions:list
   ```

4. **Ensure Cloud Scheduler API is enabled:**
   ```bash
   gcloud services enable cloudscheduler.googleapis.com
   ```

## Create Cloud Scheduler Job

Use the following gcloud command to create a scheduled job that runs weekly at midnight CST (6 AM UTC on Sundays):

**Simplified version (no authentication required since function is public):**
```bash
gcloud scheduler jobs create http fetch-official-events \
  --location=us-central1 \
  --schedule="0 6 * * 0" \
  --time-zone="America/Chicago" \
  --uri="https://REGION-PROJECT-ID.cloudfunctions.net/fetchOfficialEvents" \
  --http-method=GET
```

### Replace the following values:

- `REGION-PROJECT-ID`: Your Firebase function URL region and project ID (e.g., `us-central1-crowd-477405`)

### Schedule Explanation:

- `--schedule="0 6 * * 0"`: Runs at 6:00 AM UTC every Sunday (midnight CST)
- `--time-zone="America/Chicago"`: Central Time zone
- `--http-method=GET`: HTTP GET request (the function accepts GET requests)

## Verify the Job

List all scheduler jobs:
```bash
gcloud scheduler jobs list --location=us-central1
```

View job details:
```bash
gcloud scheduler jobs describe fetch-official-events --location=us-central1
```

## Test the Job Manually

Test the job manually before waiting for the scheduled time:
```bash
gcloud scheduler jobs run fetch-official-events --location=us-central1
```

## Monitor Execution

View job execution history:
```bash
gcloud scheduler jobs describe fetch-official-events --location=us-central1
```

Check Cloud Function logs:
```bash
firebase functions:log --only fetchOfficialEvents
```

Or view in Firebase Console:
1. Go to Firebase Console → Functions
2. Click on `fetchOfficialEvents`
3. View the Logs tab

## Update the Job

To update the schedule or other settings:
```bash
gcloud scheduler jobs update http fetch-official-events \
  --location=us-central1 \
  --schedule="0 6 * * 0" \
  --time-zone="America/Chicago"
```

## Delete the Job

To remove the scheduled job:
```bash
gcloud scheduler jobs delete fetch-official-events --location=us-central1
```

## Troubleshooting

### Job fails with authentication error:
- Make sure you made the function public (see Prerequisites step 2)
- Verify the function is public:
  ```bash
  gcloud functions get-iam-policy fetchOfficialEvents --region=us-central1
  ```
- If not public, run the command from Prerequisites step 2 again

### Job fails with 404:
- Verify the function URL is correct
- Ensure the function is deployed: `firebase functions:list`

### Job doesn't run:
- Check that Cloud Scheduler API is enabled
- Verify the schedule syntax is correct
- Check the timezone setting

## Schedule Format

The schedule uses cron syntax:
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

Examples:
- `0 6 * * 0` - Every Sunday at 6 AM UTC
- `0 0 * * *` - Every day at midnight UTC
- `0 */12 * * *` - Every 12 hours

