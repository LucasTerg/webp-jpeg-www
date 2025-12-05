const { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess } = require('electron'); // <--- Dodano utilityProcess
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
// const { fork } = require('child_process'); // <--- USUNIĘTO

// Wyłączamy cache i SIMD w sharp, aby uniknąć crashy libvips w Electronie
// const sharp = require('sharp'); // <--- USUNIĘTE Z PROCESU GŁÓWNEGO!

// Obsługa przeładowania w trybie dev

ipcMain.handle('process-images', async (event, filePaths, options) => {
    // ...
    
    const outputDir = path.join(sourceDir, subDirName);

    // --- UTILITY PROCESS ---
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, 'worker.cjs');
        
        // Uruchamiamy workera jako Utility Process
        const worker = utilityProcess.fork(workerPath);

        // Wysyłamy dane do workera
        worker.postMessage({
            type: 'process-images',
            payload: {
                filePaths,
                options,
                outputDir
            }
        });

        // Nasłuchujemy wiadomości od workera
        worker.on('message', (msg) => {
            if (msg.type === 'log') {
                mainWindow.webContents.send('log-message', msg.message);
            } else if (msg.type === 'done') {
                worker.kill();
                if (msg.success) {
                    resolve({ success: true, path: msg.path });
                }
            } else {
                    resolve({ success: false, message: msg.message });
                }
            }
        });
        // ... reszta handlerów error/exit

