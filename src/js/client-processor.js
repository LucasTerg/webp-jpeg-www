import JSZip from 'jszip';

console.log("Client processor module loaded");

// Funkcja pomocnicza do ładowania obrazu
const loadImage = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

// Algorytm TRIM (Scanlines)
const getTrimmedBounds = (ctx, width, height) => {
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let top = 0, bottom = height, left = 0, right = width;

  // Funkcja sprawdzająca czy piksel jest "tłem" (biały lub przezroczysty)
  // Tolerancja dla bieli: RGB > 230
  const isBackground = (r, g, b, a) => {
    const isWhite = r > 230 && g > 230 && b > 230;
    const isTransparent = a < 255;
    return isWhite || isTransparent;
  };

  // Skanowanie z góry
  for (top = 0; top < height; top++) {
    let rowHasContent = false;
    for (let x = 0; x < width; x++) {
      const i = (top * width + x) * 4;
      if (!isBackground(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3])) {
        rowHasContent = true;
        break;
      }
    }
    if (rowHasContent) break;
  }

  // Jeśli obraz jest pusty (samo tło)
  if (top === height) return null;

  // Skanowanie z dołu
  for (bottom = height - 1; bottom >= top; bottom--) {
    let rowHasContent = false;
    for (let x = 0; x < width; x++) {
      const i = (bottom * width + x) * 4;
      if (!isBackground(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3])) {
        rowHasContent = true;
        break;
      }
    }
    if (rowHasContent) break;
  }
  // Skanowanie z lewej
  for (left = 0; left < width; left++) {
    let colHasContent = false;
    for (let y = top; y <= bottom; y++) {
      const i = (y * width + left) * 4;
      if (!isBackground(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3])) {
        colHasContent = true;
        break;
      }
    }
    if (colHasContent) break;
  }

  // Skanowanie z prawej
  for (right = width - 1; right >= left; right--) {
    let colHasContent = false;
    for (let y = top; y <= bottom; y++) {
      const i = (y * width + right) * 4;
      if (!isBackground(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3])) {
        colHasContent = true;
        break;
      }
    }
    if (colHasContent) break;
  }
  
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
};

export const processFilesClientSide = async (filesQueue, options, onProgress) => {
  const zip = new JSZip();
  const { baseName, startNumber, optCrop, optTrimOnly, optAddMargin, optResize } = options;

  let processedCount = 0;

  for (let i = 0; i < filesQueue.length; i++) {
    const fileItem = filesQueue[i];
    const file = fileItem.file;
    
    if (onProgress) onProgress(`Przetwarzanie: ${file.name} (${i + 1}/${filesQueue.length})`);

    try {
      const img = await loadImage(file);
      let canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      let ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // Rysujemy oryginał
      ctx.drawImage(img, 0, 0);

      // Zmienne pomocnicze
      let hasBackgroundContext = false;
      let wasTrimmed = false;

      // 1. DETEKCJA TŁA (dla optCrop - tryb Auto)
      if (optCrop || optTrimOnly) {
          const corners = [
            { x: 0, y: 0 },
            { x: img.width - 1, y: 0 },
            { x: 0, y: img.height - 1 },
            { x: img.width - 1, y: img.height - 1 }
          ];
          const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
          
          for(let corner of corners) {
             const idx = (corner.y * img.width + corner.x) * 4;
             const r = pixels[idx];
             const g = pixels[idx+1];
             const b = pixels[idx+2];
             const a = pixels[idx+3];
             
             // Biały (>230) lub Przezroczysty (<255)
             if ((r > 230 && g > 230 && b > 230) || a < 255) {
                 hasBackgroundContext = true;
                 break;
             }
          }
      }

      // 2. KADROWANIE (Trim)
      if (optCrop || optTrimOnly) {
          const bounds = getTrimmedBounds(ctx, canvas.width, canvas.height);
          if (bounds) {
              if (bounds.width < canvas.width || bounds.height < canvas.height) {
                  wasTrimmed = true;
              }

              const trimmedCanvas = document.createElement('canvas');
              trimmedCanvas.width = bounds.width;
              trimmedCanvas.height = bounds.height;
              const trimmedCtx = trimmedCanvas.getContext('2d');
              
              trimmedCtx.drawImage(
                  canvas, 
                  bounds.x, bounds.y, bounds.width, bounds.height, 
                  0, 0, bounds.width, bounds.height
              );
              
              canvas = trimmedCanvas;
              ctx = trimmedCtx;
          }
      }
      
      // 3. DECYZJA O MARGINESIE
      // Auto: (optCrop && !optTrimOnly) AND (hasBackground OR wasTrimmed)
      const autoMargin = (optCrop && !optTrimOnly && (hasBackgroundContext || wasTrimmed));
      const forceMargin = optAddMargin;
      
      const willAddMargin = autoMargin || forceMargin;
      const marginTotal = willAddMargin ? 10 : 0; // 5px + 5px
      
      // 4. SKALOWANIE DO LIMITU (3000x3600)
      const MAX_W = 3000;
      const MAX_H = 3600;
      const maxContentW = MAX_W - marginTotal;
      const maxContentH = MAX_H - marginTotal;
      
      let currentW = canvas.width;
      let currentH = canvas.height;

      if (currentW > maxContentW || currentH > maxContentH) {
          // Skalowanie zachowujące proporcje (fit inside)
          const scale = Math.min(maxContentW / currentW, maxContentH / currentH);
          
          const newW = Math.floor(currentW * scale);
          const newH = Math.floor(currentH * scale);
          
          const scaledCanvas = document.createElement('canvas');
          scaledCanvas.width = newW;
          scaledCanvas.height = newH;
          const scaledCtx = scaledCanvas.getContext('2d');
          
          // Wysoka jakość skalowania (browser default is usually ok for downscale)
          scaledCtx.drawImage(canvas, 0, 0, newW, newH);
          
          canvas = scaledCanvas;
          ctx = scaledCtx;
          currentW = newW;
          currentH = newH;
      }

      // 5. DODANIE MARGINESU
      if (willAddMargin) {
          const marginCanvas = document.createElement('canvas');
          marginCanvas.width = currentW + 10;
          marginCanvas.height = currentH + 10;
          const marginCtx = marginCanvas.getContext('2d');
          
          marginCtx.fillStyle = '#ffffff';
          marginCtx.fillRect(0, 0, marginCanvas.width, marginCanvas.height);
          
          marginCtx.drawImage(canvas, 5, 5);
          
          canvas = marginCanvas;
          ctx = marginCtx;
          currentW += 10;
          currentH += 10;
      }

      // 6. DOPEŁNIENIE DO 500px (Padding)
      if (optResize) {
          const targetW = Math.max(currentW, 500);
          const targetH = Math.max(currentH, 500);
          
          if (currentW < targetW || currentH < targetH) {
              const paddedCanvas = document.createElement('canvas');
              paddedCanvas.width = targetW;
              paddedCanvas.height = targetH;
              const paddedCtx = paddedCanvas.getContext('2d');
              
              paddedCtx.fillStyle = '#ffffff';
              paddedCtx.fillRect(0, 0, targetW, targetH);
              
              const dx = Math.floor((targetW - currentW) / 2);
              const dy = Math.floor((targetH - currentH) / 2);
              
              paddedCtx.drawImage(canvas, dx, dy);
              
              canvas = paddedCanvas;
              ctx = paddedCtx;
          }
      }

      // Finalne spłaszczenie na białe tło
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = canvas.width;
      finalCanvas.height = canvas.height;
      const finalCtx = finalCanvas.getContext('2d');
      finalCtx.fillStyle = '#ffffff';
      finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      finalCtx.drawImage(canvas, 0, 0);

      const blob = await new Promise(resolve => finalCanvas.toBlob(resolve, 'image/jpeg', 0.95));
      
      const fileName = `${baseName}-${startNumber + i}.jpg`;
      zip.file(fileName, blob);
      
      processedCount++;

    } catch (err) {
      console.error('Błąd przetwarzania klienta:', err);
      if (onProgress) onProgress(`Błąd: ${file.name}`);
    }
  }

  if (onProgress) onProgress('Pakowanie ZIP...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return zipBlob;
};
