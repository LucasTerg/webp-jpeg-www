const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const sharp = require('sharp');

// Wyłączamy cache dla bezpieczeństwa
sharp.cache(false);

// Helper: Generowanie unikalnej nazwy pliku (jeśli nie nadpisujemy)
const getUniquePath = async (filePath) => {
    let currentPath = filePath;
    let counter = 1;
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);

    while (true) {
        try {
            await fsPromises.access(currentPath);
            // Plik istnieje, generujemy nową nazwę
            currentPath = path.join(dir, `${base}-copy${counter}${ext}`);
            counter++;
        } catch (e) {
            // Plik nie istnieje, można użyć
            return currentPath;
        }
    }
};

// Obsługa Utility Process (Electron)
process.parentPort.on('message', async (event) => {
    const msg = event.data; // W utilityProcess dane są w .data
    
    if (msg.type === 'process-images') {
        const { filePaths, options, outputDir } = msg.payload;
        const { baseName, startNumber, optCrop, optTrimOnly, optAddMargin, optResize, optOverwrite } = options;

        try {
            // Tworzenie katalogu
            await fsPromises.mkdir(outputDir, { recursive: true });

            for (let index = 0; index < filePaths.length; index++) {
                const inputPath = filePaths[index];
                const currentNum = parseInt(startNumber) + index;
                let fileName = `${baseName}-${currentNum}.jpg`;
                let outputPath = path.join(outputDir, fileName);

                // Logika nadpisywania
                if (!optOverwrite) {
                    outputPath = await getUniquePath(outputPath);
                    fileName = path.basename(outputPath); // Aktualizuj fileName dla logów
                }

                try {
                    let image = sharp(inputPath);
                    const metadata = await image.metadata();
                    let { width, height } = metadata;

                    // --- LOGIKA PRZETWARZANIA ---
                    
                    // 1. KADROWANIE (Tylko jeśli wybrano tryb Smart lub Simple)
                    if (optCrop || optTrimOnly) {
                        // 1a. Detekcja tła (tylko dla Smart)
                        let hasBackgroundContext = false;
                        // Dla Smart (optCrop=true) sprawdzamy rogi
                        if (optCrop && !optTrimOnly) {
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

                        // 1b. Double Trim (zawsze dla Smart i Simple)
                        let currentWidth = width;
                        let currentHeight = height;
                        let wasTrimmed = false;

                        const firstTrimBuffer = await image.clone().trim().toBuffer();
                        let tempImage = sharp(firstTrimBuffer);
                        
                        const secondTrimData = await tempImage.trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
                        
                        image = sharp(secondTrimData.data);
                        currentWidth = secondTrimData.info.width;
                        currentHeight = secondTrimData.info.height;
                        
                        wasTrimmed = currentWidth < width || currentHeight < height;

                        // 1c. Decyzja o marginesie (Tylko dla Smart)
                        const autoMargin = (optCrop && !optTrimOnly && (hasBackgroundContext || wasTrimmed));
                        // const forceMargin = optAddMargin; // To teraz jest osobny krok post-process
                        const willAddMargin = autoMargin; 
                        
                        if (willAddMargin) {
                            image = image.extend({ top: 5, bottom: 5, left: 5, right: 5, background: '#ffffff' });
                            currentWidth += 10;
                            currentHeight += 10;
                        }
                        
                        // Aktualizacja wymiarów po marginesie
                        const bufferAfterMargin = await image.toBuffer({ resolveWithObject: true });
                        image = sharp(bufferAfterMargin.data);
                        currentWidth = bufferAfterMargin.info.width;
                        currentHeight = bufferAfterMargin.info.height;
                        
                        // 1d. Skalowanie do limitu 3000x3600 (Zawsze przy kadrowaniu)
                        const MAX_W = 3000;
                        const MAX_H = 3600;
                        // Margines 5px dodamy później w post-process (jeśli zaznaczony), więc tu limitujemy "czysty" obraz
                        // Ale jeśli "Smart" dodał już margines, to on jest częścią obrazu.
                        // Załóżmy, że limit dotyczy obrazu w tym momencie.
                        
                        if (currentWidth > MAX_W || currentHeight > MAX_H) {
                            image = image.resize({ width: MAX_W, height: MAX_H, fit: 'inside', withoutEnlargement: true });
                            // Update
                            const resized = await image.toBuffer({ resolveWithObject: true });
                            image = sharp(resized.data);
                            currentWidth = resized.info.width;
                            currentHeight = resized.info.height;
                        }
                        
                        // Przekazujemy dalej zaktualizowane width/height
                        width = currentWidth;
                        height = currentHeight;
                    } 
                    // Jeśli BRAK KADROWANIA (else), width i height zostają oryginalne.

                    // --- POST-PROCESS ---

                    // 2. Dodaj Ramkę 5px (Wymuszone)
                    if (optAddMargin) {
                        image = image.extend({ top: 5, bottom: 5, left: 5, right: 5, background: '#ffffff' });
                        // Update wymiarów po dodaniu ramki (dla paddingu)
                        const meta = await image.metadata(); 
                        width = meta.width;
                        height = meta.height;
                    }

                    // 3. Dopełnij do 500px
                    if (optResize) {
                        const targetWidth = Math.max(width, 500);
                        const targetHeight = Math.max(height, 500);
                        if (width < targetWidth || height < targetHeight) {
                            const xPad = targetWidth - width;
                            const yPad = targetHeight - height;
                            const left = Math.floor(xPad / 2);
                            const top = Math.floor(yPad / 2);
                            image = image.extend({ top: top, bottom: yPad - top, left: left, right: xPad - left, background: '#ffffff' });
                        }
                    }

                    // Zapis (Kompresja)
                    const LIMIT_SMALL = 1.5 * 1024 * 1024;
                    const LIMIT_HARD = 3.0 * 1024 * 1024;
                    const baseOptions = { mozjpeg: true, progressive: true, optimiseScans: true };
                
                    let buffer = await image.clone().flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
                    
                    if (buffer.length > LIMIT_SMALL) {
                        buffer = await image.clone().flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 96 }).toBuffer();
                        if (buffer.length > LIMIT_HARD) {
                            buffer = await image.clone().flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 92 }).toBuffer();
                            if (buffer.length > LIMIT_HARD) {
                                buffer = await image.clone().flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 89 }).toBuffer();
                                if (buffer.length > LIMIT_HARD) {
                                    await image.flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 85 }).toFile(outputPath);
                                    buffer = null; 
                                }
                            }
                        }
                    }

                    if (buffer) {
                        await fsPromises.writeFile(outputPath, buffer);
                    }

                    process.parentPort.postMessage({ type: 'log', message: `Zapisano: ${path.basename(outputDir)}/${fileName}` });

                } catch (err) {
                    process.parentPort.postMessage({ type: 'log', message: `BŁĄD: ${path.basename(inputPath)} - ${err.message}` });
                }
            }

            process.parentPort.postMessage({ type: 'done', success: true, path: outputDir });

        } catch (error) {
            process.parentPort.postMessage({ type: 'done', success: false, message: error.message });
        }
    }
});