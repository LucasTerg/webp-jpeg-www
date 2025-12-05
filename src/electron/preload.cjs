const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Wysyłamy ścieżki plików i opcje do procesu głównego
    processImages: (files, options) => ipcRenderer.invoke('process-images', files, options),
    
    // Odbieranie logów z procesu głównego
    onLog: (callback) => ipcRenderer.on('log-message', (_event, value) => callback(value)),

    // Helper do pobierania prawdziwej ścieżki pliku (dla Flatpak/Sandbox)
    getPathForFile: (file) => webUtils.getPathForFile(file)
});