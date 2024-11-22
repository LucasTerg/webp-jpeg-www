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

// Domyślna ścieżka dla GET /
app.get('/', (req, res) => {
  res.send(
    '<h1>Serwer działa!</h1><p>Wszystkie zapytania wysyłaj na /upload.</p>'
  );
});

// Endpoint do przesyłania i przetwarzania zdjęć
app.post('/upload', upload.array('images'), async (req, res) => {
  const outputDir = path.join(__dirname, 'output');
  const zipPath = path.join(__dirname, 'cropped_images.zip');

  // Utwórz folder wyjściowy, jeśli nie istnieje
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  try {
    for (const file of req.files) {
      const inputPath = file.path;
      const outputPath = path.join(
        outputDir,
        `${path.basename(file.originalname, '.webp')}.jpg`
      );

      await sharp(inputPath)
        .trim()
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 100, progressive: true })
        .toFile(outputPath);

      fs.unlinkSync(inputPath); // Usuń plik tymczasowy
    }

    // Tworzenie pliku ZIP
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipPath);

    archive.pipe(output);
    archive.directory(outputDir, false);
    await archive.finalize();

    // Wysyłanie pliku ZIP do klienta
    res.download(zipPath, () => {
      fs.rmSync(outputDir, { recursive: true, force: true }); // Usuń folder wyjściowy
      fs.unlinkSync(zipPath); // Usuń plik ZIP
    });
  } catch (error) {
    console.error('Błąd podczas przetwarzania zdjęć:', error);
    res.status(500).send('Wystąpił błąd podczas przetwarzania zdjęć.');
  }
});

// Uruchom serwer na porcie 3000
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
