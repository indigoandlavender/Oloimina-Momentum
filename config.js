// Google Calendar API Configuration
// Fill in your credentials from Google Cloud Console

const CONFIG = {
  // Get this from: https://console.cloud.google.com/apis/credentials
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',

  // Calendar ID to sync with (usually 'primary' for main calendar)
  GOOGLE_CALENDAR_ID: 'primary',

  // Scopes needed for calendar access
  GOOGLE_SCOPES: 'https://www.googleapis.com/auth/calendar.events',

  // App name shown in Google consent screen
  APP_NAME: 'Oloimina'
};

// Don't modify below this line
if (typeof module !== 'undefined') {
  module.exports = CONFIG;
}
