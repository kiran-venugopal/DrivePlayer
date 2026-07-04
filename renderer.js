// Redirect console logs to main process file logger
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  originalConsoleLog.apply(console, args);
  if (window.api && window.api.logMessage) {
    window.api.logMessage('RENDERER-INFO', args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
  }
};

console.error = (...args) => {
  originalConsoleError.apply(console, args);
  if (window.api && window.api.logMessage) {
    window.api.logMessage('RENDERER-ERROR', args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
  }
};

console.warn = (...args) => {
  originalConsoleWarn.apply(console, args);
  if (window.api && window.api.logMessage) {
    window.api.logMessage('RENDERER-WARN', args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
  }
};

// State variables
let currentFolder = { id: 'root', name: 'Home' };
let folderHistory = []; // Stack to keep track of folder path history
let filesList = []; // Holds files in the current folder
let selectedFile = null;
let appConfig = {
  clientId: '',
  clientSecret: '',
  hasRefreshToken: false
};

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const loginActionContainer = document.getElementById('login-action-container');
const btnConnect = document.getElementById('btn-connect');
const btnGoSettings = document.getElementById('btn-go-settings');

const navBrowse = document.getElementById('btn-browse');
const navSettings = document.getElementById('btn-settings-nav');
const panelBrowse = document.getElementById('panel-browse');
const panelSettings = document.getElementById('panel-settings');

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const btnLogout = document.getElementById('btn-logout');

const btnBack = document.getElementById('btn-back');
const btnHome = document.getElementById('btn-home');
const btnRefresh = document.getElementById('btn-refresh');
const breadcrumbs = document.getElementById('breadcrumbs');
const fileGrid = document.getElementById('file-grid');
const gridLoader = document.getElementById('grid-loader');
const emptyState = document.getElementById('empty-state');

const searchInput = document.getElementById('search-input');
const btnSearch = document.getElementById('btn-search');

const mediaDrawer = document.getElementById('media-drawer');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const drawerTitle = document.getElementById('drawer-title');
const drawerSize = document.getElementById('drawer-size');
const drawerDate = document.getElementById('drawer-date');
const btnPlayApp = document.getElementById('btn-play-app');
const btnPlayVlc = document.getElementById('btn-play-vlc');
const btnPlayIina = document.getElementById('btn-play-iina');
const btnPlayDefault = document.getElementById('btn-play-default');
const btnCopyLink = document.getElementById('btn-copy-link');
const copyAlert = document.getElementById('copy-alert');
const playerOverlay = document.getElementById('player-overlay');
const btnClosePlayer = document.getElementById('btn-close-player');
const builtInVideo = document.getElementById('built-in-video');
const playerVideoTitle = document.getElementById('player-video-title');
const btnSettingsConnect = document.getElementById('btn-settings-connect');
const btnOpenLog = document.getElementById('btn-open-log');




const settingsForm = document.getElementById('settings-form');
const inputClientId = document.getElementById('input-client-id');
const inputClientSecret = document.getElementById('input-client-secret');
const linkGcp = document.getElementById('link-gcp');

// ==========================================
// INITIALIZATION
// ==========================================
async function init() {
  setupEventListeners();
  await refreshConfigState();
  
  if (appConfig.clientId && appConfig.clientSecret) {
    if (appConfig.hasRefreshToken) {
      // Already logged in!
      updateConnectionStatus(true, 'Connected');
      loginOverlay.classList.remove('active');
      loadFolder('root', 'Home', false);
    } else {
      // Need login, show overlay
      showLoginButton();
      loginOverlay.classList.add('active');
    }
  } else {
    // Missing credentials, prompt to settings
    showCredentialsWarning();
    loginOverlay.classList.add('active');
    switchTab('settings');
  }
}

// Fetch current credentials config from main
async function refreshConfigState() {
  appConfig = await window.api.loadConfig();
  if (appConfig.clientId) inputClientId.value = appConfig.clientId;
  if (appConfig.clientSecret) inputClientSecret.value = appConfig.clientSecret;
  
  if (appConfig.clientId && appConfig.clientSecret) {
    btnSettingsConnect.style.display = 'inline-block';
  } else {
    btnSettingsConnect.style.display = 'none';
  }
}


function updateConnectionStatus(connected, text) {
  if (connected) {
    statusDot.className = 'status-indicator connected';
    statusText.textContent = text || 'Connected';
    btnLogout.style.display = 'block';
  } else {
    statusDot.className = 'status-indicator';
    statusText.textContent = text || 'Disconnected';
    btnLogout.style.display = 'none';
  }
}

function showLoginButton() {
  loginActionContainer.innerHTML = `
    <button id="btn-connect" class="btn-connect">Connect Google Drive</button>
    <p class="login-tip">Authenticate with your Google account to browse and stream files.</p>
  `;
  document.getElementById('btn-connect').addEventListener('click', startGoogleLogin);
}

function showCredentialsWarning() {
  loginActionContainer.innerHTML = `
    <div style="background-color:rgba(255,74,112,0.1); border: 1px solid var(--error); border-radius:10px; padding: 16px; margin-bottom: 20px;">
      <p style="color:var(--error); margin-bottom:0; font-size: 0.9rem;">⚠️ Client ID & Client Secret are not configured.</p>
    </div>
    <p class="login-tip">Please go to API Settings and add your Google credentials to start.</p>
  `;
}

// ==========================================
// TABS & NAVIGATION
// ==========================================
function switchTab(tab) {
  console.log('switchTab called with:', tab);
  if (tab === 'browse') {
    navBrowse.classList.add('active');
    navSettings.classList.remove('active');
    panelBrowse.classList.add('active');
    panelSettings.classList.remove('active');
    
    // Show login overlay if not connected
    if (statusText.textContent !== 'Connected') {
      console.log('Showing login overlay (not connected)');
      loginOverlay.classList.add('active');
    }
  } else {
    navBrowse.classList.remove('active');
    navSettings.classList.add('active');
    panelBrowse.classList.remove('active');
    panelSettings.classList.add('active');
    
    // Hide login overlay on settings tab so the user can enter credentials
    console.log('Hiding login overlay for settings panel');
    loginOverlay.classList.remove('active');
  }
}



function updateBreadcrumbs() {
  let html = `<span class="crumb" data-id="root">Home</span>`;
  let accumPath = '';
  
  folderHistory.forEach((item, index) => {
    html += ` <span class="separator">/</span> <span class="crumb" data-id="${item.id}" data-index="${index}">${item.name}</span>`;
  });
  
  if (currentFolder.id !== 'root') {
    html += ` <span class="separator">/</span> <span class="crumb active">${currentFolder.name}</span>`;
  }
  
  breadcrumbs.innerHTML = html;
  
  // Breadcrumb click listeners
  breadcrumbs.querySelectorAll('.crumb').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const idx = e.target.getAttribute('data-index');
      
      if (!id) return;
      
      if (id === 'root') {
        loadFolder('root', 'Home', false);
        folderHistory = [];
        btnBack.disabled = true;
      } else {
        const index = parseInt(idx);
        const targetFolder = folderHistory[index];
        folderHistory = folderHistory.slice(0, index);
        loadFolder(targetFolder.id, targetFolder.name, false);
      }
    });
  });
}

// ==========================================
// DATA LOADING
// ==========================================
async function loadFolder(folderId, folderName, pushToHistory = true) {
  closeDrawer();
  
  if (pushToHistory && currentFolder.id !== folderId) {
    folderHistory.push({ id: currentFolder.id, name: currentFolder.name });
  }
  
  currentFolder = { id: folderId, name: folderName };
  btnBack.disabled = folderHistory.length === 0;
  
  updateBreadcrumbs();
  
  // Show spinner, clear grid items (except loader itself)
  gridLoader.style.display = 'flex';
  emptyState.style.display = 'none';
  
  // Remove existing cards
  const cards = fileGrid.querySelectorAll('.grid-item');
  cards.forEach(card => card.remove());
  
  const res = await window.api.fetchDriveFiles(folderId);
  gridLoader.style.display = 'none';
  
  if (res.success) {
    filesList = res.files;
    renderGrid(filesList);
  } else {
    // Show error
    fileGrid.insertAdjacentHTML('beforeend', `
      <div class="empty-state" style="grid-column: 1/-1;">
        <span class="empty-icon" style="color:var(--error);">⚠️</span>
        <h3>Failed to load files</h3>
        <p>${res.error || 'Unknown error occurred'}</p>
      </div>
    `);
    
    if (res.error && res.error.includes('Unauthorized')) {
      updateConnectionStatus(false, 'Session Expired');
      loginOverlay.classList.add('active');
      showLoginButton();
    }
  }
}

function renderGrid(files) {
  if (!files || files.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  
  files.forEach(file => {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const sizeStr = isFolder ? '' : formatBytes(file.size);
    const itemClass = isFolder ? 'grid-item folder' : 'grid-item video';
    const icon = isFolder ? '📁' : '🎬';
    
    const itemHtml = `
      <div class="${itemClass}" data-id="${file.id}">
        <div class="grid-icon">${icon}</div>
        <div class="grid-name" title="${file.name}">${file.name}</div>
        <div class="grid-meta">${isFolder ? 'Folder' : sizeStr}</div>
      </div>
    `;
    
    fileGrid.insertAdjacentHTML('beforeend', itemHtml);
  });
  
  // Add listeners
  fileGrid.querySelectorAll('.grid-item').forEach(card => {
    const id = card.getAttribute('data-id');
    const file = files.find(f => f.id === id);
    
    card.addEventListener('click', () => {
      // Deselect all
      fileGrid.querySelectorAll('.grid-item').forEach(c => c.classList.remove('selected'));
      
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Just highlight folder on single click (can double click to enter)
        card.classList.add('selected');
        closeDrawer();
      } else {
        card.classList.add('selected');
        openDrawer(file);
      }
    });
    
    card.addEventListener('dblclick', () => {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        loadFolder(file.id, file.name);
      }
    });
  });
}

// ==========================================
// SEARCH
// ==========================================
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    loadFolder(currentFolder.id, currentFolder.name, false);
    return;
  }
  
  closeDrawer();
  gridLoader.style.display = 'flex';
  emptyState.style.display = 'none';
  
  const cards = fileGrid.querySelectorAll('.grid-item');
  cards.forEach(card => card.remove());
  
  breadcrumbs.innerHTML = `Search Results: <span class="crumb active">"${query}"</span>`;
  btnBack.disabled = false; // allow returning from search
  
  const res = await window.api.fetchDriveFiles(null, query);
  gridLoader.style.display = 'none';
  
  if (res.success) {
    renderGrid(res.files);
  } else {
    fileGrid.insertAdjacentHTML('beforeend', `
      <div class="empty-state" style="grid-column: 1/-1;">
        <span class="empty-icon" style="color:var(--error);">⚠️</span>
        <h3>Search failed</h3>
        <p>${res.error}</p>
      </div>
    `);
  }
}

// ==========================================
// DRAWER
// ==========================================
function openDrawer(file) {
  selectedFile = file;
  drawerTitle.textContent = file.name;
  drawerTitle.title = file.name;
  drawerSize.textContent = formatBytes(file.size);
  drawerDate.textContent = new Date(file.modifiedTime).toLocaleDateString();
  
  mediaDrawer.classList.add('active');
}

function closeDrawer() {
  selectedFile = null;
  mediaDrawer.classList.remove('active');
  fileGrid.querySelectorAll('.grid-item').forEach(c => c.classList.remove('selected'));
}

// ==========================================
// PLAYBACK / STREAMING ACTIONS
// ==========================================
async function startGoogleLogin() {
  try {
    loginActionContainer.innerHTML = `
      <div class="spinner" style="margin: 0 auto 12px auto;"></div>
      <p style="color:var(--text-sub);">Please complete connection in your browser...</p>
    `;
    
    const res = await window.api.startOauth();
    if (res.success) {
      updateConnectionStatus(true, 'Connected');
      loginOverlay.classList.remove('active');
      loadFolder('root', 'Home', false);
    }
  } catch (err) {
    console.error('OAuth connection error:', err);
    loginActionContainer.innerHTML = `
      <div style="background-color:rgba(255,74,112,0.1); border: 1px solid var(--error); border-radius:10px; padding:12px; margin-bottom:16px;">
        <p style="color:var(--error); margin-bottom:0; font-size:0.85rem;">Login failed: ${err.message}</p>
      </div>
      <button id="btn-connect" class="btn-connect">Try Connecting Again</button>
    `;
    document.getElementById('btn-connect').addEventListener('click', startGoogleLogin);
  }
}

async function playVideo(player) {
  if (!selectedFile) return;
  
  const originalText = player === 'vlc' ? 'Play in VLC' : player === 'iina' ? 'Play in IINA' : 'Default Player';
  const button = player === 'vlc' ? btnPlayVlc : player === 'iina' ? btnPlayIina : btnPlayDefault;
  
  button.disabled = true;
  button.innerHTML = `<span class="spinner" style="width:16px; height:16px; border-width:2px; display:inline-block; margin-right:8px;"></span> Loading...`;
  
  const res = await window.api.playFile(selectedFile.id, currentFolder.id, selectedFile.name, player);
  
  button.disabled = false;
  button.innerHTML = `<span class="play-icon">${player === 'default' ? '↗' : '▶'}</span> ${originalText}`;
  
  if (!res.success) {
    alert(res.error || 'Failed to open player');
  }
}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
  // Tab Switching
  navBrowse.addEventListener('click', () => {
    console.log('navBrowse clicked');
    switchTab('browse');
  });
  navSettings.addEventListener('click', () => {
    console.log('navSettings clicked');
    switchTab('settings');
  });
  btnGoSettings.addEventListener('click', () => {
    console.log('btnGoSettings clicked');
    switchTab('settings');
  });
  
  // Navigation
  btnBack.addEventListener('click', () => {
    if (folderHistory.length > 0) {
      const target = folderHistory.pop();
      loadFolder(target.id, target.name, false);
    }
  });
  
  btnHome.addEventListener('click', () => {
    folderHistory = [];
    loadFolder('root', 'Home', false);
  });
  
  btnRefresh.addEventListener('click', () => {
    loadFolder(currentFolder.id, currentFolder.name, false);
  });
  
  // Search
  btnSearch.addEventListener('click', performSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  // Close Drawer
  btnCloseDrawer.addEventListener('click', closeDrawer);
  
  // Play video actions
  btnPlayApp.addEventListener('click', async () => {
    if (!selectedFile) return;
    const url = await window.api.getStreamLink(selectedFile.id);
    playerVideoTitle.textContent = selectedFile.name;
    builtInVideo.src = url;
    playerOverlay.classList.add('active');
    builtInVideo.play().catch(err => console.error('Video autoplay failed:', err));
  });

  const closePlayer = () => {
    builtInVideo.pause();
    builtInVideo.src = '';
    builtInVideo.load();
    playerOverlay.classList.remove('active');
  };

  btnClosePlayer.addEventListener('click', closePlayer);

  btnPlayVlc.addEventListener('click', () => playVideo('vlc'));
  btnPlayIina.addEventListener('click', () => playVideo('iina'));
  btnPlayDefault.addEventListener('click', () => playVideo('default'));
  btnSettingsConnect.addEventListener('click', startGoogleLogin);
  btnOpenLog.addEventListener('click', async () => {
    const res = await window.api.openLogFile();
    if (!res.success) {
      alert(res.error || 'Failed to open log file');
    }
  });


  
  // Close player on ESC key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (playerOverlay.classList.contains('active')) {
        closePlayer();
      } else if (mediaDrawer.classList.contains('active')) {
        closeDrawer();
      }
    }
  });

  
  // Copy Stream URL
  btnCopyLink.addEventListener('click', async () => {
    if (!selectedFile) return;
    const url = await window.api.getStreamLink(selectedFile.id);
    navigator.clipboard.writeText(url);
    
    copyAlert.classList.add('show');
    setTimeout(() => copyAlert.classList.remove('show'), 2000);
  });
  
  // Settings Form Submit
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const clientId = inputClientId.value.trim();
    const clientSecret = inputClientSecret.value.trim();
    
    const saveBtn = settingsForm.querySelector('.btn-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    await window.api.saveCredentials({ clientId, clientSecret });
    await refreshConfigState();
    
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Credentials';
    
    alert('Credentials saved successfully!');
    
    // Now enable connection flow on login card
    showLoginButton();
    switchTab('browse');
  });
  
  // Logout action
  btnLogout.addEventListener('click', async () => {
    if (confirm('Are you sure you want to disconnect from Google Drive?')) {
      await window.api.logout();
      updateConnectionStatus(false, 'Disconnected');
      closeDrawer();
      const cards = fileGrid.querySelectorAll('.grid-item');
      cards.forEach(card => card.remove());
      emptyState.style.display = 'flex';
      
      await refreshConfigState();
      loginOverlay.classList.add('active');
      showLoginButton();
    }
  });

  // Handle local link external clicks (Google Cloud Console link)
  linkGcp.addEventListener('click', (e) => {
    e.preventDefault();
    window.api.openExternal(linkGcp.href);
  });
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return '';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Start everything
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

