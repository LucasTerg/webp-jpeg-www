import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import archiver from 'archiver';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Ustalanie __dirname dla ES modułów
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express(); // Inicjalizacja aplikacji Express

// Funkcja do sanityzacji nazwy pliku (polskie znaki, znaki specjalne, wielokrotne myślniki)
const sanitizeName = str => {
  const map = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
  };
  
  // 1. Zamiana polskich znaków
  let processed = str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, match => map[match]);

  // 2. Zamiana wszystkich znaków niebędących literami ani cyframi na myślnik
  // (obejmuje spacje, !@#$%^&*() itp.)
  processed = processed.replace(/[^a-zA-Z0-9]/g, '-');

  // 3. Redukcja wielokrotnych myślników do jednego
  processed = processed.replace(/-+/g, '-');

  // 4. Usunięcie myślników z początku i końca
  processed = processed.replace(/^-+|-+$/g, '');

  return processed;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const newName = req.body.newName || 'default';
    const sanitizedName = sanitizeName(newName);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(
      null,
      `${sanitizedName}-${uniqueSuffix}${path.extname(file.originalname)}`
    );
  },
});
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/tiff',
      'image/avif',
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true); // Akceptuj plik
    } else if (file.mimetype === 'application/pdf') {
      cb(new Error('Pliki PDF nie są obsługiwane.')); // Odrzuć PDF-y
    } else {
      cb(new Error('Nieobsługiwany typ pliku.')); // Odrzuć inne nieobsługiwane typy
    }
  },
});

app.use(cors()); // Middleware CORS
app.use(express.json()); // Obsługa JSON w żądaniach

// Domyślna ścieżka dla GET /
app.get('/', (req, res) => {
  res.send(`
    <h1>Serwer działa!</h1>
    <p>Wszystkie zapytania wysyłaj na <code>/upload</code>.</p>
  `);
});

// Endpoint do przesyłania i przetwarzania zdjęć
app.post(
  '/upload',
  (req, res, next) => {
    upload.array('images')(req, res, err => {
      if (err) {
        if (err.message === 'Pliki PDF nie są obsługiwane.') {
          return res.status(400).json({
            error:
              'Pliki PDF nie są obsługiwane. Prześlij obrazy w formacie JPEG, PNG, GIF, TIFF lub WebP.',
          });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    const outputDir = path.join(__dirname, 'output');
    const zipPath = path.join(__dirname, 'cropped_images.zip');
    const newName = req.body.newName || 'image'; //Uzyj nowej nazwy

    try {
      // Utwórz folder wyjściowy, jeśli nie istnieje
      await fsPromises.mkdir(outputDir, { recursive: true });

      // Sprawdzenie, czy pliki zostały przesłane
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nie przesłano żadnych plików.' });
      }

      // Przetwarzanie każdego przesłanego pliku -------------------

      // const processingPromises = req.files.map((file, index) => {
      //   const inputPath = file.path;
      //   const outputPath = path.join(outputDir, `${newName}-${index + 1}.jpg`);

      //   return sharp(inputPath)
      //     .trim() // Kadrowanie
      //     .flatten({ background: '#ffffff' }) // Ustaw białe tło
      //     .jpeg({ quality: 99, progressive: true, optimiseScans: true }) //})
      //     .toFile(outputPath)
      //     .then(() => {
      //       console.log(`Zapisano plik: ${outputPath}`);
      //       return fsPromises.unlink(inputPath); // Usuń plik tymczasowy
      //     })
      //     .catch(err => {
      //       console.error(
      //         `Błąd przetwarzania pliku ${file.originalname}:`,
      //         err
      //       );
      //     });
      // });



      const processingPromises = req.files.map(async (file, index) => {
        const inputPath = file.path;
        const outputPath = path.join(outputDir, `${newName}-${index + 1}.jpg`);

        try {
          const inputImage = sharp(inputPath);
          const metadata = await inputImage.metadata();
          const { width, height } = metadata;

          // 1. Sprawdź 4 rogi pod kątem białego tła LUB przezroczystości
          // Definiujemy punkty do sprawdzenia: TL, TR, BL, BR
          const corners = [
            { left: 0, top: 0 },
            { left: width - 1, top: 0 },
            { left: 0, top: height - 1 },
            { left: width - 1, top: height - 1 },
          ];

          let hasBackgroundContext = false;
          // Sprawdzamy każdy róg
          for (const corner of corners) {
            const pixelBuffer = await inputImage
              .clone()
              .extract({
                left: corner.left,
                top: corner.top,
                width: 1,
                height: 1,
              })
              .toBuffer();

            const r = pixelBuffer[0];
            const g = pixelBuffer[1];
            const b = pixelBuffer[2];
            // Sprawdź kanał alfa, jeśli istnieje (długość bufora 4 dla RGBA)
            const a = pixelBuffer.length >= 4 ? pixelBuffer[3] : 255;

            // Biały: RGB > 230
            const isWhite = r > 230 && g > 230 && b > 230;
            // Przezroczysty: Alpha < 255 (zakładamy, że jeśli jest jakakolwiek przezroczystość, to jest to tło)
            const isTransparent = a < 255;

            if (isWhite || isTransparent) {
              hasBackgroundContext = true;
              break; // Wystarczy jeden taki róg
            }
          }

          // 2. Kadruj (trim) i sprawdź czy wymiary się zmieniły
          const trimmedData = await inputImage
            .clone()
            .trim()
            .toBuffer({ resolveWithObject: true });

          let currentImage = sharp(trimmedData.data);
          let currentWidth = trimmedData.info.width;
          let currentHeight = trimmedData.info.height;

          const wasTrimmed = currentWidth < width || currentHeight < height;

          // 3. Decyzja o marginesie
          const shouldAddMargin = hasBackgroundContext || wasTrimmed;
          const marginAdd = shouldAddMargin ? 10 : 0;

          // --- NOWA LOGIKA: Ograniczenie wymiarów (3000x3600) ---
          // Limit globalny: 3000x3600.
          // Jeśli (current + margin) > Limit, skalujemy treść PRZED dodaniem marginesu.
          const MAX_W = 3000;
          const MAX_H = 3600;
          
          if ((currentWidth + marginAdd) > MAX_W || (currentHeight + marginAdd) > MAX_H) {
             const maxContentW = MAX_W - marginAdd;
             const maxContentH = MAX_H - marginAdd;
             
             // Resize (fit inside, withoutEnlargement)
             // Używamy currentImage (który jest już 'sharp' instance)
             currentImage = currentImage.resize({
               width: maxContentW,
               height: maxContentH,
               fit: 'inside',
               withoutEnlargement: true
             });
             
             // Musimy zaktualizować currentWidth/Height dla dalszej logiki paddingu (min 500)
             // Pobranie metadanych przerywa pipeline, więc zrobimy to bufferem
             const resizedBuffer = await currentImage.toBuffer({ resolveWithObject: true });
             currentImage = sharp(resizedBuffer.data);
             currentWidth = resizedBuffer.info.width;
             currentHeight = resizedBuffer.info.height;
          }

          if (shouldAddMargin) {
            currentImage = currentImage.extend({
              top: 5,
              bottom: 5,
              left: 5,
              right: 5,
              background: '#ffffff',
            });
            currentWidth += 10;
            currentHeight += 10;
          }

          // 4. Dopełnij do 500px jeśli mniej (BEZ SKALOWANIA - padding)
          const targetWidth = Math.max(currentWidth, 500);
          const targetHeight = Math.max(currentHeight, 500);

          if (currentWidth < targetWidth || currentHeight < targetHeight) {
            const xPad = targetWidth - currentWidth;
            const yPad = targetHeight - currentHeight;
            const left = Math.floor(xPad / 2);
            const top = Math.floor(yPad / 2);

            currentImage = currentImage.extend({
              top: top,
              bottom: yPad - top,
              left: left,
              right: xPad - left,
              background: '#ffffff',
            });
          }

          // 5. Zapisz
          await currentImage
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 99, progressive: true, optimiseScans: true })
            .toFile(outputPath);

          console.log(`Zapisano plik: ${outputPath}`);
          await fsPromises.unlink(inputPath); 
        } catch (err) {
          console.error(`Błąd przetwarzania pliku ${file.originalname}:`, err);
          try {
            if (fs.existsSync(inputPath)) await fsPromises.unlink(inputPath);
          } catch (e) {}
        }
      });
// ----------------------------------------------------------------

      await Promise.all(processingPromises);

      // Tworzenie pliku ZIP
      const archive = archiver('zip', { zlib: { level: 9 } });
      const output = fs.createWriteStream(zipPath);

      output.on('close', () => {
        console.log(`Plik ZIP zamknięty. Rozmiar: ${archive.pointer()} bajtów`);
      });

      archive.on('error', err => {
        console.error('Błąd podczas tworzenia ZIP:', err);
        throw err;
      });

      archive.pipe(output);
      archive.directory(outputDir, false);
      await archive.finalize();

      console.log('Plik ZIP gotowy:', zipPath);

      // Wysyłanie pliku ZIP do klienta
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="cropped_images.zip"'
      );
      res.setHeader('Content-Type', 'application/zip');

      const zipStream = fs.createReadStream(zipPath);
      zipStream.pipe(res);

      zipStream.on('end', () => {
        console.log('Plik ZIP pobrany przez klienta. Czyszczenie...');
        fs.rmSync(outputDir, { recursive: true, force: true }); // Usuń folder wyjściowy
        fs.unlinkSync(zipPath); // Usuń plik ZIP
      });

      zipStream.on('error', err => {
        console.error('Błąd podczas przesyłania pliku ZIP:', err);
        res.status(500).send('Błąd podczas przesyłania pliku ZIP.');
      });
    } catch (error) {
      console.error('Błąd podczas przetwarzania żądania:', error);
      res
        .status(500)
        .json({ error: 'Wystąpił błąd podczas przetwarzania żądania.' });
    }
  }
);

// Endpoint dla narzędzi (Tools)
app.post(
  '/upload-tools',
  (req, res, next) => {
    upload.array('images')(req, res, err => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    const outputDir = path.join(__dirname, 'output-tools');
    const zipPath = path.join(__dirname, 'processed_tools.zip');
    const newName = req.body.newName || 'image';
    
    // Parsowanie opcji (FormData przesyła jako stringi 'true'/'false')
    const startNumber = parseInt(req.body.startNumber) || 1;
    const optCrop = req.body.optCrop === 'true';
    const optResize = req.body.optResize === 'true'; // Dopełnienie do 500px

    try {
      await fsPromises.mkdir(outputDir, { recursive: true });

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nie przesłano żadnych plików.' });
      }

      const processingPromises = req.files.map(async (file, index) => {
        const inputPath = file.path;
        // Logika numeracji: startNumber + index (może być ujemna)
        const currentNum = startNumber + index;
        const outputPath = path.join(outputDir, `${newName}-${currentNum}.jpg`);

        try {
          let image = sharp(inputPath);
          const metadata = await image.metadata();
          let { width, height } = metadata;

          // --- LOGIKA KADROWANIA I MARGINESU (jeśli zaznaczona) ---
          if (optCrop) {
             // 1. Sprawdź 4 rogi
            const corners = [
              { left: 0, top: 0 },
              { left: width - 1, top: 0 },
              { left: 0, top: height - 1 },
              { left: width - 1, top: height - 1 },
            ];

            let hasBackgroundContext = false;
            for (const corner of corners) {
              const pixelBuffer = await image
                .clone()
                .extract({ left: corner.left, top: corner.top, width: 1, height: 1 })
                .toBuffer();
              const a = pixelBuffer.length >= 4 ? pixelBuffer[3] : 255;
              const isWhite = pixelBuffer[0] > 230 && pixelBuffer[1] > 230 && pixelBuffer[2] > 230;
              if (isWhite || a < 255) {
                hasBackgroundContext = true;
                break;
              }
            }

            // 2. Trim
            const trimmedData = await image
              .clone()
              .trim()
              .toBuffer({ resolveWithObject: true });
            
            image = sharp(trimmedData.data);
            let currentWidth = trimmedData.info.width;
            let currentHeight = trimmedData.info.height;
            const wasTrimmed = currentWidth < width || currentHeight < height;

            // 3. Margines
            const shouldAddMargin = hasBackgroundContext || wasTrimmed;
            const marginAdd = shouldAddMargin ? 10 : 0;

            // --- LIMIT WYMIARÓW 3000x3600 (Tools) ---
            const MAX_W = 3000;
            const MAX_H = 3600;
            
            if ((currentWidth + marginAdd) > MAX_W || (currentHeight + marginAdd) > MAX_H) {
               const maxContentW = MAX_W - marginAdd;
               const maxContentH = MAX_H - marginAdd;
               
               image = image.resize({
                 width: maxContentW,
                 height: maxContentH,
                 fit: 'inside',
                 withoutEnlargement: true
               });
               
               // Aktualizacja metadanych
               const resizedBuffer = await image.toBuffer({ resolveWithObject: true });
               image = sharp(resizedBuffer.data);
               currentWidth = resizedBuffer.info.width;
               currentHeight = resizedBuffer.info.height;
            }

            if (shouldAddMargin) {
              image = image.extend({
                top: 5, bottom: 5, left: 5, right: 5,
                background: '#ffffff'
              });
              // Aktualizacja zmiennych pomocniczych nie jest konieczna bo image chain leci dalej
            }
          }

          // Pobieramy zaktualizowane metadane po ew. kadrowaniu, aby resize działał poprawnie
          const bufferAfterCrop = await image.toBuffer({ resolveWithObject: true });
          image = sharp(bufferAfterCrop.data);
          width = bufferAfterCrop.info.width;
          height = bufferAfterCrop.info.height;

          // --- LOGIKA RESIZE (Dopełnienie do 500px - BEZ SKALOWANIA) ---
          if (optResize) {
             const targetWidth = Math.max(width, 500);
             const targetHeight = Math.max(height, 500);
             
             if (width < targetWidth || height < targetHeight) {
               const xPad = targetWidth - width;
               const yPad = targetHeight - height;
               const left = Math.floor(xPad / 2);
               const top = Math.floor(yPad / 2);
               
               image = image.extend({
                 top: top,
                 bottom: yPad - top,
                 left: left,
                 right: xPad - left,
                 background: '#ffffff'
               });
             }
          }

          // Zapis
          await image
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 99, progressive: true, optimiseScans: true })
            .toFile(outputPath);

          await fsPromises.unlink(inputPath);
        } catch (err) {
          console.error(`Błąd (Tools) ${file.originalname}:`, err);
          try { if (fs.existsSync(inputPath)) await fsPromises.unlink(inputPath); } catch(e){}
        }
      });

      await Promise.all(processingPromises);

      // ZIPowanie (wspólna logika)
      const archive = archiver('zip', { zlib: { level: 9 } });
      const output = fs.createWriteStream(zipPath);

      output.on('close', () => console.log('ZIP gotowy (Tools).'));
      archive.pipe(output);
      archive.directory(outputDir, false);
      await archive.finalize();

      res.setHeader('Content-Disposition', 'attachment; filename="processed.zip"');
      res.setHeader('Content-Type', 'application/zip');
      
      const zipStream = fs.createReadStream(zipPath);
      zipStream.pipe(res);

      zipStream.on('end', () => {
        fs.rmSync(outputDir, { recursive: true, force: true });
        fs.unlinkSync(zipPath);
      });

    } catch (error) {
      console.error('Błąd (Tools):', error);
      res.status(500).json({ error: 'Błąd przetwarzania.' });
    }
  }
);

// Obsługa błędnych tras
app.use((req, res) => {
  res.status(404).json({ error: 'Nie znaleziono żądanej ścieżki.' });
});

// Uruchom serwer na porcie 3000
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie http://localhost:${PORT}`);
});
