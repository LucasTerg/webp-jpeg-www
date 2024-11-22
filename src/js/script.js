document
  .getElementById('upload-form')
  .addEventListener('submit', async event => {
    event.preventDefault();

    const fileInput = document.getElementById('file-input');
    if (!fileInput.files.length) {
      alert('Proszę wybrać zdjęcia!');
      return;
    }

    const formData = new FormData();
    Array.from(fileInput.files).forEach(file =>
      formData.append('images', file)
    );

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const downloadLink = document.getElementById('download-link');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.style.display = 'inline-block';
        downloadLink.textContent = 'Pobierz spakowane zdjęcia';
        downloadLink.download = 'cropped_images.zip';
      } else {
        alert('Wystąpił błąd podczas przetwarzania zdjęć.');
      }
    } catch (error) {
      console.error('Błąd:', error);
      alert('Nie udało się połączyć z serwerem.');
    }
  });
