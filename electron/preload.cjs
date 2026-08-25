const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('nexusDesktop', {
  platform: process.platform,
  desktop: true,
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  showBackgroundChatNotification: (payload) => ipcRenderer.invoke('show-background-chat-notification', payload),
  testBackgroundChatNotification: () => ipcRenderer.invoke('test-background-chat-notification'),
  onOpenChatChannel: (callback) => {
    const listener = (_event, channel) => callback(String(channel || 'general'));
    ipcRenderer.on('open-chat-channel', listener);
    return () => ipcRenderer.removeListener('open-chat-channel', listener);
  },
  onWindowMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on('window-maximized-changed', listener);
    return () => ipcRenderer.removeListener('window-maximized-changed', listener);
  },
  setUiScale: (scale) => {
    const safeScale = Math.max(0.9, Math.min(1.3, Number(scale) || 1));
    webFrame.setZoomFactor(safeScale);
    return safeScale;
  },
  verifyRsiProfile: (handle, code) => ipcRenderer.invoke('verify-rsi-profile', handle, code),
  getCaptureSettings: () => ipcRenderer.invoke('get-capture-settings'),
  configureCaptureShortcut: (accelerator) => ipcRenderer.invoke('configure-capture-shortcut', accelerator),
  captureEvidenceNow: () => ipcRenderer.invoke('capture-evidence-now'),
  setActiveMatchContext: (matchId) => ipcRenderer.invoke('set-active-match-context', matchId),
  listLocalCaptures: (matchId) => ipcRenderer.invoke('list-local-captures', matchId),
  openCapturesFolder: () => ipcRenderer.invoke('open-captures-folder'),
  revealLocalCapture: (filePath) => ipcRenderer.invoke('reveal-local-capture', filePath),
  onCaptureComplete: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('capture-complete', listener);
    return () => ipcRenderer.removeListener('capture-complete', listener);
  },
  onCaptureFailed: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('capture-failed', listener);
    return () => ipcRenderer.removeListener('capture-failed', listener);
  },
});
