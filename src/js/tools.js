// import { processFilesClientSide } from './client-processor.js'; // USUNIĘTE (Dynamic import poniżej)

// alert("Tools script loaded!");

let filesQueue = [];

// --- HELPER: SKRACANIE NAZWY PLIKU ---
const truncateFileName = (name, maxLength = 18) => {
  if (name.length <= maxLength) return name;
  
  const parts = name.split('.');
  const extension = parts.length > 1 ? `.${parts.pop()}` : ''; // Weź rozszerzenie
  const baseName = parts.join('.'); // Reszta nazwy
  
  const startChars = 8; // Ile znaków z początku
  const endChars = 6;   // Ile znaków z końca (przed rozszerzeniem)
  
  // Jeśli nazwa bazowa jest bardzo krótka, ale ma rozszerzenie
  if (baseName.length <= startChars) {
      return `${baseName.substring(0, startChars)}...${extension}`;
  }

  return `${baseName.substring(0, startChars)}...${baseName.substring(baseName.length - endChars)}${extension}`;
};


let dropzone, fileInput, fileList, clearBtn, executeBtn, consoleLog, themeToggle, processingModeSelect, baseNameInput, startNumberInput, optCrop, optTrimOnly, optAddMargin, optResize, optBgRemove;

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded - initializing Tools");

    // Elementy DOM
    dropzone = document.getElementById('file-dropzone');
    fileInput = document.getElementById('file-input');
    fileList = document.getElementById('file-list');
    clearBtn = document.getElementById('clear-list');
    executeBtn = document.getElementById('execute-btn');
    consoleLog = document.getElementById('console-log');
    themeToggle = document.getElementById('theme-toggle');
    processingModeSelect = document.getElementById('processing-mode');

    // Ustawienia
    baseNameInput = document.getElementById('base-name');
    startNumberInput = document.getElementById('start-number');
    optCrop = document.getElementById('opt-crop');
    optTrimOnly = document.getElementById('opt-trim-only');
    optAddMargin = document.getElementById('opt-add-margin');
    optResize = document.getElementById('opt-resize');
    // optBgRemove = document.getElementById('opt-bg-remove');

    // --- DETEKCJA ELECTRONA (Desktop) ---
    if (window.electronAPI) {
        document.body.classList.add('is-electron');
        log('Tryb Desktop (Electron) aktywny.');
        
        // Ustawienia domyślne dla desktopu
        if (optTrimOnly) optTrimOnly.checked = true; // Prio domyślnie włączone
        if (optCrop) optCrop.checked = false;        // Zwykłe kadrowanie wyłączone
    }

    // --- THEME SWITCH INIT ---
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            log(`Zmiana motywu na: ${next}`);
        });
    }

    // --- OBSŁUGA DRAG & DROP ---
    if(dropzone && fileInput) {
        dropzone.addEventListener('click', () => {
            console.log("Dropzone clicked");
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            addFiles(e.target.files);
            fileInput.value = ''; 
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
    } else {
        console.error("Brak elementu dropzone lub fileInput!");
    }

    if(clearBtn) {
        clearBtn.addEventListener('click', () => {
            filesQueue = [];
            renderList();
            log('Lista wyczyszczona.');
        });
    }

    // --- SANITYZACJA I SCHOWEK ---
    if(baseNameInput) {
        const updateFromClipboard = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    const cleanText = sanitizeName(text);
                    // Aktualizuj jeśli tekst jest poprawny i inny niż obecny
                    if (cleanText && baseNameInput.value !== cleanText) {
                        baseNameInput.value = cleanText;
                        baseNameInput.classList.add('flash-input');
                        setTimeout(() => baseNameInput.classList.remove('flash-input'), 500);
                        log(`Wklejono ze schowka: ${cleanText}`);
                    }
                }
            } catch (err) {
                // Ignoruj błędy (np. brak uprawnień)
            }
        };

        // Reakcja na najechanie (standardowe działanie)
        baseNameInput.addEventListener('mouseenter', updateFromClipboard);
        
        // Reakcja na kliknięcie (dla pewności/alternatywy)
        baseNameInput.addEventListener('click', updateFromClipboard);
        
        // Reakcja na focus elementu (np. tabowanie)
        baseNameInput.addEventListener('focus', updateFromClipboard);

        // Reakcja na powrót do okna przeglądarki (jeśli mysz jest nad inputem)
        window.addEventListener('focus', () => {
            if (baseNameInput.matches(':hover')) {
                updateFromClipboard();
            }
        });

        baseNameInput.addEventListener('input', () => {
            const original = baseNameInput.value;
            const sanitized = sanitizeName(original);
            if (original !== sanitized) {
                baseNameInput.value = sanitized;
            }
        });
    }

    // --- WYKONANIE (UPLOAD) ---
    if(executeBtn) {
        executeBtn.addEventListener('click', async () => {
            executeLogic();
        });
    }
});

// --- LOGOWANIE ---
function log(message) {
  if(!consoleLog) return;
  const p = document.createElement('p');
  p.textContent = `> ${message}`;
  consoleLog.appendChild(p);
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

// --- SANITYZACJA ---
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

// --- ZARZĄDZANIE PLIKAMI ---

function renderList() {
  if(!fileList) return;
  fileList.innerHTML = '';
  filesQueue.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    
    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'file-select';
    checkbox.checked = item.selected;
    checkbox.onchange = (e) => {
        item.selected = e.target.checked;
    };

    // Info Name with Hover Preview
    const span = document.createElement('span');
    span.className = 'file-info';
    const displayedFileName = truncateFileName(item.file.name); // Użycie funkcji skracającej
    span.textContent = `[${index + 1}] ${displayedFileName} (${(item.file.size / 1024).toFixed(1)} KB) (${item.width}x${item.height} px)`;
    span.title = item.file.name; // Pełna nazwa w tooltipie
    
    // Hover Eventy
    span.addEventListener('mouseenter', (e) => showPreview(e, item.file));
    span.addEventListener('mouseleave', hidePreview);
    span.addEventListener('mousemove', movePreview); // Żeby tooltip chodził za myszką

    // Controls
    const divControls = document.createElement('div');
    divControls.className = 'file-controls';
    
    divControls.innerHTML = `
        <button class="btn btn-sm" onclick="window.moveUp(${index})">▲</button>
        <button class="btn btn-sm" onclick="window.moveDown(${index})">▼</button>
        <button class="btn btn-sm" onclick="window.removeFile(${index})" style="color:var(--error-color); border-color:var(--error-color);">X</button>
    `;

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(divControls);
    fileList.appendChild(li);
  });
}

// --- PODGLĄD ZDJĘĆ ---
const tooltip = document.getElementById('preview-tooltip');

function showPreview(e, file) {
    if(!tooltip) return;
    
    // Tworzymy URL tylko na chwilę
    const url = URL.createObjectURL(file);
    tooltip.innerHTML = `<img src="${url}" alt="Preview">`;
    tooltip.style.display = 'block';
    
    // Pozycjonowanie wstępne
    movePreview(e);
}

function movePreview(e) {
    if(!tooltip) return;
    // Przesunięcie o 15px żeby nie zasłaniać kursora
    const x = e.clientX + 15;
    const y = e.clientY + 15;
    
    // Sprawdzenie czy nie wychodzi poza ekran (proste)
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function hidePreview() {
    if(!tooltip) return;
    tooltip.style.display = 'none';
    tooltip.innerHTML = ''; // Czyścimy img żeby zwolnić pamięć (browser garbage collector)
}


// Helper do ładowania obrazu i pobierania wymiarów
const loadImageDimensions = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src); // Zwolnienie pamięci po załadowaniu
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

async function addFiles(files) { // <--- make it async
  const filesToAdd = [];
  for (const file of Array.from(files)) { // <--- use for...of for await
    if (file.type.startsWith('image/')) {
      try {
        const { width, height } = await loadImageDimensions(file); // <--- await dimensions
        filesToAdd.push({
          file,
          id: Date.now() + Math.random(),
          selected: true,
          width, // <--- add width
          height // <--- add height
        });
        log(`Dodano: ${file.name} (${width}x${height} px)`);
      } catch (error) {
        log(`BŁĄD podczas wczytywania wymiarów pliku ${file.name}: ${error.message}`);
      }
    } else {
      log(`BŁĄD: ${file.name} nie jest obrazem.`);
    }
  }
  filesQueue.push(...filesToAdd); // <--- push all at once
  renderList();
}

// Funkcje globalne
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
  const targetItem = filesQueue[index];
  
  if (targetItem.selected) {
      // GRUPOWE USUWANIE: Jeśli kliknięto na zaznaczony element, usuń WSZYSTKIE zaznaczone
      const initialCount = filesQueue.length;
      filesQueue = filesQueue.filter(item => !item.selected);
      const removedCount = initialCount - filesQueue.length;
      log(`Usunięto zaznaczone pliki: ${removedCount}`);
  } else {
      // POJEDYNCZE USUWANIE: Kliknięto na niezaznaczony element -> usuń tylko jego
      log(`Usunięto: ${targetItem.file.name}`);
      filesQueue.splice(index, 1);
  }
  renderList();
};

// Zaktualizowana funkcja executeLogic uwzględniająca TYLKO zaznaczone pliki
async function executeLogic() {
  // Filtrowanie
  const selectedFiles = filesQueue.filter(item => item.selected);

  if (selectedFiles.length === 0) {
    log('BŁĄD: Brak zaznaczonych plików do przetworzenia.');
    return;
  }

  const baseName = baseNameInput.value.trim() || 'image';
  const startNum = parseInt(startNumberInput.value) || 1;
  const mode = processingModeSelect.value;

  log(`Rozpoczynanie procedury dla ${selectedFiles.length} plików (${mode === 'local' ? 'LOKALNIE' : 'SERWER'})...`);

  // --- TRYB ELECTRON (Desktop) ---
  if (window.electronAPI) {
      log('Wykryto środowisko Desktop (Electron). Używam natywnego przetwarzania...');
      
      // Debugowanie ścieżek
      // W Electronie obiekt File ma właściwość .path (pełna ścieżka)
      let filePaths = selectedFiles.map(item => {
          if (!item.file.path) {
              log(`OSTRZEŻENIE: Brak ścieżki dla pliku: ${item.file.name}. Sprawdź uprawnienia lub metodę dodawania.`);
              // Próba fallbacku dla niektórych wersji Electrona (czasem path jest w innym miejscu)
              return null; 
          }
          return item.file.path;
      }).filter(path => path !== null);

      if (filePaths.length === 0) {
          log('BŁĄD: Nie udało się pobrać ścieżek plików. Operacja przerwana.');
          return;
      }
      
      log(`Wysyłanie ${filePaths.length} plików do procesu głównego...`);
      
      const options = { 
          baseName, 
          startNumber: startNum, 
          optCrop: optCrop.checked, 
          optTrimOnly: optTrimOnly.checked,
          optAddMargin: optAddMargin.checked,
          optResize: optResize.checked 
      };

      // Rejestracja listenera logów (jeśli jeszcze nie dodany)
      if (!window.electronLogListenerAdded) {
          window.electronAPI.onLog((msg) => log(msg));
          window.electronLogListenerAdded = true;
      }

      try {
          const result = await window.electronAPI.processImages(filePaths, options);
          if (result.success) {
              log(`SUKCES: Zapisano w katalogu: ${result.path}`);
          } else {
              log(`BŁĄD: ${result.message}`);
          }
      } catch (e) {
          log(`BŁĄD KRYTYCZNY: ${e.message}`);
      }
      return;
  }

  if (mode === 'local') {
    const options = { 
      baseName, 
      startNumber: startNum, 
      optCrop: optCrop.checked, 
      optTrimOnly: optTrimOnly.checked,
      optAddMargin: optAddMargin.checked,
      optResize: optResize.checked 
    };

    try {
      const { processFilesClientSide } = await import('./client-processor.js');
      // Przekazujemy tylko zaznaczone!
      const zipBlob = await processFilesClientSide(selectedFiles, options, (msg) => log(msg));
      
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      log('SUKCES: Gotowe (Lokalnie).');
    } catch (e) {
      log(`BŁĄD LOKALNY: ${e.message}`);
    }
    return;
  }

  // SERVER MODE
  const formData = new FormData();
  selectedFiles.forEach((item) => {
    formData.append('images', item.file);
  });
  formData.append('newName', baseName);
  formData.append('startNumber', startNum);
  formData.append('optCrop', optCrop.checked);
  formData.append('optTrimOnly', optTrimOnly.checked);
  formData.append('optAddMargin', optAddMargin.checked);
  formData.append('optResize', optResize.checked);

  try {
    const API_URL = 'http://localhost:3000/upload-tools';
    const response = await fetch(API_URL, { method: 'POST', body: formData });

    if (response.ok) {
      log('SUKCES: Pliki przetworzone.');
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
}