// import { processFilesClientSide } from './client-processor.js'; // USUNIĘTE (Dynamic import poniżej)

// alert("Tools script loaded!");

let filesQueue = [];
let dropzone, fileInput, fileList, clearBtn, executeBtn, consoleLog, themeToggle, processingModeSelect, baseNameInput, startNumberInput, optCrop, optResize, optBgRemove;

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
    optResize = document.getElementById('opt-resize');
    // optBgRemove = document.getElementById('opt-bg-remove');

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
        baseNameInput.addEventListener('mouseenter', async () => {
            if (baseNameInput.value.trim() !== '') return;
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    const cleanText = sanitizeName(text);
                    if (cleanText) {
                        baseNameInput.value = cleanText;
                        baseNameInput.classList.add('flash-input');
                        setTimeout(() => baseNameInput.classList.remove('flash-input'), 500);
                        log(`Wklejono ze schowka: ${cleanText}`);
                    }
                }
            } catch (err) {}
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
            // ... (logika executeBtn przeniesiona tutaj, korzystająca ze zmiennych z closure)
            executeLogic();
        });
    }
});

// Funkcja pomocnicza dla execute, żeby nie robić gigantycznego zagnieżdżenia
async function executeLogic() {
  if (filesQueue.length === 0) {
    log('BŁĄD: Brak plików do przetworzenia.');
    return;
  }

  const baseName = baseNameInput.value.trim() || 'image';
  const startNum = parseInt(startNumberInput.value) || 1;
  const mode = processingModeSelect.value;

  log(`Rozpoczynanie procedury (${mode === 'local' ? 'LOKALNIE' : 'SERWER'})...`);

  if (mode === 'local') {
    const options = { 
      baseName, 
      startNumber: startNum, 
      optCrop: optCrop.checked, 
      optResize: optResize.checked 
    };

    try {
      const { processFilesClientSide } = await import('./client-processor.js');
      const zipBlob = await processFilesClientSide(filesQueue, options, (msg) => log(msg));
      
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
  filesQueue.forEach((item) => {
    formData.append('images', item.file);
  });
  formData.append('newName', baseName);
  formData.append('startNumber', startNum);
  formData.append('optCrop', optCrop.checked);
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
    if (file.type.startsWith('image/')) {
      filesQueue.push({ file, id: Date.now() + Math.random() });
      log(`Dodano: ${file.name}`);
    } else {
      log(`BŁĄD: ${file.name} nie jest obrazem.`);
    }
  });
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
  log(`Usunięto: ${filesQueue[index].file.name}`);
  filesQueue.splice(index, 1);
  renderList();
};