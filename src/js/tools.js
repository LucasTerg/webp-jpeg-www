// import { processFilesClientSide } from './client-processor.js'; // USUNIĘTE (Dynamic import poniżej)

// alert("Tools script loaded!");

let filesQueue = [];

// --- HELPER: SKRACANIE NAZWY PLIKU ---
const truncateFileName = (name, maxLength = 18) => {
  if (name.length <= maxLength) return name;
  
  const parts = name.split('.');
  const extension = parts.length > 1 ? `.${parts.pop()}` : '';
  const baseName = parts.join('.');
  
  const startChars = 8; 
  const endChars = 6; 
  
  if (baseName.length <= startChars) {
      return `${baseName.substring(0, startChars)}...${extension}`;
  }

  return `${baseName.substring(0, startChars)}...${baseName.substring(baseName.length - endChars)}${extension}`;
};


let dropzone, fileInput, fileList, clearBtn, executeBtn, consoleLog, themeToggle, processingModeSelect, baseNameInput, startNumberInput;
// Nowe kontrolki
let optAddMargin, optResize, optOverwrite;
let modeSmart, modeSimple, modeNone;

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
    
    // Nowe Radio Buttons
    modeSmart = document.getElementById('mode-smart');
    modeSimple = document.getElementById('mode-simple');
    modeNone = document.getElementById('mode-none');

    // Checkboxy Post-process
    optAddMargin = document.getElementById('opt-add-margin');
    optResize = document.getElementById('opt-resize');
    optOverwrite = document.getElementById('opt-overwrite');

    // --- DETEKCJA ELECTRONA (Desktop) ---
    if (window.electronAPI) {
        document.body.classList.add('is-electron');
        log('Tryb Desktop (Electron) aktywny.');
        
        // Ustawienia domyślne dla desktopu
        // Domyślnie zaznaczony w HTML jest modeSimple, więc tu nic nie musimy robić
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
        // baseNameInput.addEventListener('click', updateFromClipboard); // Wyłączone bo denerwuje przy edycji
        baseNameInput.addEventListener('focus', updateFromClipboard);

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
    const displayedFileName = truncateFileName(item.file.name); 
    span.textContent = `[${index + 1}] ${displayedFileName} (${(item.file.size / 1024).toFixed(1)} KB) (${item.width}x${item.height} px)`;
    span.title = item.file.name;
    
    // Hover Eventy
    span.addEventListener('mouseenter', (e) => showPreview(e, item.file));
    span.addEventListener('mouseleave', hidePreview);
    span.addEventListener('mousemove', movePreview);

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
    
    const url = URL.createObjectURL(file);
    tooltip.innerHTML = `<img src="${url}" alt="Preview">`;
    tooltip.style.display = 'block';
    
    movePreview(e);
}

function movePreview(e) {
    if(!tooltip) return;
    const x = e.clientX + 15;
    const y = e.clientY + 15;
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function hidePreview() {
    if(!tooltip) return;
    tooltip.style.display = 'none';
    tooltip.innerHTML = '';
}


const loadImageDimensions = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

async function addFiles(files) {
  const filesToAdd = [];
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      try {
        const { width, height } = await loadImageDimensions(file);
        filesToAdd.push({
          file,
          id: Date.now() + Math.random(),
          selected: true,
          width, 
          height
        });
        log(`Dodano: ${file.name} (${width}x${height} px)`);
      } catch (error) {
        log(`BŁĄD podczas wczytywania wymiarów pliku ${file.name}: ${error.message}`);
      }
    } else {
      log(`BŁĄD: ${file.name} nie jest obrazem.`);
    }
  }
  filesQueue.push(...filesToAdd);
  renderList();
}

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
      const initialCount = filesQueue.length;
      filesQueue = filesQueue.filter(item => !item.selected);
      const removedCount = initialCount - filesQueue.length;
      log(`Usunięto zaznaczone pliki: ${removedCount}`);
  } else {
      log(`Usunięto: ${targetItem.file.name}`);
      filesQueue.splice(index, 1);
  }
  renderList();
};

// Zaktualizowana funkcja executeLogic
async function executeLogic() {
  const selectedFiles = filesQueue.filter(item => item.selected);

  if (selectedFiles.length === 0) {
    log('BŁĄD: Brak zaznaczonych plików do przetworzenia.');
    return;
  }

  const baseName = baseNameInput.value.trim() || 'image';
  const startNum = parseInt(startNumberInput.value) || 1;
  const mode = processingModeSelect.value;

  // Ustalanie flag na podstawie Radio Buttons
  const isSmart = modeSmart.checked;
  const isSimple = modeSimple.checked;
  const isNone = modeNone.checked;

  // Mapowanie na stare flagi
  const optCropValue = isSmart;
  const optTrimOnlyValue = isSimple;
  // isNone = false i false

  log(`Rozpoczynanie procedury dla ${selectedFiles.length} plików...`);

  // --- TRYB ELECTRON (Desktop) ---
  if (window.electronAPI) {
      log('Wykryto środowisko Desktop (Electron). Używam natywnego przetwarzania...');
      
      let filePaths = selectedFiles.map(item => {
          let path = null;
          if (window.electronAPI.getPathForFile) {
              path = window.electronAPI.getPathForFile(item.file);
          }
          if (!path) path = item.file.path;

          if (!path) {
              log(`OSTRZEŻENIE: Brak ścieżki dla pliku: ${item.file.name}. Sprawdź uprawnienia lub metodę dodawania.`);
              return null; 
          }
          return path;
      }).filter(path => path !== null);

      if (filePaths.length === 0) {
          log('BŁĄD: Nie udało się pobrać ścieżek plików. Operacja przerwana.');
          return;
      }
      
      log(`Wysyłanie ${filePaths.length} plików do procesu głównego...`);
      
      const options = { 
          baseName, 
          startNumber: startNum, 
          optCrop: optCropValue, 
          optTrimOnly: optTrimOnlyValue,
          optAddMargin: optAddMargin.checked,
          optResize: optResize.checked,
          optOverwrite: optOverwrite.checked // Nowa opcja
      };

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

  // --- TRYB LOCAL (Web) - Tutaj mamy mniejsze możliwości ---
  if (mode === 'local') {
    const options = { 
      baseName, 
      startNumber: startNum, 
      optCrop: optCropValue, 
      optTrimOnly: optTrimOnlyValue,
      optAddMargin: optAddMargin.checked,
      optResize: optResize.checked 
    };

    try {
      const { processFilesClientSide } = await import('./client-processor.js');
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

  // SERVER MODE (Dla kompatybilności, ale w Electronie nie używany)
  // ... (pomijam kod serwera webowego, bo w Electronie go nie używamy)
}
