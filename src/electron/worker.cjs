const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const sharp = require('sharp');

// Wyłączamy cache dla bezpieczeństwa
sharp.cache(false);

process.on('message', async (msg) => {
    if (msg.type === 'process-images') {
        const { filePaths, options, outputDir } = msg.payload;
        const { baseName, startNumber, optCrop, optTrimOnly, optAddMargin, optResize } = options;

        try {
            // Tworzenie katalogu
            await fsPromises.mkdir(outputDir, { recursive: true });

            for (let index = 0; index < filePaths.length; index++) {
                const inputPath = filePaths[index];
                const currentNum = parseInt(startNumber) + index;
                const fileName = `${baseName}-${currentNum}.jpg`;
                const outputPath = path.join(outputDir, fileName);

                try {
                    let image = sharp(inputPath);
                    const metadata = await image.metadata();
                    let { width, height } = metadata;

                    // 1. Detekcja tła
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

                    // 2. Trim (Double Trim Logic)
                    let currentWidth = width;
                    let currentHeight = height;
                    let wasTrimmed = false;

                    if (optCrop || optTrimOnly) {
                        const firstTrimBuffer = await image.clone().trim().toBuffer();
                        let tempImage = sharp(firstTrimBuffer);
                        
                        const secondTrimData = await tempImage.trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
                        
                        image = sharp(secondTrimData.data);
                        currentWidth = secondTrimData.info.width;
                        currentHeight = secondTrimData.info.height;
                        
                        wasTrimmed = currentWidth < width || currentHeight < height;
                    }

                    // 3. Decyzja o marginesie
                    const autoMargin = (optCrop && !optTrimOnly && (hasBackgroundContext || wasTrimmed));
                    const forceMargin = optAddMargin;
                    const willAddMargin = autoMargin || forceMargin;
                    const marginTotal = willAddMargin ? 10 : 0;

                    // 4. Skalowanie do limitu 3000x3600
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

                    // 6. Padding do 500px
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

                    // Zapis
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
                                    // Finalny fallback, zapisujemy bezpośrednio do pliku
                                    await image.flatten({ background: '#ffffff' }).jpeg({ ...baseOptions, quality: 85 }).toFile(outputPath);
                                    // buffer jest już zapisany, więc czyścimy zmienną żeby nie zapisać drugi raz
                                    buffer = null; 
                                }
                            }
                        }
                    }

                    if (buffer) {
                        await fsPromises.writeFile(outputPath, buffer);
                    }

                    // Wysyłamy log do głównego procesu
                    process.send({ type: 'log', message: `Zapisano: ${path.basename(outputDir)}/${fileName}` });

                } catch (err) {
                    process.send({ type: 'log', message: `BŁĄD: ${path.basename(inputPath)} - ${err.message}` });
                }
            }

            process.send({ type: 'done', success: true, path: outputDir });

        } catch (error) {
            process.send({ type: 'done', success: false, message: error.message });
        }
    }
});
