document
  .getElementById('upload-form')
  .addEventListener('submit', async event => {
    event.preventDefault();

    const fileInput = document.getElementById('file-input');
    const fileNameInput = document.getElementById('file-name');
    if (!fileInput.files.length) {
      alert('Proszę wybrać zdjęcia!');
      return;
    }

    const formData = new FormData();
    Array.from(fileInput.files).forEach(file =>
      formData.append('images', file)
    );

    // Dodaj nazwę pliku do formData
    formData.append('newName', fileNameInput.value);

    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = 'Rozpoczynanie przetwarzania...';

    try {
      const response = await fetch('http://localhost:3000/upload', {
        // Zmiana URL na właściwy backend
        method: 'POST',
        body: formData,
      });

      //     if (response.ok) {
      //       const blob = await response.blob();
      //       const downloadLink = document.getElementById('download-link');
      //       downloadLink.href = URL.createObjectURL(blob);
      //       downloadLink.style.display = 'inline-block';
      //       downloadLink.textContent = 'Pobierz spakowane zdjęcia';
      //       downloadLink.download = 'cropped_images.zip';
      //     } else {
      //       alert('Wystąpił błąd podczas przetwarzania zdjęć.');
      //     }
      //   } catch (error) {
      //     console.error('Błąd:', error);
      //     alert('Nie udało się połączyć z serwerem.');
      //   }
      // });

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          // Handle JSON response
          const jsonResponse = await response.json();
          console.log('Server response:', jsonResponse);
          // Handle the JSON response as needed
          progressText.textContent = 'Przetwarzanie zakończone!';
          progressDetails.textContent = 'Serwer zwrócił dane JSON.';
        } else {
          // Handle non-JSON response (e.g., file download)
          const blob = await response.blob();
          const downloadLink = document.getElementById('download-link');
          downloadLink.href = URL.createObjectURL(blob);
          downloadLink.style.display = 'inline-block';
          downloadLink.textContent = 'Pobierz spakowane zdjęcia';
          downloadLink.download = 'cropped_images.zip';
        }

        progressText.textContent = 'Przetwarzanie zakończone!';
      } else {
        const errorText = await response.text();
        throw new Error(
          `Błąd serwera: ${response.status} ${response.statusText}\n${errorText}`
        );
      }
    } catch (error) {
      console.error('Błąd:', error);
      alert(`Wystąpił błąd: ${error.message}`);
      progressText.textContent = 'Wystąpił błąd podczas przetwarzania.';
    }
  });
