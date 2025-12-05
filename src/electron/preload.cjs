const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Wysyłamy ścieżki plików i opcje do procesu głównego
    processImages: (files, options) => ipcRenderer.invoke('process-images', files, options),
    
    // Odbieranie logów z procesu głównego (opcjonalne, dla debugowania)
    onLog: (callback) => ipcRenderer.on('log-message', (_event, value) => callback(value))
});
