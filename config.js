// Google API Configuration
// Fill in your credentials from Google Cloud Console

const CONFIG = {
  // Get this from: https://console.cloud.google.com/apis/credentials
  GOOGLE_CLIENT_ID: '667787303898-6co0icjicbtojt7i9gff2p7inh6ll7kh.apps.googleusercontent.com',

  // Calendar ID to sync with (usually 'primary' for main calendar)
  GOOGLE_CALENDAR_ID: 'primary',

  // Google Sheets ID for task storage (get from spreadsheet URL)
  // URL format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
  GOOGLE_SHEETS_ID: '1_KQfKLziIV7JhdVns-aQD6KsblzMkRmKdXDu-8tr5vo',

  // Scopes needed for calendar, sheets, and user info
  GOOGLE_SCOPES: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',

  // App name shown in Google consent screen
  APP_NAME: 'Oloimina'
};

// Don't modify below this line
if (typeof module !== 'undefined') {
  module.exports = CONFIG;
}
