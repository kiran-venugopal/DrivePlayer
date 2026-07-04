const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  logout: () => ipcRenderer.invoke('logout'),
  startOauth: () => ipcRenderer.invoke('start-oauth'),
  fetchDriveFiles: (folderId, search) => ipcRenderer.invoke('fetch-drive-files', { folderId, search }),
  playFile: (fileId, folderId, fileName, player) => ipcRenderer.invoke('play-file', { fileId, folderId, fileName, player }),
  getStreamLink: (fileId) => ipcRenderer.invoke('get-stream-link', { fileId }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  logMessage: (type, message) => ipcRenderer.invoke('log-message', { type, message }),
  openLogFile: () => ipcRenderer.invoke('open-log-file')
});


