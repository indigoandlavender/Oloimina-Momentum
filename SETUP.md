# Oloimina Setup Guide

## Google Cloud Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" at the top, then "New Project"
3. Name it "Oloimina" and click "Create"
4. Wait for the project to be created, then select it

### 2. Enable APIs

1. In the left sidebar, go to "APIs & Services" > "Library"
2. Search for and enable:
   - **Google Calendar API**
   - **Google Sheets API**

### 3. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Select "External" and click "Create"
3. Fill in:
   - App name: `Oloimina`
   - User support email: your email
   - Developer contact: your email
4. Click "Save and Continue"
5. On Scopes page, click "Add or Remove Scopes"
6. Add these scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/spreadsheets`
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
   - Your Vercel URL (e.g., `https://oloimina.riaddisiena.com`)
6. Click "Create"
7. Copy the "Client ID" (looks like `xxxxx.apps.googleusercontent.com`)

## Google Sheets Setup (for cross-device sync)

### 1. Create a Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it "Oloimina Tasks" (or anything you like)
4. Copy the spreadsheet ID from the URL:
   - URL format: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
   - Copy just the `SPREADSHEET_ID` part

### 2. Update config.js

```javascript
const CONFIG = {
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  GOOGLE_CALENDAR_ID: 'primary',
  GOOGLE_SHEETS_ID: 'YOUR_SPREADSHEET_ID',  // Add this
  GOOGLE_SCOPES: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets',
  APP_NAME: 'Oloimina'
};
```

## Running Locally

Since Google OAuth requires HTTPS or localhost:

```bash
# Using Python
python3 -m http.server 3000

# Or using Node.js
npx serve -p 3000
```

Then open `http://localhost:3000` in your browser.

## How Sync Works

1. **Sign in** - Click "Sign in" to connect your Google account
2. **Auto-sync on login** - Tasks automatically load from your Google Sheet
3. **Real-time sync** - Changes sync to the sheet within 2 seconds
4. **Manual sync** - Click the sync button to force a full sync
5. **Cross-device** - Open on any device, sign in, and see your tasks

## Notes

- **Google Sheets** = your task database (syncs across all devices)
- **Google Calendar** = optional, for tasks you want on your calendar
- Tasks with a green dot are synced to Google Calendar
- The app also keeps a local copy in your browser for offline use
