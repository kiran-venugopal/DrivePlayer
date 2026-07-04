const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { Readable } = require('stream');

// App Data Logging Configuration
let logFilePath;
function getLogFilePath() {
  if (!logFilePath) {
    logFilePath = path.join(app.getPath('userData'), 'app.log');
  }
  return logFilePath;
}

function writeToLogFile(type, ...args) {
  try {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch (e) { return String(arg); }
      }
      return String(arg);
    }).join(' ');
    const logLine = `[${timestamp}] [${type}] ${message}\n`;
    fs.appendFileSync(getLogFilePath(), logLine, 'utf-8');
  } catch (e) {
    process.stderr.write('Failed to write to app.log: ' + e.message + '\n');
  }
}

// Redirect console logs to file
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  originalLog.apply(console, args);
  writeToLogFile('INFO', ...args);
};

console.error = (...args) => {
  originalError.apply(console, args);
  writeToLogFile('ERROR', ...args);
};

console.warn = (...args) => {
  originalWarn.apply(console, args);
  writeToLogFile('WARN', ...args);
};

// App Port Configuration
const STREAM_PORT = 54320;
const AUTH_PORT = 54321;

let mainWindow;
let authServer = null;
let streamServer = null;

// Stored credentials
let credentials = {
  clientId: '',
  clientSecret: '',
  accessToken: '',
  refreshToken: ''
};

// Config File Path
const configPath = path.join(app.getPath('userData'), 'config.json');

// Load stored config
function loadConfig() {
  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      credentials = { ...credentials, ...data };
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }
}

// Save config
function saveConfig() {
  try {
    const dataToSave = {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: credentials.refreshToken
    };
    fs.writeFileSync(configPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// Helper to make HTTPS requests with redirect support
function requestWithRedirects(urlStr, options, callback, redirectCount = 0) {
  if (redirectCount > 5) {
    return callback(new Error('Too many redirects'));
  }
  
  const parsedUrl = new URL(urlStr);
  const client = parsedUrl.protocol === 'https:' ? https : http;
  
  const req = client.request(urlStr, options, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      let redirectUrl = res.headers.location;
      if (!redirectUrl.startsWith('http')) {
        redirectUrl = new URL(redirectUrl, parsedUrl.origin).href;
      }
      
      const newOptions = { ...options };
      const originalUrl = new URL(urlStr);
      const nextUrl = new URL(redirectUrl);
      
      // Strip Authorization if origin changes (Google Drive download redirects to signed URL on googleusercontent)
      if (originalUrl.origin !== nextUrl.origin) {
        if (newOptions.headers) {
          delete newOptions.headers['Authorization'];
        }
      }
      
      return requestWithRedirects(redirectUrl, newOptions, callback, redirectCount + 1);
    }
    callback(null, res);
  });
  
  req.on('error', (err) => {
    callback(err);
  });
  
  if (options.body) {
    req.write(options.body);
  }
  req.end();
}

// Helper for URL encoded POST requests (OAuth)
function postOAuthRequest(urlStr, dataObj) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams(dataObj).toString();
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(urlStr, options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error_description || parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

// Refresh Google Drive Access Token
async function refreshAccessToken() {
  if (!credentials.refreshToken || !credentials.clientId || !credentials.clientSecret) {
    throw new Error('Missing credentials for token refresh');
  }
  
  try {
    const data = await postOAuthRequest('https://oauth2.googleapis.com/token', {
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token'
    });
    
    credentials.accessToken = data.access_token;
    console.log('Access token refreshed successfully');
    return credentials.accessToken;
  } catch (err) {
    console.error('Failed to refresh access token:', err);
    throw err;
  }
}

// Fetch Google Drive Folders/Files API helper
function fetchGoogleDrive(endpoint, searchParams = {}) {
  return new Promise(async (resolve, reject) => {
    if (!credentials.accessToken) {
      try {
        await refreshAccessToken();
      } catch (e) {
        return reject(new Error('Unauthorized: please log in'));
      }
    }
    
    const url = new URL(`https://www.googleapis.com/drive/v3/${endpoint}`);
    Object.keys(searchParams).forEach(key => url.searchParams.append(key, searchParams[key]));
    
    const makeRequest = () => {
      const options = {
        method: 'GET',
        headers: {
          'Authorization': `BaseBearer ${credentials.accessToken}` // Custom check or standard
        }
      };
      // Correct standard bearer header:
      options.headers['Authorization'] = `Bearer ${credentials.accessToken}`;
      
      requestWithRedirects(url.href, options, (err, res) => {
        if (err) return reject(err);
        
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', async () => {
          try {
            if (res.statusCode === 401) {
              // Token expired, refresh and try once more
              console.log('Access token expired during API call, refreshing...');
              try {
                await refreshAccessToken();
                // Re-run
                return resolve(await fetchGoogleDrive(endpoint, searchParams));
              } catch (refreshErr) {
                return reject(new Error('Unauthorized: Session expired'));
              }
            }
            
            const parsed = JSON.parse(rawData);
            if (res.statusCode >= 400) {
              return reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}`));
            }
            resolve(parsed);
          } catch (e) {
            reject(e);
          }
        });
      });
    };
    
    makeRequest();
  });
}

// Start Stream Server
function startStreamServer() {
  if (streamServer) return;
  
  streamServer = http.createServer(async (req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    
    // 1. Direct Video Stream Endpoint
    if (reqUrl.pathname === '/stream') {
      const fileId = reqUrl.searchParams.get('fileId');
      if (!fileId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing fileId');
        return;
      }
      
      try {
        if (!credentials.accessToken) {
          await refreshAccessToken();
        }
      } catch (err) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized: Connect Google Drive first');
        return;
      }
      
      const streamUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const headers = {
        'Authorization': `Bearer ${credentials.accessToken}`
      };
      
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }
      
      const options = {
        method: 'GET',
        headers: headers
      };
      
      requestWithRedirects(streamUrl, options, (err, gdriveRes) => {
        if (err) {
          console.error('Error proxying stream:', err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Streaming proxy error: ' + err.message);
          return;
        }
        
        // Forward Google Drive response status and headers
        const outHeaders = {};
        for (const [key, val] of Object.entries(gdriveRes.headers)) {
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'transfer-encoding' || lowerKey === 'content-encoding') {
            continue; // Let Node handle transfer-encoding
          }
          outHeaders[key] = val;
        }
        
        // Always ensure media player gets ranges and correct content type
        outHeaders['accept-ranges'] = 'bytes';
        if (!outHeaders['content-type']) {
          outHeaders['content-type'] = 'video/mp4'; // fallback
        }
        
        res.writeHead(gdriveRes.statusCode, outHeaders);
        gdriveRes.pipe(res);
      });
    } 
    // 2. Dynamic M3U Playlist Endpoint
    else if (reqUrl.pathname === '/playlist') {
      const folderId = reqUrl.searchParams.get('folderId');
      const startFileId = reqUrl.searchParams.get('startFileId');
      
      if (!folderId || !startFileId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing folderId or startFileId');
        return;
      }
      
      try {
        // Query Google Drive for all video files in this folder
        const q = `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`;
        const result = await fetchGoogleDrive('files', {
          q: q,
          fields: 'files(id,name,size,mimeType)',
          orderBy: 'name'
        });
        
        const files = result.files || [];
        if (files.length === 0) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('No video files found in folder');
          return;
        }
        
        // Reorder playlist to make the clicked file first, followed by the rest
        const startIndex = files.findIndex(f => f.id === startFileId);
        let orderedFiles = [];
        if (startIndex !== -1) {
          orderedFiles = [
            ...files.slice(startIndex),
            ...files.slice(0, startIndex)
          ];
        } else {
          orderedFiles = files;
        }
        
        // Build M3U Content
        let m3u = '#EXTM3U\n';
        for (const file of orderedFiles) {
          const streamUrl = `http://localhost:${STREAM_PORT}/stream?fileId=${file.id}`;
          m3u += `#EXTINF:-1,${file.name}\n`;
          m3u += `${streamUrl}\n`;
        }
        
        res.writeHead(200, {
          'Content-Type': 'application/x-mpegurl',
          'Content-Disposition': 'inline; filename="playlist.m3u"'
        });
        res.end(m3u);
      } catch (err) {
        console.error('Error generating playlist:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Playlist generation error: ' + err.message);
      }
    } 
    else {
      res.writeHead(404);
      res.end();
    }
  });
  
  streamServer.listen(STREAM_PORT, () => {
    console.log(`Streaming proxy server running at http://localhost:${STREAM_PORT}`);
  });
  
  streamServer.on('error', (err) => {
    console.error('Streaming server startup failed:', err);
  });
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // beautiful native macOS window control look
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  loadConfig();
  startStreamServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// IPC HANDLERS
// ==========================================

// Load configurations
ipcMain.handle('load-config', () => {
  return {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    hasRefreshToken: !!credentials.refreshToken
  };
});

// Save client ID / Secret credentials
ipcMain.handle('save-credentials', (event, { clientId, clientSecret }) => {
  credentials.clientId = clientId;
  credentials.clientSecret = clientSecret;
  saveConfig();
  return { success: true };
});

// Logout
ipcMain.handle('logout', () => {
  credentials.refreshToken = '';
  credentials.accessToken = '';
  saveConfig();
  return { success: true };
});

// Start Google OAuth2 Server
ipcMain.handle('start-oauth', (event) => {
  return new Promise((resolve, reject) => {
    if (!credentials.clientId || !credentials.clientSecret) {
      return reject(new Error('Please set Client ID and Client Secret in Settings first.'));
    }

    if (authServer) {
      try { authServer.close(); } catch(e) {}
    }

    authServer = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, `http://${req.headers.host}`);
      if (reqUrl.pathname === '/auth/callback') {
        const code = reqUrl.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h3>Authentication failed: No authorization code received.</h3>');
          resolve({ success: false, error: 'No code received' });
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif; text-align:center; padding: 40px; background-color:#1e1e2e; color:#cdd6f4;">
              <h2 style="color:#a6e3a1;">✓ Connected Successfully!</h2>
              <p>You can close this window now and return to the application.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);

        // Close auth server
        authServer.close(() => {
          authServer = null;
        });

        // Exchange code for tokens
        try {
          const data = await postOAuthRequest('https://oauth2.googleapis.com/token', {
            code: code,
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            redirect_uri: `http://127.0.0.1:${AUTH_PORT}/auth/callback`,
            grant_type: 'authorization_code'
          });

          credentials.accessToken = data.access_token;
          credentials.refreshToken = data.refresh_token || credentials.refreshToken; // google sometimes does not return refresh token if consent was skipped
          saveConfig();
          
          resolve({ success: true });
        } catch (err) {
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    authServer.listen(AUTH_PORT, () => {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${credentials.clientId}&redirect_uri=http://127.0.0.1:${AUTH_PORT}/auth/callback&response_type=code&scope=https://www.googleapis.com/auth/drive.readonly&access_type=offline&prompt=consent`;
      shell.openExternal(authUrl);
      console.log('OAuth helper listening on port', AUTH_PORT);
    });

    authServer.on('error', (err) => {
      reject(new Error('Failed to start OAuth server: ' + err.message));
    });
  });
});

// Fetch folder files list
ipcMain.handle('fetch-drive-files', async (event, { folderId, search = '' }) => {
  try {
    const parentId = folderId || 'root';
    let q = `'${parentId}' in parents and trashed = false`;
    if (search) {
      q = `name contains '${search.replace(/'/g, "\\'")}' and trashed = false`;
    }
    
    // We restrict search results / listings to either directories or video files
    q += ` and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'video/')`;

    const data = await fetchGoogleDrive('files', {
      q: q,
      fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink)',
      orderBy: 'folder,name',
      pageSize: 150
    });

    return { success: true, files: data.files || [] };
  } catch (err) {
    console.error('IPC fetch-drive-files error:', err);
    return { success: false, error: err.message };
  }
});

// Play in VLC or IINA
ipcMain.handle('play-file', (event, { fileId, folderId, fileName, player }) => {
  return new Promise((resolve) => {
    // Generate stream URL or Playlist URL
    // M3U Playlist contains the files in-between in the folder!
    const playlistUrl = `http://localhost:${STREAM_PORT}/playlist?folderId=${folderId}&startFileId=${fileId}`;
    const directStreamUrl = `http://localhost:${STREAM_PORT}/stream?fileId=${fileId}`;

    let playerCmd = '';
    let args = [];

    // Let's decide on which URL to open:
    // M3U URL allows playing folders sequentially!
    // VLC and IINA support opening network playlists.
    const openUrl = player === 'default' ? directStreamUrl : playlistUrl;

    if (player === 'vlc') {
      playerCmd = 'VLC';
    } else if (player === 'iina') {
      playerCmd = 'IINA';
    }

    if (playerCmd) {
      // open -a PLAYER "URL"
      args = ['-a', playerCmd, openUrl];
      const p = spawn('open', args);
      p.on('error', (err) => {
        resolve({ success: false, error: `Failed to launch ${playerCmd}: ${err.message}` });
      });
      p.on('exit', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `Could not launch ${playerCmd}. Make sure it is installed.` });
        }
      });
    } else {
      // Default player: open URL directly or try default video player
      shell.openExternal(openUrl).then(() => {
        resolve({ success: true });
      }).catch(err => {
        resolve({ success: false, error: err.message });
      });
    }
  });
});

// Copy Stream link
ipcMain.handle('get-stream-link', (event, { fileId }) => {
  return `http://localhost:${STREAM_PORT}/stream?fileId=${fileId}`;
});

// Open external URL
ipcMain.handle('open-external', (event, url) => {
  return shell.openExternal(url);
});

// Log message from renderer
ipcMain.handle('log-message', (event, { type, message }) => {
  writeToLogFile(type, message);
});

// Open log file in default system editor
ipcMain.handle('open-log-file', () => {
  const filePath = getLogFilePath();
  if (fs.existsSync(filePath)) {
    shell.openPath(filePath);
    return { success: true };
  }
  return { success: false, error: 'Log file does not exist yet.' };
});


