document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const dropZone = document.getElementById('dropZone');
    const userFile = document.getElementById('userFile');
    const dropZonePrompt = document.querySelector('.drop-zone-prompt');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const errorMessage = document.getElementById('errorMessage');
    const linkContainer = document.getElementById('linkContainer');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const downloadLink = document.getElementById('downloadLink');
    const copyButton = document.getElementById('copyButton');
    const cancelButton = document.getElementById('cancelButton');
    const submitButton = uploadForm.querySelector('button');

    // Variable to hold the request so we can cancel it
    let currentXhr = null;

    // --- Drag and Drop Logic ---

    // Make the drop zone clickable to trigger the file input
    dropZone.addEventListener('click', () => {
        userFile.click();
    });

    // Add visual feedback when dragging over
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    // Remove visual feedback when leaving the drop zone
    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, () => {
            dropZone.classList.remove('drag-over');
        });
    });

    // Handle the file drop
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        // If files were dropped, assign them to the input field
        if (e.dataTransfer.files.length) {
            userFile.files = e.dataTransfer.files;
            // Trigger the change event manually to show preview
            userFile.dispatchEvent(new Event('change'));
        }
    });

    // --- File Input Change (for preview) ---
    userFile.addEventListener('change', () => {
        // Clear any existing preview
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '#';
        
        if (userFile.files && userFile.files[0]) {
            const file = userFile.files[0];

            // Update the drop zone text to show the selected filename
            dropZonePrompt.textContent = file.name;
            dropZone.classList.add('has-file');

            // Check if the selected file is an image
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();

                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreviewContainer.style.display = 'block';
                };

                reader.readAsDataURL(file);
            }
        } else {
            // No file selected, reset the prompt
            dropZonePrompt.textContent = 'Drag & Drop a file here, or click to select';
            dropZone.classList.remove('has-file');
        }
    });

    // --- Form Submission Logic ---
    const handleUpload = (event) => {
        event.preventDefault();

        // Clear previous results and errors.
        qrCodeContainer.innerHTML = '';
        progressContainer.style.display = 'none';
        linkContainer.style.display = 'none';
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

        // 3. Use XMLHttpRequest to handle upload and track progress.
        const xhr = new XMLHttpRequest();
        currentXhr = xhr; // Store the request

        // Listen for progress events
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                progressContainer.style.display = 'block';
                progressBar.style.width = percentComplete + '%';
                progressBar.textContent = percentComplete + '%';
            }
        });

        // Listen for upload completion
        xhr.addEventListener('load', () => {
            // Always re-enable the button and restore its text
            submitButton.disabled = false;
            currentXhr = null; // Clear the stored request
            submitButton.textContent = 'Generate QR Code';

            try {
                const result = JSON.parse(xhr.responseText);

                if (xhr.status < 200 || xhr.status >= 300) {
                    throw new Error(result.error || 'An unknown error occurred.');
                }

                // Construct the full, correct URL on the client side.
                const fullDownloadUrl = `${window.location.origin}${result.downloadUrl}`;

                // Hide the preview now that the upload is complete
                imagePreviewContainer.style.display = 'none';

                // 4. On success, generate and display the QR code.
                const qr = qrcode(0, 'L');
                qr.addData(fullDownloadUrl);
                qr.make();
                qrCodeContainer.innerHTML = qr.createImgTag(6, 8); // (size, margin)

                // Display the link and copy button
                downloadLink.href = fullDownloadUrl;
                downloadLink.textContent = fullDownloadUrl;
                linkContainer.style.display = 'flex';

                copyButton.textContent = 'Copy'; // Reset button text
                copyButton.onclick = () => {
                    navigator.clipboard.writeText(fullDownloadUrl).then(() => {
                        copyButton.textContent = 'Copied!';
                        setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
                    }).catch(err => console.error('Failed to copy link:', err));
                };
            } catch (error) {
                console.error('Upload failed:', error);
                errorMessage.textContent = `Upload failed: ${error.message}`;
            }
        });

        // Listen for upload errors
        xhr.addEventListener('error', () => {
            submitButton.disabled = false;
            submitButton.textContent = 'Generate QR Code';
            currentXhr = null;
            errorMessage.textContent = 'Upload failed. A network error occurred.';
        });

        // Listen for cancellation
        xhr.addEventListener('abort', () => {
            submitButton.disabled = false;
            submitButton.textContent = 'Generate QR Code';
            currentXhr = null;
            progressContainer.style.display = 'none';
            errorMessage.textContent = 'Upload cancelled.';
        });

        // Configure and send the request
        xhr.open('POST', '/upload', true);
        xhr.send(formData);
    };
    
    uploadForm.addEventListener('submit', handleUpload);
    cancelButton.addEventListener('click', () => {
        if (currentXhr) {
            currentXhr.abort();
        }
    });
});