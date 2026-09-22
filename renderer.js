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
const fileCountBadge = document.getElementById('file-count-badge');

const searchInput = document.getElementById('search-input');
const btnSearch = document.getElementById('btn-search');
const btnClearSearch = document.getElementById('btn-clear-search');

const mediaDrawer = document.getElementById('media-drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const drawerTitle = document.getElementById('drawer-title');
const drawerType = document.getElementById('drawer-type');
const drawerSize = document.getElementById('drawer-size');
const drawerDate = document.getElementById('drawer-date');
const drawerIconWrap = document.getElementById('drawer-icon-wrap');
const drawerThumbImg = document.getElementById('drawer-thumb-img');
const drawerVideoActions = document.getElementById('drawer-video-actions');
const drawerGeneralActions = document.getElementById('drawer-general-actions');
const btnOpenFolder = document.getElementById('btn-open-folder');
const btnOpenWeb = document.getElementById('btn-open-web');

const btnOpenRename = document.getElementById('btn-open-rename');
const renameOverlay = document.getElementById('rename-overlay');
const renameForm = document.getElementById('rename-form');
const inputRename = document.getElementById('input-rename');
const btnCloseRename = document.getElementById('btn-close-rename');
const btnCancelRename = document.getElementById('btn-cancel-rename');
const renameDialogTitle = document.getElementById('rename-dialog-title');

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

// Helper to refresh Lucide icons safely
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Helper to get file type information and corresponding Lucide icon
function getFileInfo(file) {
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
  if (isFolder) {
    return {
      category: 'folder',
      typeLabel: 'Folder',
      iconName: 'folder',
      isVideo: false
    };
  }

  const mime = file.mimeType || '';
  const name = file.name ? file.name.toLowerCase() : '';

  if (mime.startsWith('video/') || /\.(mp4|mkv|mov|avi|webm|flv|wmv|m4v|3gp|ts)$/.test(name)) {
    return {
      category: 'video',
      typeLabel: 'Video',
      iconName: 'film',
      isVideo: true
    };
  }

  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/.test(name)) {
    return {
      category: 'image',
      typeLabel: 'Image',
      iconName: 'image',
      isVideo: false
    };
  }

  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/.test(name)) {
    return {
      category: 'audio',
      typeLabel: 'Audio',
      iconName: 'music',
      isVideo: false
    };
  }

  if (
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('word') ||
    mime.includes('sheet') ||
    mime.includes('presentation') ||
    mime.includes('text') ||
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|json)$/.test(name)
  ) {
    return {
      category: 'document',
      typeLabel: 'Document',
      iconName: 'file-text',
      isVideo: false
    };
  }

  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar') || /\.(zip|rar|7z|tar|gz)$/.test(name)) {
    return {
      category: 'archive',
      typeLabel: 'Archive',
      iconName: 'archive',
      isVideo: false
    };
  }

  return {
    category: 'generic',
    typeLabel: 'File',
    iconName: 'file',
    isVideo: false
  };
}

// ==========================================
// INITIALIZATION
// ==========================================
async function init() {
  setupEventListeners();
  refreshIcons();
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
    btnSettingsConnect.style.display = 'inline-flex';
  } else {
    btnSettingsConnect.style.display = 'none';
  }
  refreshIcons();
}

function updateConnectionStatus(connected, text) {
  if (connected) {
    statusDot.className = 'status-indicator connected';
    statusText.textContent = text || 'Connected';
    btnLogout.style.display = 'flex';
  } else {
    statusDot.className = 'status-indicator';
    statusText.textContent = text || 'Disconnected';
    btnLogout.style.display = 'none';
  }
  refreshIcons();
}

function showLoginButton() {
  loginActionContainer.innerHTML = `
    <button id="btn-connect" class="btn-connect">
      <i data-lucide="log-in"></i> <span>Connect Google Drive</span>
    </button>
    <p class="login-tip">Authenticate with your Google account to browse, stream, and manage files.</p>
  `;
  document.getElementById('btn-connect').addEventListener('click', startGoogleLogin);
  refreshIcons();
}

function showCredentialsWarning() {
  loginActionContainer.innerHTML = `
    <div style="background-color:rgba(244,63,94,0.12); border: 1px solid var(--error); border-radius:10px; padding: 16px; margin-bottom: 20px; text-align: left;">
      <p style="color:var(--error); margin-bottom:0; font-size: 0.88rem; font-weight: 500;">Client ID & Client Secret are not configured.</p>
    </div>
    <p class="login-tip">Please go to API Settings and add your Google credentials to start.</p>
  `;
}

// ==========================================
// TABS & NAVIGATION
// ==========================================
function switchTab(tab) {
  if (tab === 'browse') {
    navBrowse.classList.add('active');
    navSettings.classList.remove('active');
    panelBrowse.classList.add('active');
    panelSettings.classList.remove('active');
    
    // Show login overlay if not connected
    if (statusText.textContent !== 'Connected') {
      loginOverlay.classList.add('active');
    }
  } else {
    navBrowse.classList.remove('active');
    navSettings.classList.add('active');
    panelBrowse.classList.remove('active');
    panelSettings.classList.add('active');
    
    // Hide login overlay on settings tab so the user can enter credentials
    loginOverlay.classList.remove('active');
  }
  refreshIcons();
}

function updateBreadcrumbs() {
  let html = `<span class="crumb" data-id="root">Home</span>`;
  
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
  if (fileCountBadge) fileCountBadge.textContent = 'Loading...';
  
  // Remove existing cards
  const cards = fileGrid.querySelectorAll('.grid-item');
  cards.forEach(card => card.remove());
  
  const res = await window.api.fetchDriveFiles(folderId);
  gridLoader.style.display = 'none';
  
  if (res.success) {
    filesList = res.files || [];
    if (fileCountBadge) {
      fileCountBadge.textContent = `${filesList.length} ${filesList.length === 1 ? 'item' : 'items'}`;
    }
    renderGrid(filesList);
  } else {
    if (fileCountBadge) fileCountBadge.textContent = 'Error';
    fileGrid.insertAdjacentHTML('beforeend', `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-icon-wrap" style="border-color: var(--error);">
          <i data-lucide="alert-triangle" class="empty-icon" style="stroke: var(--error);"></i>
        </div>
        <h3>Failed to load files</h3>
        <p>${res.error || 'Unknown error occurred'}</p>
      </div>
    `);
    refreshIcons();
    
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
    refreshIcons();
    return;
  }
  
  emptyState.style.display = 'none';
  
  files.forEach(file => {
    const info = getFileInfo(file);
    const sizeStr = info.category === 'folder' ? 'Folder' : formatBytes(file.size);
    const itemClass = `grid-item ${info.category}`;
    
    // Thumbnail or Icon Box
    let previewHtml = '';
    if (file.thumbnailLink) {
      // Use higher res thumbnail if possible by replacing s220 with s400
      const highResThumb = file.thumbnailLink.replace(/=s\d+/, '=s400');
      previewHtml = `
        <div class="grid-preview-box">
          <img src="${highResThumb}" class="grid-thumb-img" alt="${file.name}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
          <i data-lucide="${info.iconName}" class="grid-icon-svg" style="display: none;"></i>
        </div>
      `;
    } else {
      previewHtml = `
        <div class="grid-preview-box">
          <i data-lucide="${info.iconName}" class="grid-icon-svg"></i>
        </div>
      `;
    }
    
    const itemHtml = `
      <div class="${itemClass}" data-id="${file.id}">
        ${previewHtml}
        <div class="grid-name" title="${file.name}">${file.name}</div>
        <div class="grid-meta">${sizeStr}</div>
      </div>
    `;
    
    fileGrid.insertAdjacentHTML('beforeend', itemHtml);
  });
  
  refreshIcons();

  // Add card listeners
  fileGrid.querySelectorAll('.grid-item').forEach(card => {
    const id = card.getAttribute('data-id');
    const file = files.find(f => f.id === id);
    if (!file) return;

    card.addEventListener('click', () => {
      fileGrid.querySelectorAll('.grid-item').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      openDrawer(file);
    });
    
    card.addEventListener('dblclick', () => {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        loadFolder(file.id, file.name);
      } else {
        const info = getFileInfo(file);
        if (info.isVideo) {
          playVideo('app');
        } else if (file.webViewLink) {
          window.api.openExternal(file.webViewLink);
        }
      }
    });
  });
}

// ==========================================
// SEARCH & CLEAR
// ==========================================
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    btnClearSearch.style.display = 'none';
    loadFolder(currentFolder.id, currentFolder.name, false);
    return;
  }
  
  btnClearSearch.style.display = 'flex';
  closeDrawer();
  gridLoader.style.display = 'flex';
  emptyState.style.display = 'none';
  if (fileCountBadge) fileCountBadge.textContent = 'Searching...';
  
  const cards = fileGrid.querySelectorAll('.grid-item');
  cards.forEach(card => card.remove());
  
  breadcrumbs.innerHTML = `Search: <span class="crumb active">"${query}"</span>`;
  btnBack.disabled = false;
  
  const res = await window.api.fetchDriveFiles(null, query);
  gridLoader.style.display = 'none';
  
  if (res.success) {
    filesList = res.files || [];
    if (fileCountBadge) {
      fileCountBadge.textContent = `${filesList.length} ${filesList.length === 1 ? 'match' : 'matches'}`;
    }
    renderGrid(filesList);
  } else {
    if (fileCountBadge) fileCountBadge.textContent = 'Error';
    fileGrid.insertAdjacentHTML('beforeend', `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-icon-wrap" style="border-color: var(--error);">
          <i data-lucide="alert-triangle" class="empty-icon" style="stroke: var(--error);"></i>
        </div>
        <h3>Search failed</h3>
        <p>${res.error}</p>
      </div>
    `);
    refreshIcons();
  }
}

function clearSearch() {
  searchInput.value = '';
  btnClearSearch.style.display = 'none';
  loadFolder(currentFolder.id, currentFolder.name, false);
}

// ==========================================
// DRAWER
// ==========================================
function openDrawer(file) {
  selectedFile = file;
  const info = getFileInfo(file);

  drawerTitle.textContent = file.name;
  drawerTitle.title = file.name;
  drawerType.textContent = info.typeLabel;
  drawerSize.textContent = info.category === 'folder' ? '—' : formatBytes(file.size);
  drawerDate.textContent = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '—';
  
  // Thumbnail or preview in Drawer
  if (file.thumbnailLink) {
    const highResThumb = file.thumbnailLink.replace(/=s\d+/, '=s600');
    drawerThumbImg.src = highResThumb;
    drawerThumbImg.style.display = 'block';
    drawerIconWrap.style.display = 'none';
    drawerThumbImg.onerror = () => {
      drawerThumbImg.style.display = 'none';
      drawerIconWrap.style.display = 'flex';
      drawerIconWrap.innerHTML = `<i data-lucide="${info.iconName}"></i>`;
      refreshIcons();
    };
  } else {
    drawerThumbImg.style.display = 'none';
    drawerIconWrap.style.display = 'flex';
    drawerIconWrap.innerHTML = `<i data-lucide="${info.iconName}"></i>`;
  }

  // Toggle video specific buttons vs general actions
  if (info.isVideo) {
    drawerVideoActions.style.display = 'flex';
    drawerGeneralActions.style.display = 'none';
  } else {
    drawerVideoActions.style.display = 'none';
    drawerGeneralActions.style.display = 'flex';

    if (info.category === 'folder') {
      btnOpenFolder.style.display = 'flex';
    } else {
      btnOpenFolder.style.display = 'none';
    }
  }

  mediaDrawer.classList.add('active');
  drawerBackdrop.classList.add('active');
  refreshIcons();
}

function closeDrawer() {
  selectedFile = null;
  mediaDrawer.classList.remove('active');
  drawerBackdrop.classList.remove('active');
  fileGrid.querySelectorAll('.grid-item').forEach(c => c.classList.remove('selected'));
}

// ==========================================
// RENAME MODAL
// ==========================================
function openRenameModal() {
  if (!selectedFile) return;
  renameDialogTitle.textContent = `Rename ${selectedFile.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : 'File'}`;
  inputRename.value = selectedFile.name;
  renameOverlay.classList.add('active');
  inputRename.focus();
  inputRename.select();
  refreshIcons();
}

function closeRenameModal() {
  renameOverlay.classList.remove('active');
}

async function handleRenameSubmit(e) {
  e.preventDefault();
  if (!selectedFile) return;

  const newName = inputRename.value.trim();
  if (!newName || newName === selectedFile.name) {
    closeRenameModal();
    return;
  }

  const submitBtn = document.getElementById('btn-submit-rename');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border-width:2px; display:inline-block; margin-right:6px;"></span> Saving...`;

  const res = await window.api.renameFile(selectedFile.id, newName);

  submitBtn.disabled = false;
  submitBtn.innerHTML = `<i data-lucide="check"></i> <span>Save Name</span>`;
  refreshIcons();

  if (res.success) {
    selectedFile.name = newName;
    drawerTitle.textContent = newName;
    drawerTitle.title = newName;

    // Update in filesList and card
    const card = fileGrid.querySelector(`.grid-item[data-id="${selectedFile.id}"]`);
    if (card) {
      const nameEl = card.querySelector('.grid-name');
      if (nameEl) {
        nameEl.textContent = newName;
        nameEl.title = newName;
      }
    }
    closeRenameModal();
  } else {
    alert(res.error || 'Failed to rename file in Google Drive');
  }
}

// ==========================================
// PLAYBACK / STREAMING ACTIONS
// ==========================================
async function startGoogleLogin() {
  try {
    loginActionContainer.innerHTML = `
      <div class="spinner" style="margin: 0 auto 14px auto;"></div>
      <p style="color:var(--text-sub);">Opening browser authorization window...</p>
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
      <div style="background-color:rgba(244,63,94,0.12); border: 1px solid var(--error); border-radius:10px; padding:14px; margin-bottom:16px;">
        <p style="color:var(--error); margin-bottom:0; font-size:0.85rem;">Login failed: ${err.message}</p>
      </div>
      <button id="btn-connect" class="btn-connect">
        <i data-lucide="refresh-cw"></i> <span>Try Connecting Again</span>
      </button>
    `;
    document.getElementById('btn-connect').addEventListener('click', startGoogleLogin);
    refreshIcons();
  }
}

async function playVideo(player) {
  if (!selectedFile) return;

  if (player === 'app') {
    const url = await window.api.getStreamLink(selectedFile.id);
    playerVideoTitle.textContent = selectedFile.name;
    builtInVideo.src = url;
    playerOverlay.classList.add('active');
    builtInVideo.play().catch(err => console.error('Video autoplay failed:', err));
    refreshIcons();
    return;
  }
  
  const originalText = player === 'vlc' ? 'Play in VLC' : player === 'iina' ? 'Play in IINA' : 'Default Player';
  const button = player === 'vlc' ? btnPlayVlc : player === 'iina' ? btnPlayIina : btnPlayDefault;
  
  button.disabled = true;
  button.innerHTML = `<span class="spinner" style="width:14px; height:14px; border-width:2px; display:inline-block; margin-right:8px;"></span> Loading...`;
  
  const res = await window.api.playFile(selectedFile.id, currentFolder.id, selectedFile.name, player);
  
  button.disabled = false;
  button.innerHTML = `<i data-lucide="${player === 'default' ? 'external-link' : 'play-circle'}" class="play-icon"></i> <span>${originalText}</span>`;
  refreshIcons();
  
  if (!res.success) {
    alert(res.error || 'Failed to open player');
  }
}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
  // Tab Switching
  navBrowse.addEventListener('click', () => switchTab('browse'));
  navSettings.addEventListener('click', () => switchTab('settings'));
  btnGoSettings.addEventListener('click', () => switchTab('settings'));
  
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
  searchInput.addEventListener('input', () => {
    if (searchInput.value.trim().length > 0) {
      btnClearSearch.style.display = 'flex';
    } else {
      btnClearSearch.style.display = 'none';
    }
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  btnClearSearch.addEventListener('click', clearSearch);
  
  // Close Drawer
  btnCloseDrawer.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);
  
  // Rename Modal
  btnOpenRename.addEventListener('click', openRenameModal);
  btnCloseRename.addEventListener('click', closeRenameModal);
  btnCancelRename.addEventListener('click', closeRenameModal);
  renameForm.addEventListener('submit', handleRenameSubmit);

  // Non-video drawer action buttons
  btnOpenFolder.addEventListener('click', () => {
    if (selectedFile && selectedFile.mimeType === 'application/vnd.google-apps.folder') {
      loadFolder(selectedFile.id, selectedFile.name);
    }
  });

  btnOpenWeb.addEventListener('click', () => {
    if (selectedFile) {
      const targetUrl = selectedFile.webViewLink || `https://drive.google.com/file/d/${selectedFile.id}/view`;
      window.api.openExternal(targetUrl);
    }
  });

  // Play video actions
  btnPlayApp.addEventListener('click', () => playVideo('app'));

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

  // Close overlays on ESC key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (renameOverlay.classList.contains('active')) {
        closeRenameModal();
      } else if (playerOverlay.classList.contains('active')) {
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
    saveBtn.innerHTML = `<i data-lucide="save"></i> <span>Save Credentials</span>`;
    refreshIcons();
    
    alert('Credentials saved successfully!');
    
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

  // External GCP link
  linkGcp.addEventListener('click', (e) => {
    e.preventDefault();
    window.api.openExternal(linkGcp.href);
  });
}

// Helper formatting functions
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return '—';
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
