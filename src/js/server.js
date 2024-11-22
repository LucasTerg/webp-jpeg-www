import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Ustalanie __dirname dla ES modułów
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express(); // Inicjalizacja aplikacji Express
const upload = multer({ dest: path.join(__dirname, 'uploads') });

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
app.post('/upload', upload.array('images'), async (req, res) => {
  const outputDir = path.join(__dirname, 'output');
  const zipPath = path.join(__dirname, 'cropped_images.zip');

  try {
    // Utwórz folder wyjściowy, jeśli nie istnieje
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Sprawdzenie, czy pliki zostały przesłane
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nie przesłano żadnych plików.' });
    }

    // Przetwarzanie każdego przesłanego pliku
    for (const file of req.files) {
      const inputPath = file.path;
      const outputPath = path.join(
        outputDir,
        `${path.basename(file.originalname, '.webp')}.jpg`
      );

      try {
        console.log(`Przetwarzanie pliku: ${inputPath}`);
        await sharp(inputPath)
          .trim()
          .flatten({ background: '#ffffff' }) // Ustaw białe tło
          .jpeg({ quality: 100, progressive: true })
          .toFile(outputPath);

        console.log(`Zapisano plik: ${outputPath}`);
        fs.unlinkSync(inputPath); // Usuń plik tymczasowy
      } catch (err) {
        console.error(`Błąd przetwarzania pliku ${file.originalname}:`, err);
      }
    }

    // Tworzenie pliku ZIP
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipPath);

    // Obsługa zdarzeń na strumieniu ZIP
    output.on('close', () => {
      console.log(
        'Plik ZIP zamknięty. Łączny rozmiar:',
        archive.pointer() + ' bajtów'
      );
    });

    output.on('end', () => {
      console.log('Strumień danych ZIP zakończony.');
    });

    archive.on('warning', err => {
      if (err.code === 'ENOENT') {
        console.warn('Ostrzeżenie podczas tworzenia ZIP:', err);
      } else {
        throw err;
      }
    });

    archive.on('error', err => {
      console.error('Błąd podczas tworzenia ZIP:', err);
      res.status(500).send('Błąd podczas tworzenia pliku ZIP.');
    });

    archive.pipe(output);
    archive.directory(outputDir, false);

    console.log('Tworzenie pliku ZIP...');
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
});

// Obsługa błędnych tras
app.use((req, res) => {
  res.status(404).json({ error: 'Nie znaleziono żądanej ścieżki.' });
});

// Uruchom serwer na porcie 3000
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie http://localhost:${PORT}`);
});
