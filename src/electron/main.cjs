const { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

// Obsługa przeładowania w trybie dev
try {
  if (require('electron-is-dev')) {
    require('electron-reloader')(module);
  }
} catch (_) {}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    icon: path.join(__dirname, '../../public/favicon.svg')
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/tools.html');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/tools.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('process-images', async (event, filePaths, options) => {
    const { baseName, startNumber, optCrop, optTrimOnly, optAddMargin, optResize } = options;
    
    if (!filePaths || filePaths.length === 0) return { success: false, message: 'Brak plików.' };

    const sourceDir = path.dirname(filePaths[0]);
    const outputDir = path.join(sourceDir, '_terg'); // Stały podfolder _terg

    // --- UTILITY PROCESS (Worker) ---
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, 'worker.cjs');
        
        const worker = utilityProcess.fork(workerPath);

        worker.postMessage({
            type: 'process-images',
            payload: {
                filePaths,
                options,
                outputDir // Przekazujemy ten stały outputDir
            }
        });

        // Nasłuchujemy wiadomości od workera
        worker.on('message', (msg) => {
            if (msg.type === 'log') {
                // Przekazujemy logi do okna renderera
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('log-message', msg.message);
                }
            } else if (msg.type === 'done') {
                // Koniec pracy
                worker.kill(); // Zabijamy proces
                if (msg.success) {
                    resolve({ success: true, path: msg.path });
                } else {
                    resolve({ success: false, message: msg.message });
                }
            }
        });

        worker.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                console.error(`Worker exited with code ${code}`);
                resolve({ success: false, message: `Proces przetwarzania zakończył się błędem (kod ${code}).` });
            }
        });
    });
});