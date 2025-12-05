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

// Helper unikalnej nazwy (taki sam jak w workerze)
const getUniquePath = async (filePath) => {
    let currentPath = filePath;
    let counter = 1;
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);

    while (true) {
        try {
            await fsPromises.access(currentPath);
            currentPath = path.join(dir, `${base}-v${counter}${ext}`);
            counter++;
        } catch (e) {
            return currentPath;
        }
    }
};

// --- SAVE FILE (DLA FALLBACK MODE) ---
ipcMain.handle('save-file', async (event, sourceFilePath, fileName, buffer, overwrite) => {
    try {
        const sourceDir = path.dirname(sourceFilePath);
        const outputDir = path.join(sourceDir, '_terg');
        
        await fsPromises.mkdir(outputDir, { recursive: true });
        
        let outputPath = path.join(outputDir, fileName);
        
        if (!overwrite) {
            outputPath = await getUniquePath(outputPath);
        }
        
        await fsPromises.writeFile(outputPath, Buffer.from(buffer));
        
        return { success: true, path: outputPath };
    } catch (error) {
        console.error('Save file error:', error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('process-images', async (event, filePaths, options) => {
    const { baseName, startNumber, optCrop, optTrimOnly, optAddMargin, optResize } = options;
    
    if (!filePaths || filePaths.length === 0) return { success: false, message: 'Brak plików.' };

    const sourceDir = path.dirname(filePaths[0]);
    const outputDir = path.join(sourceDir, '_terg'); 

    // --- UTILITY PROCESS (Worker) ---
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, 'worker.cjs');
        
        // Uruchamiamy workera jako Utility Process
        const worker = utilityProcess.fork(workerPath);

        worker.postMessage({
            type: 'process-images',
            payload: {
                filePaths,
                options,
                outputDir
            }
        });

        worker.on('message', (msg) => {
            if (msg.type === 'log') {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('log-message', msg.message);
                }
            } else if (msg.type === 'done') {
                worker.kill();
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
                resolve({ success: false, message: `Worker error exit code: ${code}` });
            }
        });
    });
});
