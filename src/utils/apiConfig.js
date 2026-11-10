// src/utils/apiConfig.js

/**
 * Dynamic LAN Server Gateway Configuration
 * Resolves the Central Server base URL across the clinic LAN.
 */

export const getServerBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('orthocare_server_url');
    if (saved) return saved.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:5000';
};

export const setServerBaseUrl = (newUrl) => {
  if (!newUrl) return;
  const formatted = newUrl.trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    localStorage.setItem('orthocare_server_url', formatted);
    if (window.electronAPI && window.electronAPI.setServerUrl) {
      window.electronAPI.setServerUrl(formatted);
    }
  }
};

// Sync initial configuration from Electron preload bridge if available
if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getServerUrl) {
  window.electronAPI.getServerUrl().then((serverUrl) => {
    if (serverUrl && !localStorage.getItem('orthocare_server_url')) {
      localStorage.setItem('orthocare_server_url', serverUrl);
    }
  }).catch(() => {});
}
