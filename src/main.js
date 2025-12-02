// Funkcja do dynamicznego ładowania plików HTML
async function loadPartials() {
  // Pobierz wszystkie elementy z atrybutem data-load
  const loadElements = document.querySelectorAll('[data-load]');

  for (const element of loadElements) {
    const src = element.getAttribute('src');
    if (!src) continue;

    try {
      const response = await fetch(src);
      if (!response.ok) {
        console.error(`Nie udało się załadować ${src}: ${response.status}`);
        element.innerHTML = `<p>Błąd ładowania: ${src}</p>`;
        continue;
      }

      const content = await response.text();
      element.innerHTML = content;

      // Opcjonalnie: obsługa dynamicznych ścieżek, np. data-icon-path
      const iconPath = element.getAttribute('data-icon-path');
      if (iconPath) {
        const icon = element.querySelector('[data-icon]');
        if (icon) icon.setAttribute('src', iconPath);
      }
    } catch (error) {
      console.error(`Błąd ładowania ${src}:`, error);
      element.innerHTML = `<p>Błąd ładowania: ${src}</p>`;
    }
  }
}

// Wywołaj funkcję po załadowaniu DOM
document.addEventListener('DOMContentLoaded', () => {
  loadPartials();

  // --- OBSŁUGA MOTYWU ---
  const savedTheme = localStorage.getItem('theme') || 'light'; // Główna strona domyślnie light
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Obsługa przycisku (delegacja, bo przycisk może być w partialu ładowanym dynamicznie lub statycznie)
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('#theme-toggle-main')) {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    }
  });
});
