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

// Funkcja do zamiany polskich znaków na odpowiedniki bez ogonków
const replacePolishChars = str => {
  return str
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z')
    .replace(/Ą/g, 'A')
    .replace(/Ć/g, 'C')
    .replace(/Ę/g, 'E')
    .replace(/Ł/g, 'L')
    .replace(/Ń/g, 'N')
    .replace(/Ó/g, 'O')
    .replace(/Ś/g, 'S')
    .replace(/Ź/g, 'Z')
    .replace(/Ż/g, 'Z')
    .replace(/\(/g, '') // remove left parenthesis
    .replace(/\)/g, ''); // remove right parenthesis
};

// Funkcja do zamiany spacji na "-"
const replaceSpaces = str => str.replace(/\s+/g, '-');

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
    const sanitizedName = replaceSpaces(replacePolishChars(newName));
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

      // Przetwarzanie każdego przesłanego pliku
      const processingPromises = req.files.map((file, index) => {
        const inputPath = file.path;
        const outputPath = path.join(outputDir, `${newName}-${index + 1}.jpg`);

        return sharp(inputPath)
          .trim() // Kadrowanie
          .flatten({ background: '#ffffff' }) // Ustaw białe tło
          .jpeg({ quality: 98, progressive: true })
          .toFile(outputPath)
          .then(() => {
            console.log(`Zapisano plik: ${outputPath}`);
            return fsPromises.unlink(inputPath); // Usuń plik tymczasowy
          })
          .catch(err => {
            console.error(
              `Błąd przetwarzania pliku ${file.originalname}:`,
              err
            );
          });
      });
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

// Obsługa błędnych tras
app.use((req, res) => {
  res.status(404).json({ error: 'Nie znaleziono żądanej ścieżki.' });
});

// Uruchom serwer na porcie 3000
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie http://localhost:${PORT}`);
});
