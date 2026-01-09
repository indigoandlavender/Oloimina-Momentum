// Oloimina - Momentum
// A ritual of motion, not a productivity tool.
// With Google Sheets sync and Google Calendar integration

(function() {
  'use strict';

  // --- Configuration ---
  const STAGNATION_THRESHOLD_HOURS = 48;
  const FADING_THRESHOLD_HOURS = 24;
  const STORAGE_KEY = 'oloimina_data';
  const REMINDER_CHECK_INTERVAL = 60000;

  // --- State ---
  let state = {
    tasks: [],
    projects: ['Digital', 'Riad', 'Annex', 'Personal'],
    lastMovement: null,
    notifiedReminders: [],
    lastSync: null
  };

  let currentView = 'today';
  let viewDate = new Date();

  // --- Google Auth State ---
  let tokenClient = null;
  let gapiInited = false;
  let gisInited = false;
  let isSignedIn = false;
  let accessToken = null;
  let currentUserEmail = null;
  let currentUserName = null;

  // --- DOM References ---
  const dom = {
    oloimina: document.getElementById('oloimina'),
    taskList: document.getElementById('taskList'),
    todayDate: document.getElementById('todayDate'),
    addTaskBtn: document.getElementById('addTaskBtn'),
    taskModal: document.getElementById('taskModal'),
    taskForm: document.getElementById('taskForm'),
    cancelBtn: document.getElementById('cancelBtn'),
    syncBtn: document.getElementById('syncBtn'),
    googleBtn: document.getElementById('googleBtn'),
    googleBtnText: document.getElementById('googleBtnText'),
    syncToGoogle: document.getElementById('syncToGoogle'),
    contextMenu: document.getElementById('contextMenu'),
    toastContainer: document.getElementById('toastContainer'),
    projectList: document.getElementById('projectList'),
    viewToday: document.getElementById('viewToday'),
    viewMonth: document.getElementById('viewMonth'),
    viewWeek: document.getElementById('viewWeek'),
    viewAgenda: document.getElementById('viewAgenda'),
    dayPrev: document.getElementById('dayPrev'),
    dayNext: document.getElementById('dayNext'),
    monthTitle: document.getElementById('monthTitle'),
    monthDays: document.getElementById('monthDays'),
    monthPrev: document.getElementById('monthPrev'),
    monthNext: document.getElementById('monthNext'),
    weekTitle: document.getElementById('weekTitle'),
    weekGrid: document.getElementById('weekGrid'),
    weekPrev: document.getElementById('weekPrev'),
    weekNext: document.getElementById('weekNext'),
    agendaTitle: document.getElementById('agendaTitle'),
    agendaList: document.getElementById('agendaList'),
    agendaPrev: document.getElementById('agendaPrev'),
    agendaNext: document.getElementById('agendaNext'),
    navBtns: document.querySelectorAll('.nav-btn')
  };

  // --- Toast Notifications ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // --- Utilities ---
  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  function parseDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  function formatDisplayDate(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function formatWeekRange(date) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
  }

  function getWeekStart(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatTime(time) {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'pm' : 'am';
    return `${hour % 12 || 12}:${m}${ampm}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Storage ---
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function load() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        state.tasks = parsed.tasks || [];
        state.projects = parsed.projects || ['Digital', 'Riad', 'Annex', 'Personal'];
        state.lastMovement = parsed.lastMovement || null;
        state.notifiedReminders = parsed.notifiedReminders || [];
        state.lastSync = parsed.lastSync || null;
      } catch (e) {
        console.error('Failed to load state', e);
      }
    }
    updateProjectList();
  }

  function updateProjectList() {
    dom.projectList.innerHTML = state.projects.map(p => `<option value="${p}">`).join('');
  }

  function addProject(name) {
    if (name && !state.projects.includes(name)) {
      state.projects.push(name);
      save();
      updateProjectList();
    }
  }

  // --- Google API Initialization ---
  function initGoogleAPI() {
    // Check if config is set
    if (!CONFIG || CONFIG.GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID.apps.googleusercontent.com') {
      console.log('Google APIs not configured. Edit config.js to enable sync.');
      dom.googleBtn.style.display = 'none';
      dom.syncBtn.style.display = 'none';
      return;
    }

    // Load GAPI client
    if (typeof gapi !== 'undefined') {
      gapi.load('client', async () => {
        await gapi.client.init({
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
            'https://sheets.googleapis.com/$discovery/rest?version=v4'
          ],
        });
        gapiInited = true;
        maybeEnableButtons();
      });
    }

    // Initialize Google Identity Services
    if (typeof google !== 'undefined' && google.accounts) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope: CONFIG.GOOGLE_SCOPES,
        callback: async (response) => {
          if (response.error) {
            console.error('Auth error:', response);
            showToast('Sign in failed', 'error');
            return;
          }
          accessToken = response.access_token;
          isSignedIn = true;

          // Get user info
          await fetchUserInfo();

          updateAuthUI();
          showToast('Signed in as ' + (currentUserName || currentUserEmail), 'success');

          // Auto-sync from sheets on sign in
          if (CONFIG.GOOGLE_SHEETS_ID && CONFIG.GOOGLE_SHEETS_ID !== 'YOUR_SPREADSHEET_ID') {
            await syncFromSheets();
          }
        },
      });
      gisInited = true;
      maybeEnableButtons();
    }
  }

  function maybeEnableButtons() {
    if (gapiInited && gisInited) {
      dom.syncBtn.disabled = false;
      dom.googleBtn.disabled = false;
    }
  }

  function updateAuthUI() {
    if (isSignedIn) {
      dom.googleBtnText.textContent = currentUserName || 'Connected';
      dom.googleBtn.classList.add('signed-in');
      dom.syncBtn.disabled = false;
    } else {
      dom.googleBtnText.textContent = 'Sign in';
      dom.googleBtn.classList.remove('signed-in');
      currentUserEmail = null;
      currentUserName = null;
    }
  }

  async function fetchUserInfo() {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      currentUserEmail = data.email;
      currentUserName = data.given_name || data.name || data.email.split('@')[0];
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  }

  function getCurrentUserShortName() {
    if (!currentUserEmail) return 'Me';
    // Map known emails to short names
    const email = currentUserEmail.toLowerCase();
    if (email.includes('zahra')) return 'Zahra';
    return currentUserName || 'Me';
  }

  function handleGoogleSignIn() {
    if (isSignedIn) {
      // Sign out
      google.accounts.oauth2.revoke(accessToken, () => {
        accessToken = null;
        isSignedIn = false;
        updateAuthUI();
        showToast('Signed out', 'info');
      });
    } else {
      // Sign in
      tokenClient.requestAccessToken({ prompt: 'consent' });
    }
  }

  // --- Google Calendar API ---
  async function syncWithGoogle() {
    if (!isSignedIn) {
      showToast('Please sign in to Google first', 'error');
      return;
    }

    dom.syncBtn.classList.add('syncing');
    dom.syncBtn.disabled = true;

    try {
      // First sync from sheets (cloud storage)
      if (CONFIG.GOOGLE_SHEETS_ID && CONFIG.GOOGLE_SHEETS_ID !== 'YOUR_SPREADSHEET_ID') {
        await syncFromSheets();
      }

      // Pull events from Google Calendar
      await pullFromGoogle();

      // Push local tasks to Google Calendar
      await pushToGoogle();

      // Sync back to sheets
      if (CONFIG.GOOGLE_SHEETS_ID && CONFIG.GOOGLE_SHEETS_ID !== 'YOUR_SPREADSHEET_ID') {
        await syncToSheets();
      }

      state.lastSync = Date.now();
      save();
      render();
      showToast('Sync complete', 'success');
    } catch (error) {
      console.error('Sync error:', error);
      showToast('Sync failed: ' + error.message, 'error');
    } finally {
      dom.syncBtn.classList.remove('syncing');
      dom.syncBtn.disabled = false;
    }
  }

  async function pullFromGoogle() {
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

    const response = await gapi.client.calendar.events.list({
      calendarId: CONFIG.GOOGLE_CALENDAR_ID,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250
    });

    const events = response.result.items || [];
    let imported = 0;

    for (const event of events) {
      // Skip if we already have this event
      const existing = state.tasks.find(t => t.googleEventId === event.id);
      if (existing) {
        // Update existing task if Google version is newer
        const googleUpdated = new Date(event.updated).getTime();
        if (googleUpdated > existing.updatedAt) {
          updateTaskFromGoogleEvent(existing, event);
        }
        continue;
      }

      // Skip events created by Oloimina (they have our marker in description)
      if (event.description && event.description.includes('[Oloimina]')) {
        continue;
      }

      // Import new event
      const task = createTaskFromGoogleEvent(event);
      if (task) {
        imported++;
      }
    }

    if (imported > 0) {
      showToast(`Imported ${imported} events from Google`, 'info');
    }
  }

  function createTaskFromGoogleEvent(event) {
    let startDate, startTime, endDate, endTime;

    if (event.start.dateTime) {
      const start = new Date(event.start.dateTime);
      startDate = formatDate(start);
      startTime = start.toTimeString().slice(0, 5);
    } else if (event.start.date) {
      startDate = event.start.date;
    }

    if (event.end.dateTime) {
      const end = new Date(event.end.dateTime);
      endDate = formatDate(end);
      endTime = end.toTimeString().slice(0, 5);
    } else if (event.end.date) {
      // For all-day events, Google uses exclusive end date
      const end = parseDate(event.end.date);
      end.setDate(end.getDate() - 1);
      endDate = formatDate(end);
    }

    const task = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: event.summary || 'Untitled',
      note: (event.description || '').replace('[Oloimina]', '').trim(),
      project: event.location || 'General',
      owner: 'Me',
      state: 'Active',
      startDate: startDate,
      startTime: startTime || null,
      endDate: endDate !== startDate ? endDate : null,
      endTime: endTime || null,
      repeat: parseRecurrence(event.recurrence),
      reminder: 'none',
      googleEventId: event.id,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    state.tasks.unshift(task);
    return task;
  }

  function updateTaskFromGoogleEvent(task, event) {
    let startDate, startTime, endDate, endTime;

    if (event.start.dateTime) {
      const start = new Date(event.start.dateTime);
      startDate = formatDate(start);
      startTime = start.toTimeString().slice(0, 5);
    } else if (event.start.date) {
      startDate = event.start.date;
    }

    if (event.end.dateTime) {
      const end = new Date(event.end.dateTime);
      endDate = formatDate(end);
      endTime = end.toTimeString().slice(0, 5);
    } else if (event.end.date) {
      const end = parseDate(event.end.date);
      end.setDate(end.getDate() - 1);
      endDate = formatDate(end);
    }

    task.title = event.summary || task.title;
    task.note = (event.description || '').replace('[Oloimina]', '').trim();
    task.startDate = startDate;
    task.startTime = startTime || null;
    task.endDate = endDate !== startDate ? endDate : null;
    task.endTime = endTime || null;
    task.updatedAt = Date.now();

    // Check if event was cancelled/deleted
    if (event.status === 'cancelled') {
      task.state = 'Done';
    }
  }

  function parseRecurrence(recurrence) {
    if (!recurrence || !recurrence.length) return 'none';
    const rule = recurrence[0];
    if (rule.includes('FREQ=DAILY')) return 'daily';
    if (rule.includes('FREQ=WEEKLY') && rule.includes('INTERVAL=2')) return 'biweekly';
    if (rule.includes('FREQ=WEEKLY')) return 'weekly';
    if (rule.includes('FREQ=MONTHLY')) return 'monthly';
    if (rule.includes('FREQ=YEARLY')) return 'yearly';
    return 'none';
  }

  async function pushToGoogle() {
    const tasksToSync = state.tasks.filter(t =>
      t.state !== 'Parked' &&
      t.syncToGoogle &&
      !t.googleEventId
    );

    for (const task of tasksToSync) {
      try {
        const event = await createGoogleEvent(task);
        task.googleEventId = event.id;
        task.updatedAt = Date.now();
      } catch (error) {
        console.error('Failed to sync task:', task.title, error);
      }
    }

    // Update existing synced tasks
    const tasksToUpdate = state.tasks.filter(t =>
      t.googleEventId &&
      t.needsGoogleUpdate
    );

    for (const task of tasksToUpdate) {
      try {
        await updateGoogleEvent(task);
        task.needsGoogleUpdate = false;
        task.updatedAt = Date.now();
      } catch (error) {
        console.error('Failed to update task:', task.title, error);
      }
    }

    save();
  }

  async function createGoogleEvent(task) {
    const event = buildGoogleEvent(task);

    const response = await gapi.client.calendar.events.insert({
      calendarId: CONFIG.GOOGLE_CALENDAR_ID,
      resource: event
    });

    return response.result;
  }

  async function updateGoogleEvent(task) {
    if (!task.googleEventId) return;

    const event = buildGoogleEvent(task);

    await gapi.client.calendar.events.update({
      calendarId: CONFIG.GOOGLE_CALENDAR_ID,
      eventId: task.googleEventId,
      resource: event
    });
  }

  async function deleteGoogleEvent(task) {
    if (!task.googleEventId) return;

    try {
      await gapi.client.calendar.events.delete({
        calendarId: CONFIG.GOOGLE_CALENDAR_ID,
        eventId: task.googleEventId
      });
    } catch (error) {
      console.error('Failed to delete Google event:', error);
    }
  }

  function buildGoogleEvent(task) {
    const event = {
      summary: task.title,
      description: (task.note || '') + '\n\n[Oloimina]',
      location: task.project || task.context || ''
    };

    // Set start/end times
    if (task.startTime) {
      event.start = {
        dateTime: `${task.startDate}T${task.startTime}:00`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      if (task.endTime) {
        event.end = {
          dateTime: `${task.endDate || task.startDate}T${task.endTime}:00`,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      } else {
        // Default 1 hour duration
        const start = new Date(`${task.startDate}T${task.startTime}`);
        const end = new Date(start.getTime() + 3600000);
        event.end = {
          dateTime: end.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      }
    } else {
      // All-day event
      event.start = { date: task.startDate };
      if (task.endDate) {
        const end = parseDate(task.endDate);
        end.setDate(end.getDate() + 1); // Google uses exclusive end
        event.end = { date: formatDate(end) };
      } else {
        const end = parseDate(task.startDate);
        end.setDate(end.getDate() + 1);
        event.end = { date: formatDate(end) };
      }
    }

    // Set recurrence
    if (task.repeat !== 'none') {
      const rruleMap = {
        daily: 'RRULE:FREQ=DAILY',
        weekly: 'RRULE:FREQ=WEEKLY',
        biweekly: 'RRULE:FREQ=WEEKLY;INTERVAL=2',
        monthly: 'RRULE:FREQ=MONTHLY',
        yearly: 'RRULE:FREQ=YEARLY'
      };
      if (rruleMap[task.repeat]) {
        event.recurrence = [rruleMap[task.repeat]];
      }
    }

    // Set reminder
    if (task.reminder !== 'none') {
      event.reminders = {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: parseInt(task.reminder) }
        ]
      };
    }

    return event;
  }

  async function syncSingleTask(task) {
    if (!isSignedIn) {
      showToast('Please sign in to Google first', 'error');
      return;
    }

    try {
      if (task.googleEventId) {
        await updateGoogleEvent(task);
        showToast('Updated in Google Calendar', 'success');
      } else {
        const event = await createGoogleEvent(task);
        task.googleEventId = event.id;
        task.syncToGoogle = true;
        save();
        showToast('Added to Google Calendar', 'success');
      }
      render();
    } catch (error) {
      console.error('Sync error:', error);
      showToast('Sync failed', 'error');
    }
  }

  // --- Google Sheets Sync ---
  const SHEET_HEADERS = ['id', 'title', 'note', 'project', 'owner', 'assignedBy', 'state', 'startDate', 'startTime', 'endDate', 'endTime', 'repeat', 'reminder', 'syncToGoogle', 'googleEventId', 'createdAt', 'updatedAt'];

  async function initSheet() {
    if (!CONFIG.GOOGLE_SHEETS_ID || CONFIG.GOOGLE_SHEETS_ID === 'YOUR_SPREADSHEET_ID') {
      return false;
    }

    try {
      // Check if sheet has headers
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.GOOGLE_SHEETS_ID,
        range: 'A1:Q1'
      });

      const values = response.result.values;
      if (!values || values.length === 0 || values[0][0] !== 'id') {
        // Initialize headers
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: CONFIG.GOOGLE_SHEETS_ID,
          range: 'A1:Q1',
          valueInputOption: 'RAW',
          resource: { values: [SHEET_HEADERS] }
        });
      }
      return true;
    } catch (error) {
      console.error('Failed to init sheet:', error);
      return false;
    }
  }

  async function syncFromSheets() {
    if (!isSignedIn || !CONFIG.GOOGLE_SHEETS_ID || CONFIG.GOOGLE_SHEETS_ID === 'YOUR_SPREADSHEET_ID') {
      return;
    }

    dom.syncBtn.classList.add('syncing');

    try {
      await initSheet();

      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.GOOGLE_SHEETS_ID,
        range: 'A2:Q1000'
      });

      const rows = response.result.values || [];
      if (rows.length === 0) {
        // Sheet is empty, push local tasks
        await syncToSheets();
        return;
      }

      // Convert rows to tasks
      const sheetTasks = rows.map(row => ({
        id: row[0] || '',
        title: row[1] || '',
        note: row[2] || '',
        project: row[3] || 'General',
        owner: row[4] || 'Me',
        assignedBy: row[5] || 'Me',
        state: row[6] || 'Active',
        startDate: row[7] || null,
        startTime: row[8] || null,
        endDate: row[9] || null,
        endTime: row[10] || null,
        repeat: row[11] || 'none',
        reminder: row[12] || 'none',
        syncToGoogle: row[13] === 'true',
        googleEventId: row[14] || null,
        createdAt: parseInt(row[15]) || Date.now(),
        updatedAt: parseInt(row[16]) || Date.now()
      })).filter(t => t.id && t.title);

      // Merge with local tasks - sheet is source of truth
      const sheetTaskIds = new Set(sheetTasks.map(t => t.id));
      const localOnlyTasks = state.tasks.filter(t => !sheetTaskIds.has(t.id));

      // Collect projects from imported tasks
      sheetTasks.forEach(t => {
        if (t.project) addProject(t.project);
      });

      // Keep local tasks that don't exist in sheet (newly created offline)
      state.tasks = [...sheetTasks];

      // Add back local-only tasks and sync them
      for (const localTask of localOnlyTasks) {
        state.tasks.push(localTask);
      }

      save();
      render();

      // Push back any local-only tasks
      if (localOnlyTasks.length > 0) {
        await syncToSheets();
      }

      showToast('Synced from cloud', 'success');
    } catch (error) {
      console.error('Sheets sync error:', error);
      showToast('Sync failed: ' + error.message, 'error');
    } finally {
      dom.syncBtn.classList.remove('syncing');
    }
  }

  async function syncToSheets() {
    if (!isSignedIn || !CONFIG.GOOGLE_SHEETS_ID || CONFIG.GOOGLE_SHEETS_ID === 'YOUR_SPREADSHEET_ID') {
      return;
    }

    try {
      await initSheet();

      // Convert tasks to rows
      const rows = state.tasks.map(task => [
        task.id,
        task.title,
        task.note || '',
        task.project || task.context || 'General',
        task.owner || 'Me',
        task.assignedBy || 'Me',
        task.state || 'Active',
        task.startDate || '',
        task.startTime || '',
        task.endDate || '',
        task.endTime || '',
        task.repeat || 'none',
        task.reminder || 'none',
        task.syncToGoogle ? 'true' : 'false',
        task.googleEventId || '',
        task.createdAt ? task.createdAt.toString() : '',
        task.updatedAt ? task.updatedAt.toString() : ''
      ]);

      // Clear existing data and write new
      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: CONFIG.GOOGLE_SHEETS_ID,
        range: 'A2:Q1000'
      });

      if (rows.length > 0) {
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: CONFIG.GOOGLE_SHEETS_ID,
          range: 'A2:Q' + (rows.length + 1),
          valueInputOption: 'RAW',
          resource: { values: rows }
        });
      }
    } catch (error) {
      console.error('Failed to sync to sheets:', error);
      throw error;
    }
  }

  // Debounced sheets sync
  let sheetsSyncTimeout = null;
  function scheduleSheetsSync() {
    if (!isSignedIn || !CONFIG.GOOGLE_SHEETS_ID || CONFIG.GOOGLE_SHEETS_ID === 'YOUR_SPREADSHEET_ID') {
      return;
    }

    if (sheetsSyncTimeout) clearTimeout(sheetsSyncTimeout);
    sheetsSyncTimeout = setTimeout(() => {
      syncToSheets().catch(err => console.error('Background sync failed:', err));
    }, 2000);
  }

  // --- Task Operations ---
  function createTask(data) {
    const project = (data.project || '').trim() || 'General';
    addProject(project);

    const task = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: data.title.trim(),
      note: (data.note || '').trim(),
      project: project,
      owner: data.owner || 'Me',
      assignedBy: getCurrentUserShortName(),
      state: 'Active',
      startDate: data.startDate || formatDate(new Date()),
      startTime: data.startTime || null,
      endDate: data.endDate || null,
      endTime: data.endTime || null,
      repeat: data.repeat || 'none',
      reminder: data.reminder || 'none',
      syncToGoogle: data.syncToGoogle || false,
      googleEventId: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.tasks.unshift(task);
    recordMovement();
    save();
    scheduleSheetsSync();

    // Sync to Google Calendar if requested
    if (task.syncToGoogle && isSignedIn) {
      syncSingleTask(task);
    }

    return task;
  }

  function updateTask(id, updates) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return null;

    const wasGoogleSynced = task.googleEventId;
    Object.assign(task, updates, { updatedAt: Date.now() });

    if (wasGoogleSynced) {
      task.needsGoogleUpdate = true;
    }

    recordMovement();
    save();
    scheduleSheetsSync();
    return task;
  }

  function deleteTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (task && task.googleEventId && isSignedIn) {
      deleteGoogleEvent(task);
    }

    const index = state.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      state.tasks.splice(index, 1);
      recordMovement();
      save();
      scheduleSheetsSync();
    }
  }

  function toggleTaskDone(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.state = task.state === 'Done' ? 'Active' : 'Done';
    task.updatedAt = Date.now();
    if (task.googleEventId) {
      task.needsGoogleUpdate = true;
    }
    recordMovement();
    save();
    scheduleSheetsSync();
    render();
  }

  // --- Reminders ---
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();
    state.tasks.forEach(task => {
      if (task.state === 'Done' || task.state === 'Parked') return;
      if (task.reminder === 'none' || !task.startDate || !task.startTime) return;

      const reminderKey = `${task.id}-${task.startDate}-${task.startTime}`;
      if (state.notifiedReminders.includes(reminderKey)) return;

      const taskDateTime = new Date(`${task.startDate}T${task.startTime}`);
      const reminderMinutes = parseInt(task.reminder);
      const reminderTime = new Date(taskDateTime.getTime() - reminderMinutes * 60000);

      if (now >= reminderTime && now < taskDateTime) {
        const title = reminderMinutes === 0 ? 'Task starting now' : `Task in ${reminderMinutes} minutes`;
        new Notification(title, { body: task.title, tag: task.id });
        state.notifiedReminders.push(reminderKey);
        save();
      }
    });
  }

  // --- Momentum ---
  function recordMovement() {
    state.lastMovement = Date.now();
  }

  function getOloiminaState() {
    const hours = state.lastMovement ? (Date.now() - state.lastMovement) / 3600000 : Infinity;
    if (hours <= FADING_THRESHOLD_HOURS) return 'present';
    if (hours <= STAGNATION_THRESHOLD_HOURS) return 'fading';
    return 'absent';
  }

  // --- Task Queries ---
  function getTodayTasks() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return state.tasks.filter(task => {
      if (task.state === 'Done' || task.state === 'Parked') return false;
      const start = parseDate(task.startDate);
      if (!start) return true;
      if (task.repeat !== 'none') return isTaskOnDate(task, today);
      return start <= today;
    }).sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return 0;
    });
  }

  function isTaskOnDate(task, date) {
    const start = parseDate(task.startDate);
    const end = parseDate(task.endDate);
    if (!start) return false;

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    if (end) end.setHours(0, 0, 0, 0);

    if (task.repeat === 'none') {
      return end ? (d >= start && d <= end) : isSameDay(d, start);
    }

    if (d < start) return false;
    const daysDiff = Math.floor((d - start) / 86400000);

    switch (task.repeat) {
      case 'daily': return true;
      case 'weekly': return daysDiff % 7 === 0;
      case 'biweekly': return daysDiff % 14 === 0;
      case 'monthly': return d.getDate() === start.getDate();
      case 'yearly': return d.getDate() === start.getDate() && d.getMonth() === start.getMonth();
      default: return false;
    }
  }

  function getTasksForDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    return state.tasks.filter(task => {
      if (task.state === 'Done' || task.state === 'Parked') return false;
      return isTaskOnDate(task, d);
    }).sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return 0;
    });
  }

  function countTasksOnDate(date) {
    return getTasksForDate(date).length;
  }

  // --- Rendering ---
  function render() {
    dom.oloimina.className = 'oloimina ' + getOloiminaState();

    switch (currentView) {
      case 'today': renderToday(); break;
      case 'month': renderMonth(); break;
      case 'week': renderWeek(); break;
      case 'agenda': renderAgenda(); break;
    }
  }

  function renderToday() {
    const displayDate = currentView === 'today' ? viewDate : new Date();
    dom.todayDate.textContent = formatDisplayDate(displayDate);
    dom.taskList.innerHTML = getTasksForSelectedDay(displayDate).map(taskHTML).join('');
  }

  function getTasksForSelectedDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return state.tasks.filter(task => {
      if (task.state === 'Done' || task.state === 'Parked') return false;
      const start = parseDate(task.startDate);
      if (!start) return isSameDay(d, today); // Tasks without date only show on actual today
      if (task.repeat !== 'none') return isTaskOnDate(task, d);
      // For past dates, show tasks that started on or before that date and aren't done
      // For today/future, show tasks that start on or before that date
      return start <= d;
    }).sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return 0;
    });
  }

  function taskHTML(task) {
    const stateClass = task.state.toLowerCase();
    const syncedClass = task.googleEventId ? 'synced' : '';
    const isChecked = task.state === 'Done';
    const meta = [];
    if (task.project || task.context) meta.push(task.project || task.context);
    if (task.owner !== 'Me') meta.push('→ ' + task.owner);
    if (task.assignedBy && task.assignedBy !== 'Me' && task.assignedBy !== getCurrentUserShortName()) {
      meta.push('from ' + task.assignedBy);
    }
    if (task.repeat !== 'none') meta.push(getRepeatLabel(task.repeat));

    let timeStr = '';
    if (task.startTime) {
      timeStr = formatTime(task.startTime);
      if (task.endTime) timeStr += ` – ${formatTime(task.endTime)}`;
    }

    return `
      <li class="task-item ${stateClass} ${syncedClass}" data-id="${task.id}">
        <div class="task-checkbox ${isChecked ? 'checked' : ''}" data-id="${task.id}"></div>
        <div class="task-content" data-id="${task.id}">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta">${meta.map(m => `<span>${escapeHtml(m)}</span>`).join('')}</div>
        </div>
        ${timeStr ? `<div class="task-time">${timeStr}</div>` : ''}
      </li>
    `;
  }

  function getRepeatLabel(repeat) {
    return { daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', yearly: 'Yearly' }[repeat] || '';
  }

  function renderMonth() {
    dom.monthTitle.textContent = formatMonthYear(viewDate);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = new Date();
    let html = '';

    const prevMonth = new Date(year, month, 0);
    for (let i = firstDay.getDay() - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonth.getDate() - i);
      html += calDayHTML(date, date.getDate(), true);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      html += calDayHTML(date, day, false, isSameDay(date, today));
    }

    const totalCells = Math.ceil((firstDay.getDay() + lastDay.getDate()) / 7) * 7;
    const remaining = totalCells - (firstDay.getDay() + lastDay.getDate());
    for (let day = 1; day <= remaining; day++) {
      const date = new Date(year, month + 1, day);
      html += calDayHTML(date, day, true);
    }

    dom.monthDays.innerHTML = html;
  }

  function calDayHTML(date, day, isOtherMonth, isToday = false) {
    const count = countTasksOnDate(date);
    const classes = ['cal-day'];
    if (isOtherMonth) classes.push('other-month');
    if (isToday) classes.push('today');
    if (count > 0) classes.push('has-tasks');
    if (count > 1) classes.push('multiple');
    return `<div class="${classes.join(' ')}" data-date="${formatDate(date)}">${day}</div>`;
  }

  function renderWeek() {
    const weekStart = getWeekStart(viewDate);
    dom.weekTitle.textContent = formatWeekRange(viewDate);
    const today = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = '';

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const tasks = getTasksForDate(date);
      html += `
        <div class="week-day ${isSameDay(date, today) ? 'today' : ''}" data-date="${formatDate(date)}">
          <div class="week-day-header">${days[i]}</div>
          <div class="week-day-number">${date.getDate()}</div>
          ${tasks.slice(0, 4).map(t => `<div class="week-task" data-id="${t.id}">${t.startTime ? formatTime(t.startTime) + ' ' : ''}${escapeHtml(t.title)}</div>`).join('')}
          ${tasks.length > 4 ? `<div class="week-task">+${tasks.length - 4} more</div>` : ''}
        </div>
      `;
    }
    dom.weekGrid.innerHTML = html;
  }

  function renderAgenda() {
    const startDate = new Date(viewDate);
    startDate.setHours(0, 0, 0, 0);
    dom.agendaTitle.textContent = formatDisplayDate(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let html = '';

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const isToday = isSameDay(date, today);
      const tasks = getTasksForDate(date);
      const label = i === 0 && isToday ? 'Today' : i === 1 && isSameDay(new Date(today.getTime() + 86400000), date) ? 'Tomorrow' : formatDisplayDate(date);

      html += `
        <div class="agenda-day ${isToday ? 'today' : ''}">
          <div class="agenda-day-header">${label}</div>
          <div class="agenda-tasks">
            ${tasks.length === 0 ? '<div class="agenda-empty">No tasks</div>' :
              tasks.map(t => `
                <div class="agenda-task" data-id="${t.id}">
                  <div class="agenda-task-title">${escapeHtml(t.title)}</div>
                  <div class="agenda-task-meta">${t.startTime ? formatTime(t.startTime) + ' · ' : ''}${t.project || t.context || ''}${t.owner !== 'Me' ? ' · ' + t.owner : ''}</div>
                </div>
              `).join('')}
          </div>
        </div>
      `;
    }
    dom.agendaList.innerHTML = html;
  }

  // --- View Switching ---
  function switchView(view) {
    currentView = view;
    viewDate = new Date();
    dom.navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1)).classList.add('active');
    render();
  }

  // --- Modal ---
  let editingTaskId = null;

  function openModal(task = null) {
    editingTaskId = task ? task.id : null;
    dom.taskForm.reset();
    updateProjectList();

    if (task) {
      dom.taskForm.title.value = task.title;
      dom.taskForm.note.value = task.note || '';
      dom.taskForm.startDate.value = task.startDate || '';
      dom.taskForm.startTime.value = task.startTime || '';
      dom.taskForm.endDate.value = task.endDate || '';
      dom.taskForm.endTime.value = task.endTime || '';
      dom.taskForm.repeat.value = task.repeat || 'none';
      dom.taskForm.reminder.value = task.reminder || 'none';
      dom.taskForm.project.value = task.project || task.context || '';
      dom.taskForm.owner.value = task.owner;
      dom.syncToGoogle.checked = task.syncToGoogle || !!task.googleEventId;
    } else {
      dom.taskForm.startDate.value = formatDate(new Date());
      dom.syncToGoogle.checked = isSignedIn;
    }

    dom.taskModal.showModal();
    dom.taskForm.title.focus();
  }

  function closeModal() {
    dom.taskModal.close();
    editingTaskId = null;
  }

  function getFormData() {
    const fd = new FormData(dom.taskForm);
    return {
      title: fd.get('title'),
      note: fd.get('note'),
      startDate: fd.get('startDate'),
      startTime: fd.get('startTime') || null,
      endDate: fd.get('endDate') || null,
      endTime: fd.get('endTime') || null,
      repeat: fd.get('repeat'),
      reminder: fd.get('reminder'),
      project: fd.get('project'),
      owner: fd.get('owner'),
      syncToGoogle: dom.syncToGoogle.checked
    };
  }

  // --- Context Menu ---
  let contextMenuTaskId = null;

  function showContextMenu(e, taskId) {
    contextMenuTaskId = taskId;
    dom.contextMenu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
    dom.contextMenu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
    dom.contextMenu.classList.add('visible');
  }

  function hideContextMenu() {
    dom.contextMenu.classList.remove('visible');
    contextMenuTaskId = null;
  }

  function handleContextMenuAction(action) {
    if (!contextMenuTaskId) return;
    const task = state.tasks.find(t => t.id === contextMenuTaskId);
    hideContextMenu();

    switch (action) {
      case 'edit': if (task) openModal(task); break;
      case 'sync': if (task) syncSingleTask(task); break;
      case 'waiting': updateTask(contextMenuTaskId, { state: 'Waiting' }); break;
      case 'parked': updateTask(contextMenuTaskId, { state: 'Parked' }); break;
      case 'delete': deleteTask(contextMenuTaskId); break;
    }
    render();
  }

  // --- Event Handlers ---
  function handleTaskClick(e) {
    const checkbox = e.target.closest('.task-checkbox');
    if (checkbox) {
      e.preventDefault();
      toggleTaskDone(checkbox.dataset.id);
      return;
    }

    const content = e.target.closest('.task-content');
    if (content && e.type === 'contextmenu') {
      e.preventDefault();
      showContextMenu(e, content.dataset.id);
      return;
    }

    if (content && e.type === 'dblclick') {
      const task = state.tasks.find(t => t.id === content.dataset.id);
      if (task) openModal(task);
    }
  }

  function handleCalendarClick(e) {
    const weekTask = e.target.closest('.week-task');
    if (weekTask && weekTask.dataset.id) {
      const task = state.tasks.find(t => t.id === weekTask.dataset.id);
      if (task) openModal(task);
      return;
    }

    const agendaTask = e.target.closest('.agenda-task');
    if (agendaTask && agendaTask.dataset.id) {
      const task = state.tasks.find(t => t.id === agendaTask.dataset.id);
      if (task) openModal(task);
      return;
    }

    const calDay = e.target.closest('.cal-day');
    if (calDay && calDay.dataset.date) {
      viewDate = parseDate(calDay.dataset.date);
      switchView('agenda');
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const data = getFormData();
    if (!data.title.trim()) return;

    if (editingTaskId) {
      updateTask(editingTaskId, data);
      const task = state.tasks.find(t => t.id === editingTaskId);
      if (task && task.googleEventId && isSignedIn) {
        syncSingleTask(task);
      }
    } else {
      createTask(data);
    }

    closeModal();
    render();
  }

  // --- Initialize ---
  function init() {
    load();
    requestNotificationPermission();

    // Wait for Google APIs to load
    setTimeout(initGoogleAPI, 500);

    // Navigation
    dom.navBtns.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

    // Task operations
    dom.addTaskBtn.addEventListener('click', () => openModal());
    dom.cancelBtn.addEventListener('click', closeModal);
    dom.taskForm.addEventListener('submit', handleFormSubmit);

    // Google sync
    dom.googleBtn.addEventListener('click', handleGoogleSignIn);
    dom.syncBtn.addEventListener('click', syncWithGoogle);

    // Task interactions
    dom.taskList.addEventListener('click', handleTaskClick);
    dom.taskList.addEventListener('contextmenu', handleTaskClick);
    dom.taskList.addEventListener('dblclick', handleTaskClick);

    // Calendar interactions
    dom.monthDays.addEventListener('click', handleCalendarClick);
    dom.weekGrid.addEventListener('click', handleCalendarClick);
    dom.agendaList.addEventListener('click', handleCalendarClick);

    // Calendar navigation
    dom.dayPrev.addEventListener('click', () => { viewDate.setDate(viewDate.getDate() - 1); render(); });
    dom.dayNext.addEventListener('click', () => { viewDate.setDate(viewDate.getDate() + 1); render(); });
    dom.monthPrev.addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() - 1); render(); });
    dom.monthNext.addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() + 1); render(); });
    dom.weekPrev.addEventListener('click', () => { viewDate.setDate(viewDate.getDate() - 7); render(); });
    dom.weekNext.addEventListener('click', () => { viewDate.setDate(viewDate.getDate() + 7); render(); });
    dom.agendaPrev.addEventListener('click', () => { viewDate.setDate(viewDate.getDate() - 7); render(); });
    dom.agendaNext.addEventListener('click', () => { viewDate.setDate(viewDate.getDate() + 7); render(); });

    // Context menu
    dom.contextMenu.addEventListener('click', e => {
      const action = e.target.dataset.action;
      if (action) handleContextMenuAction(action);
    });
    document.addEventListener('click', e => { if (!dom.contextMenu.contains(e.target)) hideContextMenu(); });

    // Modal backdrop click
    dom.taskModal.addEventListener('click', e => { if (e.target === dom.taskModal) closeModal(); });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') hideContextMenu();
      if (e.key === 'n' && !dom.taskModal.open && document.activeElement === document.body) {
        e.preventDefault();
        openModal();
      }
    });

    // Periodic checks
    setInterval(() => dom.oloimina.className = 'oloimina ' + getOloiminaState(), 60000);
    setInterval(checkReminders, REMINDER_CHECK_INTERVAL);

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
