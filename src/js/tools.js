let filesQueue = [];

// Elementy DOM
const dropzone = document.getElementById('file-dropzone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const clearBtn = document.getElementById('clear-list');
const executeBtn = document.getElementById('execute-btn');
const consoleLog = document.getElementById('console-log');
const themeToggle = document.getElementById('theme-toggle');

// Ustawienia
const baseNameInput = document.getElementById('base-name');
const startNumberInput = document.getElementById('start-number');
const optCrop = document.getElementById('opt-crop');
const optResize = document.getElementById('opt-resize');
const optBgRemove = document.getElementById('opt-bg-remove'); // Obecnie działa jak crop+flag

// --- LOGOWANIE ---
function log(message) {
  const p = document.createElement('p');
  p.textContent = `> ${message}`;
  consoleLog.appendChild(p);
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

// --- SANITYZACJA I SCHOWEK ---
const sanitizeName = str => {
  const map = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
  };
  let processed = str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, match => map[match]);
  processed = processed.replace(/[^a-zA-Z0-9]/g, '-');
  processed = processed.replace(/-+/g, '-');
  processed = processed.replace(/^-+|-+$/g, '');
  return processed;
};

baseNameInput.addEventListener('mouseenter', async () => {
  if (baseNameInput.value.trim() !== '') return; // Nie nadpisuj, jeśli coś jest wpisane

  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      const cleanText = sanitizeName(text);
      if (cleanText) {
        baseNameInput.value = cleanText;
        baseNameInput.classList.add('flash-input'); // Opcjonalny efekt wizualny
        setTimeout(() => baseNameInput.classList.remove('flash-input'), 500);
        log(`Wklejono ze schowka: ${cleanText}`);
      }
    }
  } catch (err) {
    // Ignoruj błędy (np. brak fokusu, brak uprawnień), żeby nie spamować, 
    // ale można zalogować raz
    // log('Info: Nie można odczytać schowka (brak uprawnień?).');
  }
});

baseNameInput.addEventListener('input', () => {
  const original = baseNameInput.value;
  const sanitized = sanitizeName(original);
  if (original !== sanitized) {
    baseNameInput.value = sanitized;
  }
});

// --- ZARZĄDZANIE PLIKAMI ---

function renderList() {
  fileList.innerHTML = '';
  filesQueue.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    
    li.innerHTML = `
      <span class="file-info">[${index + 1}] ${item.file.name} (${(item.file.size / 1024).toFixed(1)} KB)</span>
      <div class="file-controls">
        <button class="btn btn-sm" onclick="window.moveUp(${index})">▲</button>
        <button class="btn btn-sm" onclick="window.moveDown(${index})">▼</button>
        <button class="btn btn-sm" onclick="window.removeFile(${index})" style="color:var(--error-color); border-color:var(--error-color);">X</button>
      </div>
    `;
    fileList.appendChild(li);
  });
}

function addFiles(files) {
  Array.from(files).forEach(file => {
    // Prosta walidacja typu
    if (file.type.startsWith('image/')) {
      filesQueue.push({ file, id: Date.now() + Math.random() });
      log(`Dodano: ${file.name}`);
    } else {
      log(`BŁĄD: ${file.name} nie jest obrazem.`);
    }
  });
  renderList();
}

// Funkcje globalne (dla onclick w HTML)
window.moveUp = (index) => {
  if (index > 0) {
    [filesQueue[index - 1], filesQueue[index]] = [filesQueue[index], filesQueue[index - 1]];
    renderList();
  }
};

window.moveDown = (index) => {
  if (index < filesQueue.length - 1) {
    [filesQueue[index + 1], filesQueue[index]] = [filesQueue[index], filesQueue[index + 1]];
    renderList();
  }
};

window.removeFile = (index) => {
  log(`Usunięto: ${filesQueue[index].file.name}`);
  filesQueue.splice(index, 1);
  renderList();
};

// --- OBSŁUGA DRAG & DROP ---

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  fileInput.value = ''; // Reset inputa
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'var(--accent-color)';
});

dropzone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'var(--border-color)';
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'var(--border-color)';
  addFiles(e.dataTransfer.files);
});

clearBtn.addEventListener('click', () => {
  filesQueue = [];
  renderList();
  log('Lista wyczyszczona.');
});

// --- WYKONANIE (UPLOAD) ---

executeBtn.addEventListener('click', async () => {
  if (filesQueue.length === 0) {
    log('BŁĄD: Brak plików do przetworzenia.');
    return;
  }

  const baseName = baseNameInput.value.trim() || 'image';
  const startNum = parseInt(startNumberInput.value) || 1;

  log('Rozpoczynanie procedury uploadu...');
  
  const formData = new FormData();
  
  // Dodajemy pliki w kolejności z listy
  filesQueue.forEach((item) => {
    formData.append('images', item.file);
  });

  // Dodajemy parametry konfiguracyjne
  formData.append('newName', baseName);
  formData.append('startNumber', startNum);
  formData.append('optCrop', optCrop.checked);
  formData.append('optResize', optResize.checked);
  // formData.append('optBgRemove', optBgRemove.checked); // Na razie tożsame z crop w naszej logice serwera, ale wyślemy

  try {
    // Zakładam, że serwer nasłuchuje na porcie 3000 (lokalnie) lub relatywnie
    const API_URL = 'http://localhost:3000/upload-tools'; // Nowy endpoint dla narzędzi
    
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      log('SUKCES: Pliki przetworzone.');
      
      // Pobieranie bloba (ZIP)
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      log('Rozpoczęto pobieranie archiwum.');
    } else {
      const errText = await response.text();
      log(`BŁĄD SERWERA: ${errText}`);
    }
  } catch (error) {
    log(`BŁĄD SIECI: ${error.message}`);
  }
});

// --- THEME SWITCH ---
// Inicjalizacja motywu
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  log(`Zmiana motywu na: ${next}`);
});
