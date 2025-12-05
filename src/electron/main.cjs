const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const sharp = require('sharp');

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

// --- HELPER ZAPISU ---
const saveOptimizedImage = async (sharpInstance, outputPath) => {
    const LIMIT_SMALL = 1.5 * 1024 * 1024;
    const LIMIT_HARD = 3.0 * 1024 * 1024;
    const baseOptions = { mozjpeg: true, progressive: true, optimiseScans: true };
  
    let buffer = await sharpInstance.clone().flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
    if (buffer.length <= LIMIT_SMALL) { await fsPromises.writeFile(outputPath, buffer); return; }
  
    buffer = await sharpInstance.clone().flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 96 }).toBuffer();
    if (buffer.length <= LIMIT_HARD) { await fsPromises.writeFile(outputPath, buffer); return; }
  
    buffer = await sharpInstance.clone().flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 92 }).toBuffer();
    if (buffer.length <= LIMIT_HARD) { await fsPromises.writeFile(outputPath, buffer); return; }
  
    buffer = await sharpInstance.clone().flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 89 }).toBuffer();
    if (buffer.length <= LIMIT_HARD) { await fsPromises.writeFile(outputPath, buffer); return; }
  
    await sharpInstance.flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 85 }).toFile(outputPath);
};

ipcMain.handle('process-images', async (event, filePaths, options) => {
    const { baseName, startNumber, optCrop, optTrimOnly, optAddMargin, optResize } = options;
    
    if (!filePaths || filePaths.length === 0) return { success: false, message: 'Brak plików.' };

    // Ustalanie folderu źródłowego (bierzemy z pierwszego pliku)
    const sourceDir = path.dirname(filePaths[0]);

    // Ustalanie nazwy podfolderu na podstawie opcji
    let subDirName = '_processed';
    if (optTrimOnly) subDirName = '_prio'; // Samo Kadrowanie Prio
    else if (optCrop) subDirName = '_kadrowanie5px'; // Kadrowanie + Margines
    else if (optAddMargin) subDirName = '_ramka5px'; // Ramka 5px
    else if (optResize) subDirName = '_500'; // Dopełnij do 500px
    
    const outputDir = path.join(sourceDir, subDirName);

    // Tworzenie katalogu
    try {
        await fsPromises.mkdir(outputDir, { recursive: true });
    } catch (e) {
        return { success: false, message: `Nie można utworzyć katalogu: ${outputDir}` };
    }

    try {
        const processingPromises = filePaths.map(async (inputPath, index) => {
            const currentNum = parseInt(startNumber) + index;
            const fileName = `${baseName}-${currentNum}.jpg`;
            const outputPath = path.join(outputDir, fileName);

            try {
                let image = sharp(inputPath);
                const metadata = await image.metadata();
                let { width, height } = metadata;
                
                // 1. Detekcja
                let hasBackgroundContext = false;
                if (optCrop || optTrimOnly) {
                    const corners = [{ left: 0, top: 0 }, { left: width - 1, top: 0 }, { left: 0, top: height - 1 }, { left: width - 1, top: height - 1 }];
                    for (const corner of corners) {
                        const pixelBuffer = await image.clone().extract({ left: corner.left, top: corner.top, width: 1, height: 1 }).toBuffer();
                        const a = pixelBuffer.length >= 4 ? pixelBuffer[3] : 255;
                        if ((pixelBuffer[0] > 230 && pixelBuffer[1] > 230 && pixelBuffer[2] > 230) || a < 255) {
                            hasBackgroundContext = true;
                            break;
                        }
                    }
                }

                // 2. Trim
                let currentWidth = width;
                let currentHeight = height;
                let wasTrimmed = false;

                if (optCrop || optTrimOnly) {
                    const trimmedData = await image.clone().trim().toBuffer({ resolveWithObject: true });
                    image = sharp(trimmedData.data);
                    currentWidth = trimmedData.info.width;
                    currentHeight = trimmedData.info.height;
                    wasTrimmed = currentWidth < width || currentHeight < height;
                }

                // 3. Decyzja o marginesie
                const autoMargin = (optCrop && !optTrimOnly && (hasBackgroundContext || wasTrimmed));
                const forceMargin = optAddMargin;
                const willAddMargin = autoMargin || forceMargin;
                const marginTotal = willAddMargin ? 10 : 0;

                // 4. Skalowanie do limitu
                const MAX_W = 3000;
                const MAX_H = 3600;
                const maxContentW = MAX_W - marginTotal;
                const maxContentH = MAX_H - marginTotal;

                if (currentWidth > maxContentW || currentHeight > maxContentH) {
                    image = image.resize({ width: maxContentW, height: maxContentH, fit: 'inside', withoutEnlargement: true });
                    const resizedBuffer = await image.toBuffer({ resolveWithObject: true });
                    image = sharp(resizedBuffer.data);
                    currentWidth = resizedBuffer.info.width;
                    currentHeight = resizedBuffer.info.height;
                }

                // 5. Margines
                if (willAddMargin) {
                    image = image.extend({ top: 5, bottom: 5, left: 5, right: 5, background: '#ffffff' });
                    currentWidth += 10;
                    currentHeight += 10;
                }

                // 6. Padding
                if (optResize) {
                    const targetWidth = Math.max(currentWidth, 500);
                    const targetHeight = Math.max(currentHeight, 500);
                    if (currentWidth < targetWidth || currentHeight < targetHeight) {
                        const xPad = targetWidth - currentWidth;
                        const yPad = targetHeight - currentHeight;
                        const left = Math.floor(xPad / 2);
                        const top = Math.floor(yPad / 2);
                        image = image.extend({ top: top, bottom: yPad - top, left: left, right: xPad - left, background: '#ffffff' });
                    }
                }

                await saveOptimizedImage(image, outputPath);
                mainWindow.webContents.send('log-message', `Zapisano: ${subDirName}/${fileName}`);

            } catch (err) {
                console.error(`Błąd pliku ${inputPath}:`, err);
                mainWindow.webContents.send('log-message', `BŁĄD: ${path.basename(inputPath)}`);
            }
        });

        await Promise.all(processingPromises);
        
        // Otwórz folder po zakończeniu
        shell.openPath(outputDir);

        return { success: true, path: outputDir };

    } catch (error) {
        console.error('Global error:', error);
        return { success: false, message: error.message };
    }
});