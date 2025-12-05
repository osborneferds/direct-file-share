document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const userFile = document.getElementById('userFile');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const errorMessage = document.getElementById('errorMessage');
    const linkContainer = document.getElementById('linkContainer');
    const submitButton = uploadForm.querySelector('button');

    uploadForm.addEventListener('submit', async (event) => {
        // 1. Prevent the default form submission which causes the page to reload.
        event.preventDefault();

        // Clear previous results and errors.
        qrCodeContainer.innerHTML = '';
        linkContainer.innerHTML = '';
        errorMessage.textContent = '';

        // Check if a file is selected.
        if (!userFile.files || userFile.files.length === 0) {
            errorMessage.textContent = 'Please select a file to upload.';
            return;
        }

        // 2. Create a FormData object to send the file.
        const formData = new FormData();
        formData.append('userFile', userFile.files[0]);

        // Provide user feedback during upload
        submitButton.disabled = true;
        submitButton.textContent = 'Uploading...';

        try {
            // 3. Send the file to the server in the background.
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                // Handle errors from the server (e.g., file type not allowed).
                throw new Error(result.error || 'An unknown error occurred.');
            }

            // 4. On success, generate and display the QR code.
            const qr = qrcode(0, 'L');
            qr.addData(result.downloadUrl);
            qr.make();
            qrCodeContainer.innerHTML = qr.createImgTag(6, 8); // (size, margin)

            // Also display the link for easy copying
            const linkElement = document.createElement('a');
            linkElement.href = result.downloadUrl;
            linkElement.textContent = result.downloadUrl;
            linkElement.className = 'download-link';
            linkContainer.appendChild(linkElement);

        } catch (error) {
            // Display any network or server errors to the user.
            console.error('Upload failed:', error);
            errorMessage.textContent = `Upload failed: ${error.message}`;
        } finally {
            // Always re-enable the button and restore its text
            submitButton.disabled = false;
            submitButton.textContent = 'Generate QR Code';
        }
    });
});