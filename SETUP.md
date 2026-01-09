# Oloimina Setup Guide

## Google Calendar Integration Setup

To enable two-way sync with Google Calendar, follow these steps:

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" at the top, then "New Project"
3. Name it "Oloimina" and click "Create"
4. Wait for the project to be created, then select it

### 2. Enable Google Calendar API

1. In the left sidebar, go to "APIs & Services" > "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

### 3. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Select "External" and click "Create"
3. Fill in:
   - App name: `Oloimina`
   - User support email: your email
   - Developer contact: your email
4. Click "Save and Continue"
5. On Scopes page, click "Add or Remove Scopes"
6. Find and select `https://www.googleapis.com/auth/calendar.events`
7. Click "Update" then "Save and Continue"
8. On Test users page, click "Add Users"
9. Add your Google email address
10. Click "Save and Continue"

### 4. Create OAuth Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Application type: "Web application"
4. Name: "Oloimina Web"
5. Under "Authorized JavaScript origins", add:
   - `http://localhost:3000` (for local testing)
   - `http://127.0.0.1:3000`
   - Your Vercel URL (e.g., `https://oloimina.vercel.app`)
6. Click "Create"
7. Copy the "Client ID" (looks like `xxxxx.apps.googleusercontent.com`)

### 5. Update config.js

Open `config.js` and replace the placeholder:

```javascript
const CONFIG = {
  GOOGLE_CLIENT_ID: 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com',
  // ... rest stays the same
};
```

### 6. Running Locally

Since Google OAuth requires HTTPS or localhost, use a simple server:

```bash
# Using Python
python3 -m http.server 3000

# Or using Node.js (if you have npx)
npx serve -p 3000
```

Then open `http://localhost:3000` in your browser.

### 7. Deploying to Vercel

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your repository
4. Deploy
5. Add your Vercel URL to the OAuth authorized origins (Step 4.5)

## Usage

1. Click "Sign in" to connect your Google account
2. Grant calendar access when prompted
3. Use the sync button to pull events from Google Calendar
4. Check "Sync to Google" when creating tasks to push them to your calendar
5. Right-click any task and select "Sync to Google" to sync existing tasks

## Notes

- Tasks synced from Google will have a green indicator
- The app stores tasks locally in your browser
- Google sync requires an internet connection
- Your Google credentials are never stored - only temporary access tokens
